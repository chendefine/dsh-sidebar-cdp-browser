/**
 * The single-endpoint model (v0.1.1): the address comes from a source (the
 * web-UI setting) instead of a profile list, and /open issues tickets
 * without profile claims.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_CDP_ENDPOINT, resolveCdpLiveConfig } from '../src/config.ts'
import { defaultFrameValues } from '../src/frame-settings.ts'
import { EndpointManager } from '../src/cdp/endpoint-manager.ts'
import { createHttpHandlers, createTicketRegistry, type HttpRequest, type HttpResponse } from '../src/routes/http.ts'

describe('single endpoint source', () => {
  it('resolves the endpoint through the source with the default fallback', () => {
    let raw = ''
    const endpoints = new EndpointManager(resolveCdpLiveConfig({}), () => raw)
    expect(endpoints.endpoint).toBe(DEFAULT_CDP_ENDPOINT)
    raw = ' 192.168.1.5:9223 '
    expect(endpoints.endpoint).toBe('http://192.168.1.5:9223/')
    raw = 'wss://cdp.example.com/proxy'
    expect(endpoints.endpoint).toBe('wss://cdp.example.com/proxy')
    raw = 'ftp://nope'
    expect(() => endpoints.endpoint).toThrow(/unsupported/i)
  })

  it('reports no endpoint change while nothing is connected', async () => {
    let raw = ''
    const endpoints = new EndpointManager(resolveCdpLiveConfig({}), () => raw)
    raw = 'http://10.0.0.9:9222/'
    await expect(endpoints.applyEndpointChange()).resolves.toBe(false)
    expect(endpoints.ready()).toBe(false)
  })
})

describe('open route (single endpoint)', () => {
  const tickets = createTicketRegistry(30_000)

  function request(body: unknown, extraHeaders: Record<string, string> = {}): HttpRequest {
    const payload = JSON.stringify(body)
    return {
      method: 'POST',
      url: '/dsh-cdp-live/api/open',
      headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'sec-fetch-site': 'same-origin', ...extraHeaders },
      async *[Symbol.asyncIterator]() { yield payload },
    }
  }

  function response(): HttpResponse & { status: number; body: string } {
    const state = { status: 0, body: '' }
    return {
      writeHead: (status: number) => { state.status = status },
      end: (chunk?: string) => { state.body += chunk ?? '' },
      get status() { return state.status },
      get body() { return state.body },
    } as HttpResponse & { status: number; body: string }
  }

  const handlers = createHttpHandlers({
    tickets,
    hasSession: sessionId => sessionId === 'live-session',
    frameConfig: defaultFrameValues,
  })

  it('issues a ticket without profile claims', async () => {
    const res = response()
    await handlers.open(request({ sessionId: 'live-session', mode: 'interactive' }), res)
    const parsed = JSON.parse(res.body) as { ok: boolean; value: { ticket: string; wsPath: string } }
    expect(res.status).toBe(200)
    expect(parsed.ok).toBe(true)
    expect(parsed.value.wsPath).toBe('/sidebar/ws/cdp-live')
    const claims = tickets.consume(parsed.value.ticket)
    expect(claims).toMatchObject({ sessionId: 'live-session', mode: 'interactive' })
    expect(claims).not.toHaveProperty('profileId')
  })

  it('keeps the trust fence and rejects legacy profile payloads', async () => {
    const fenced = response()
    await handlers.open(request({ sessionId: 'live-session', mode: 'observe' }, { 'sec-fetch-site': 'cross-site' }), fenced)
    expect(fenced.status).toBe(403)
    // v0.2.x clients sent profileId; the strict schema refuses the stale field.
    const legacy = response()
    await handlers.open(request({ sessionId: 'live-session', profileId: 'local', mode: 'observe' }), legacy)
    expect(legacy.status).toBe(400)
    const unknown = response()
    await handlers.open(request({ sessionId: 'missing', mode: 'observe' }), unknown)
    expect(unknown.status).toBe(404)
  })
})
