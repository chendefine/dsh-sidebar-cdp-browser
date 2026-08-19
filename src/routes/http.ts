import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { isTrustedRequest } from '../trust-fence.ts'

export interface HttpRequest {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  [Symbol.asyncIterator](): AsyncIterator<string | Uint8Array>
}

export interface HttpResponse {
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string | Uint8Array): void
}

export interface OpenRequest {
  sessionId: string
  mode: 'observe' | 'interactive'
}

export interface TicketClaims extends OpenRequest {
  issuedAt: number
  expiresAt: number
}

export interface TicketRegistry {
  issue(input: OpenRequest): { ticket: string; expiresAt: number }
  consume(ticket: string): TicketClaims | undefined
  revoke(ticket: string): boolean
  clear(): void
}

export function createTicketRegistry(ttlMs: number, now: () => number = Date.now): TicketRegistry {
  const entries = new Map<string, TicketClaims>()
  const prune = (): void => {
    const time = now()
    for (const [ticket, claims] of entries) if (claims.expiresAt <= time) entries.delete(ticket)
  }
  return {
    issue(value) {
      prune()
      const issuedAt = now()
      const ticket = randomBytes(32).toString('base64url')
      const claims = { ...value, issuedAt, expiresAt: issuedAt + ttlMs }
      entries.set(ticket, claims)
      return { ticket, expiresAt: claims.expiresAt }
    },
    consume(ticket) {
      prune()
      const claims = entries.get(ticket)
      entries.delete(ticket)
      return claims !== undefined && claims.expiresAt > now() ? { ...claims } : undefined
    },
    revoke(ticket) { return entries.delete(ticket) },
    clear() { entries.clear() },
  }
}

const openSchema = z.object({
  sessionId: z.string().min(1).max(256),
  mode: z.enum(['observe', 'interactive']).default('observe'),
}).strict()

async function readBody(req: HttpRequest, maxBytes = 64 * 1024): Promise<unknown> {
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of req) {
    const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk
    size += bytes.byteLength
    if (size > maxBytes) throw new Error('request body too large')
    chunks.push(bytes)
  }
  if (size === 0) return {}
  const joined = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder().decode(joined)) as unknown
}

function send(res: HttpResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(value))
}

export interface HttpRouteDeps {
  tickets: TicketRegistry
  hasSession(sessionId: string): boolean
}

export function createHttpHandlers(deps: HttpRouteDeps, trustedHosts: readonly string[] = []) {
  return {
    async open(req: HttpRequest, res: HttpResponse): Promise<void> {
      if (!isTrustedRequest(req, trustedHosts)) return send(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: { code: 'method', message: 'method not allowed' } })
      try {
        const parsed = openSchema.parse(await readBody(req))
        if (!deps.hasSession(parsed.sessionId)) return send(res, 404, { ok: false, error: { code: 'session-not-found', message: 'session not found' } })
        const issued = deps.tickets.issue(parsed)
        return send(res, 200, {
          ok: true,
          value: {
            protocolVersion: 1,
            ticket: issued.ticket,
            expiresAt: issued.expiresAt,
            wsPath: '/sidebar/ws/cdp-live',
          },
        })
      } catch (error) {
        return send(res, 400, { ok: false, error: { code: 'bad-request', message: error instanceof Error ? error.message : 'invalid request' } })
      }
    },
  }
}

export const HTTP_ROUTES = {
  open: '/dsh-cdp-live/api/open',
} as const
