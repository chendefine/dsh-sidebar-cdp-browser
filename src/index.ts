import { Config, resolveCdpLiveConfig, type CdpLiveConfig } from './config.ts'
import { readFrameOverrides, resolveFrameValues, sameFrameValues, type FrameFieldOverrides, type FrameFieldValues } from './frame-settings.ts'
import { CdpLiveSession } from './cdp/live-session.ts'
import { EndpointManager } from './cdp/endpoint-manager.ts'
import { createHttpHandlers, createTicketRegistry, HTTP_ROUTES, type HttpRequest, type HttpResponse } from './routes/http.ts'
import { createCdpWebSocketRoute, WEBSOCKET_ROUTE, type CdpSession, type UpgradeRequest, type UpgradeSocket } from './routes/websocket.ts'

export const name = 'dsh-sidebar-cdp-browser'
export const inject = ['webServer', 'sessions', 'webRuntime']
export { Config }

/** The better-sidebar tab descriptor id whose pluginSettings blob holds the UI endpoint. */
export const LIVE_TAB_ID = 'dsh-sidebar-cdp-browser:live'

/** The better-sidebar prefs namespace (registered by dsh-better-sidebar's host half). */
const SIDEBAR_PREFS_NS = 'dsh-better-sidebar'

export interface CdpLiveHostContext {
  webServer: {
    register(route: { kind: 'exact' | 'prefix'; path: string; handler: (req: HttpRequest, res: HttpResponse) => void | Promise<void> }): () => void
    registerUpgrade(route: { path: string; handler: (req: UpgradeRequest, socket: UpgradeSocket, head: Uint8Array) => void }): () => void
  }
  sessions: { get(id: string): unknown }
  webRuntime: { trustedHosts: readonly string[] }
  effect(fn: () => void | (() => void), label?: string): void
  /**
   * Deferred service injection (cordis `ctx.inject`): the body mounts once the
   * named services are available. Used for the optional DSH settings service —
   * without it the endpoint stays at the UI default.
   */
  inject?(names: readonly string[], body: (ctx: { settings: { get(ns: string): unknown } }) => void): unknown
  /** Scoped event listener (cordis `ctx.on`); disposed with the calling fiber. */
  on?(event: string, listener: (...args: unknown[]) => void): unknown
  /** Host logger (the DSH Context carries one); failures are console-logged when absent. */
  logger?: { warn(message: string, ...args: unknown[]): void }
}

export function apply(ctx: CdpLiveHostContext, rawConfig?: CdpLiveConfig): void {
  const config = resolveCdpLiveConfig(rawConfig)
  const tickets = createTicketRegistry(config.ticketTtlMs)
  // The settings source: better-sidebar's prefs document, where the web UI
  // ("Side card → 侧边栏内容 → CDP实时视图") persists pluginSettings. Until the
  // settings service mounts (or when better-sidebar is absent) the raw values
  // stay empty and the manager dials the default loopback address while the
  // frame params keep their loader-config values.
  let readUiSettings: () => Record<string, unknown> = (): Record<string, unknown> => ({})
  const readUiEndpoint = (): string => {
    const raw = readUiSettings().endpoint
    return typeof raw === 'string' ? raw : ''
  }
  const readUiFrameOverrides = (): FrameFieldOverrides => readFrameOverrides(readUiSettings())
  const endpoints = new EndpointManager(config, readUiEndpoint)
  const session = new CdpLiveSession(config, endpoints, readUiFrameOverrides)
  const loggingSession: CdpSession = {
    attach: (claims, ws) => session.attach(claims, ws).catch(error => {
      // Surface attach failures in the host log: the client only sees the
      // 1011 close reason, which is capped at 123 bytes and invisible to
      // whoever operates the DSH process.
      const detail = error instanceof Error ? `${error.message}` : String(error)
      const line = `[dsh-sidebar-cdp-browser] CDP session attach failed: ${detail}`
      if (ctx.logger !== undefined) ctx.logger.warn(line)
      else console.warn(line)
      throw error
    }),
    close: () => session.close(),
  }
  const handlers = createHttpHandlers({
    tickets,
    hasSession: sessionId => ctx.sessions.get(sessionId) !== undefined,
    frameConfig: (): FrameFieldValues => resolveFrameValues(config, readUiFrameOverrides()),
  }, ctx.webRuntime.trustedHosts)
  const ws = createCdpWebSocketRoute(tickets, loggingSession, ctx.webRuntime.trustedHosts)

  ctx.inject?.(['settings'], (face) => {
    readUiSettings = (): Record<string, unknown> => {
      const ns = face.settings.get(SIDEBAR_PREFS_NS) as {
        pluginSettings?: Record<string, Record<string, unknown>>
      } | undefined
      return ns?.pluginSettings?.[LIVE_TAB_ID] ?? {}
    }
    // The last frame config this host acted on (change detection below).
    let lastFrame = resolveFrameValues(config, readUiFrameOverrides())
    // A settings commit may have moved the endpoint or the frame-capture
    // params: drop the stale browser connection / bounce the attached
    // clients so they reconnect (the client's backoff loop re-opens a
    // ticket and re-selects its target with the fresh values).
    ctx.on?.('settings/document-updated', (...args: unknown[]) => {
      if (args[0] !== SIDEBAR_PREFS_NS) return
      void endpoints.applyEndpointChange()
        .then((endpointChanged) => {
          const nextFrame = resolveFrameValues(config, readUiFrameOverrides())
          const frameChanged = !sameFrameValues(lastFrame, nextFrame)
          lastFrame = nextFrame
          if (endpointChanged) session.restart('cdp endpoint changed')
          else if (frameChanged) session.restart('cdp frame settings changed')
        })
        .catch(() => undefined)
    })
  })

  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: HTTP_ROUTES.open, handler: handlers.open }), 'dsh-sidebar-cdp-browser: open route')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: HTTP_ROUTES.config, handler: handlers.config }), 'dsh-sidebar-cdp-browser: config route')
  ctx.effect(() => ctx.webServer.registerUpgrade({ path: WEBSOCKET_ROUTE, handler: ws.handle }), 'dsh-sidebar-cdp-browser: websocket route')
  ctx.effect(() => () => {
    tickets.clear()
    void ws.close()
  }, 'dsh-sidebar-cdp-browser: teardown')
}

export type { CdpLiveConfig, ResolvedCdpLiveConfig } from './config.ts'
export { DEFAULT_CDP_ENDPOINT, normalizeCdpEndpoint } from './config.ts'
export { HTTP_ROUTES, WEBSOCKET_ROUTE }
export { createHttpHandlers, createTicketRegistry } from './routes/http.ts'
export { createCdpWebSocketRoute } from './routes/websocket.ts'
export { isTrustedRequest } from './trust-fence.ts'
