import { WebSocketServer, type WebSocket } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { TicketClaims, TicketRegistry } from './http.ts'
import { isTrustedRequest } from '../trust-fence.ts'

export interface CdpSession {
  attach(claims: TicketClaims, ws: WebSocket): Promise<void> | void
  close(): Promise<void> | void
}

export interface UpgradeRequest {
  url?: string
  headers: Record<string, string | string[] | undefined>
}

export interface UpgradeSocket { write(chunk: string): boolean; destroy(): void }

export function createCdpWebSocketRoute(
  tickets: TicketRegistry,
  session: CdpSession,
  trustedHosts: readonly string[] = [],
) {
  const server = new WebSocketServer({ noServer: true, maxPayload: 1_100_000, perMessageDeflate: false })

  /**
   * Reject an upgrade with a real HTTP status instead of a bare destroy: a
   * destroyed socket surfaces in the browser as an unexplained 1006, while a
   * written status shows up as "Unexpected response code: <status>" in the
   * console — the difference between a five-second and a one-hour diagnosis.
   * Origin is deliberately NOT required: sanctioned reverse-proxy deployments
   * rewrite Host to loopback and strip Origin entirely (their fence pattern),
   * so the gate here is the trust fence (Host + cross-site markers) plus the
   * single-use ticket bound to session/mode — the same posture as the
   * better-sidebar terminal upgrade, with a stronger ticket on top.
   */
  const refuse = (socket: UpgradeSocket, status: number, reason: string): void => {
    socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`)
    socket.destroy()
  }

  return {
    path: '/sidebar/ws/cdp-live',
    handle(req: UpgradeRequest, socket: UpgradeSocket, head: Uint8Array): void {
      if (!isTrustedRequest(req, trustedHosts)) return refuse(socket, 403, 'Forbidden')
      let url: URL
      try { url = new URL(req.url ?? '/', 'http://dsh.internal') }
      catch { return refuse(socket, 400, 'Bad Request') }
      if (url.pathname !== '/sidebar/ws/cdp-live') return refuse(socket, 404, 'Not Found')
      const ticket = url.searchParams.get('ticket')
      const claims = ticket === null ? undefined : tickets.consume(ticket)
      if (claims === undefined) return refuse(socket, 401, 'Unauthorized')
      server.handleUpgrade(req as unknown as IncomingMessage, socket as unknown as Duplex, Buffer.from(head), ws => {
        void Promise.resolve(session.attach(claims, ws)).catch(error => {
          ws.close(1011, error instanceof Error ? error.message.slice(0, 120) : 'CDP session failed')
        })
      })
    },
    async close(): Promise<void> {
      for (const client of server.clients) client.close(1001, 'plugin shutdown')
      await new Promise<void>(resolve => server.close(() => resolve()))
      await session.close()
    },
  }
}

export const WEBSOCKET_ROUTE = '/sidebar/ws/cdp-live' as const
