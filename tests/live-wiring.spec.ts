/**
 * End-to-end wiring of the single-endpoint model (v0.1.1), exercised against
 * real loopback HTTP/WS servers up to the CDP dial boundary: the fake
 * settings document (what better-sidebar would serve) flows through the
 * inject seam into the dial address, and a settings commit hot-swaps it.
 * The config route serves the same seam for the frame-capture overrides.
 *
 * The "fake Chromium" servers answer /json/version with distinguishable
 * errors (404 vs 500) so the WebSocket close reason proves WHICH address the
 * host dialed — everything past the dial (puppeteer) is unchanged code.
 */
import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { apply, HTTP_ROUTES, WEBSOCKET_ROUTE, type CdpLiveHostContext } from '../src/index.ts'

interface FakeFace { settings: { get(ns: string): unknown } }
type RegisteredRoute = Parameters<CdpLiveHostContext['webServer']['register']>[0]
type UpgradeRoute = Parameters<CdpLiveHostContext['webServer']['registerUpgrade']>[0]

describe('single-endpoint live wiring', () => {
  let server: Server
  let face: FakeFace
  let prefs: Record<string, unknown>
  let eventListener: ((...args: unknown[]) => void) | undefined
  let openRoute: RegisteredRoute | undefined
  let configRoute: RegisteredRoute | undefined
  let upgradeRoute: UpgradeRoute | undefined
  let chromiumA: Server
  let chromiumB: Server
  let base = 'http://127.0.0.1:1'
  /** Plugin disposers, released in afterAll (calling them early would tear
   * down the WebSocketServer — upgrades then answer 503 by ws design). */
  const disposers: Array<() => void> = []

  const setPrefs = (blob: Record<string, unknown>): void => {
    prefs = { pluginSettings: { 'dsh-sidebar-cdp-browser:live': blob } }
  }

  beforeAll(async () => {
    // Two distinguishable fake Chromium discovery endpoints.
    chromiumA = createServer((req, res) => { res.writeHead(404).end() })
    chromiumB = createServer((req, res) => { res.writeHead(500).end() })
    await Promise.all([
      new Promise<void>(resolve => chromiumA.listen(0, '127.0.0.1', () => resolve())),
      new Promise<void>(resolve => chromiumB.listen(0, '127.0.0.1', () => resolve())),
    ])

    setPrefs({ endpoint: `http://127.0.0.1:${(chromiumA.address() as { port: number }).port}` })
    face = { settings: { get: (ns: string) => (ns === 'dsh-better-sidebar' ? prefs : undefined) } }

    let injected: ((face: FakeFace) => void) | undefined
    const ctx: CdpLiveHostContext = {
      webServer: {
        register: route => {
          if (route.path === HTTP_ROUTES.open) openRoute = route
          if (route.path === HTTP_ROUTES.config) configRoute = route
          return () => {}
        },
        registerUpgrade: route => { upgradeRoute = route; return () => {} },
      },
      sessions: { get: id => (id === 's1' ? {} : undefined) },
      webRuntime: { trustedHosts: [] },
      effect: fn => { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose) },
      inject: (names, body) => { if (names.includes('settings')) injected = body; return () => {} },
      on: (_event, listener) => { eventListener = listener; return () => {} },
    }
    apply(ctx, {})
    expect(injected).toBeTypeOf('function')
    injected?.(face)
    expect(upgradeRoute).toBeDefined()
    expect(configRoute).toBeDefined()

    server = createServer((req, res) => {
      if (openRoute !== undefined && req.url === HTTP_ROUTES.open) void openRoute.handler(req, res)
      else if (configRoute !== undefined && req.url === HTTP_ROUTES.config) void configRoute.handler(req, res)
      else res.writeHead(404).end()
    })
    server.on('upgrade', (req, socket, head) => { upgradeRoute?.handler(req, socket, head) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })

  afterAll(async () => {
    for (const dispose of disposers.splice(0)) dispose()
    await Promise.all([
      new Promise<void>(resolve => server.close(() => resolve())),
      new Promise<void>(resolve => chromiumA.close(() => resolve())),
      new Promise<void>(resolve => chromiumB.close(() => resolve())),
    ])
  })

  /** Open a ticket and ride the WS once; resolves with the close (code, reason). */
  async function dialOnce(): Promise<{ code: number; reason: string }> {
    const opened = await fetch(`${base}${HTTP_ROUTES.open}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 's1', mode: 'observe' }),
    }).then(r => r.json() as Promise<{ ok: boolean; value: { ticket: string } }>)
    expect(opened.ok).toBe(true)
    const ws = new WebSocket(`ws://127.0.0.1:${(server.address() as { port: number }).port}${WEBSOCKET_ROUTE}?ticket=${opened.value.ticket}`)
    return await new Promise<{ code: number; reason: string }>(resolve => {
      ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }))
    })
  }

  it('dials the endpoint stored in the settings document', async () => {
    const outcome = await dialOnce()
    // Attach fails at discovery (404) and the socket closes with 1011 + the
    // dial error — proving the UI endpoint reached resolveBrowserWsEndpoint.
    expect(outcome.code).toBe(1011)
    expect(outcome.reason).toContain('CDP discovery failed with HTTP 404')
  }, 20_000)

  it('hot-swaps the dial address when the settings document changes', async () => {
    setPrefs({ endpoint: `http://127.0.0.1:${(chromiumB.address() as { port: number }).port}` })
    eventListener?.('dsh-better-sidebar', 2)
    await new Promise(resolve => setTimeout(resolve, 50))
    const outcome = await dialOnce()
    expect(outcome.reason).toContain('CDP discovery failed with HTTP 500')
  }, 20_000)

  /** Fetch the effective frame config through the config route. */
  async function fetchFrame(): Promise<Record<string, number>> {
    const body = await fetch(`${base}${HTTP_ROUTES.config}`, { headers: { accept: 'application/json' } })
      .then(r => r.json() as Promise<{ ok: boolean; value: { frame: Record<string, number> } }>)
    expect(body.ok).toBe(true)
    return body.value.frame
  }

  it('serves the effective frame config (loader defaults) on the config route', async () => {
    expect(await fetchFrame()).toEqual({ frameQuality: 60, frameEveryNth: 1, frameMaxWidth: 1280, frameMaxHeight: 900 })
    // The trust fence guards the read-only route too.
    const denied = await fetch(`${base}${HTTP_ROUTES.config}`, { headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' } })
    expect(denied.status).toBe(403)
  })

  it('merges web-UI frame overrides over the loader config per key', async () => {
    setPrefs({ frameQuality: 40, frameMaxHeight: 1080, frameEveryNth: 999, endpoint: '127.0.0.1:9222' })
    eventListener?.('dsh-better-sidebar', 3)
    await new Promise(resolve => setTimeout(resolve, 50))
    // Valid overrides win; the out-of-range frameEveryNth keeps the base 1;
    // the untouched frameMaxWidth keeps the loader default.
    expect(await fetchFrame()).toEqual({ frameQuality: 40, frameEveryNth: 1, frameMaxWidth: 1280, frameMaxHeight: 1080 })
  })
})
