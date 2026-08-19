import { randomBytes } from 'node:crypto'
import { normalizeCdpEndpoint, type ResolvedCdpLiveConfig } from '../config.ts'
import { BrowserConnectionManager } from './browser-connection-manager.ts'
import { connectPuppeteer } from './puppeteer-adapter.ts'

export interface ManagedConnection {
  endpoint: string
  manager: BrowserConnectionManager
  generation: string
}

/**
 * Where the live endpoint comes from: the raw (possibly empty) string stored
 * in the web UI setting. Empty resolves to the default loopback address —
 * see {@link normalizeCdpEndpoint}. Read lazily at connect time so a settings
 * write is picked up without restarting the plugin.
 */
export type EndpointSource = () => string

/** The single implicit CDP connection: one endpoint, dialed on demand. */
export class EndpointManager {
  readonly #config: ResolvedCdpLiveConfig
  readonly #source: EndpointSource
  #current?: ManagedConnection

  constructor(config: ResolvedCdpLiveConfig, source: EndpointSource = () => '') {
    this.#config = config
    this.#source = source
  }

  /** The endpoint a NEW connection would use right now (normalized). */
  get endpoint(): string {
    return normalizeCdpEndpoint(this.#source())
  }

  ready(): boolean {
    return this.#current?.manager.connected === true
  }

  async get(): Promise<ManagedConnection> {
    const endpoint = this.endpoint
    let current = this.#current
    if (current !== undefined && current.endpoint !== endpoint) {
      // The UI setting moved: drop the stale generation before reconnecting.
      await current.manager.close().catch(() => undefined)
      this.#current = current = undefined
    }
    if (current !== undefined && current.manager.state === 'connected' && !current.manager.connected) {
      await current.manager.close().catch(() => undefined)
      this.#current = current = undefined
    }
    if (current === undefined || current.manager.state === 'closed') {
      const generation = randomBytes(12).toString('base64url')
      const manager = new BrowserConnectionManager({
        connect: async () => connectPuppeteer({ browserWSEndpoint: await resolveBrowserWsEndpoint(endpoint, this.#config.connectTimeoutMs) }),
      })
      current = { endpoint, manager, generation }
      this.#current = current
    }
    await current.manager.connect()
    return current
  }

  /**
   * React to a settings commit: if the effective endpoint moved, dispose the
   * current connection so the next attach dials the new address. Returns
   * whether the endpoint actually changed.
   */
  async applyEndpointChange(): Promise<boolean> {
    const endpoint = this.endpoint
    if (this.#current === undefined || this.#current.endpoint === endpoint) return false
    await this.close()
    return true
  }

  async close(): Promise<void> {
    const current = this.#current
    this.#current = undefined
    if (current !== undefined) await current.manager.close().catch(() => undefined)
  }
}

async function resolveBrowserWsEndpoint(endpoint: string, timeoutMs: number): Promise<string> {
  const url = new URL(endpoint)
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return url.toString()
  // http(s) endpoints are discovery addresses: fetch /json/version for the
  // browser-level webSocketDebuggerUrl.
  const versionUrl = new URL('/json/version', url)
  const response = await fetch(versionUrl, {
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`CDP discovery failed with HTTP ${response.status}`)
  const value = await response.json() as { webSocketDebuggerUrl?: unknown }
  if (typeof value.webSocketDebuggerUrl !== 'string') throw new Error('CDP discovery response has no webSocketDebuggerUrl')
  // A Chromium served behind a reverse proxy routinely advertises a
  // webSocketDebuggerUrl whose origin differs from the endpoint the operator
  // configured (e.g. http://host:9223 reachable, but ws://host/... pointing at
  // port 80, which some other proxy answers with 502). The configured endpoint
  // is the address the operator typed, so trust ITS origin and keep only the
  // browser path/id from the discovery response.
  const advertised = new URL(value.webSocketDebuggerUrl)
  if (advertised.protocol !== 'ws:' && advertised.protocol !== 'wss:') {
    throw new Error(`CDP discovery returned a non-WebSocket URL: ${advertised.protocol}`)
  }
  const resolved = new URL(advertised)
  resolved.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  resolved.host = url.host
  return resolved.toString()
}
