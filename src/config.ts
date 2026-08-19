import s from 'schemastery'
import { z } from 'zod'

/**
 * The single CDP endpoint model: no profile list, no host-side
 * endpoint declaration. The address lives in the web UI ("设置 → 侧边卡片 →
 * 侧边栏内容 → CDP实时视图"), persisted in better-sidebar's prefs document
 * under `pluginSettings['dsh-sidebar-cdp-browser:live'].endpoint`. An empty value
 * falls back to {@link DEFAULT_CDP_ENDPOINT}.
 */
export const DEFAULT_CDP_ENDPOINT = 'http://127.0.0.1:9222'

const CDP_ENDPOINT_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:'])

/**
 * Normalize a raw endpoint string into a URL the host can dial: empty (or
 * non-string) → the default loopback address; a bare `host:port` gets an
 * `http://` scheme prefix; anything else must already be a valid http(s)/ws(s)
 * URL. Credentials are rejected (the CDP dial path has no auth support).
 * There is deliberately NO loopback/remote gate — the address is fully
 * operator-controlled from the web UI.
 */
export function normalizeCdpEndpoint(raw: unknown): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (trimmed === '') return DEFAULT_CDP_ENDPOINT
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`
  let url: URL
  try { url = new URL(withScheme) } catch { throw new Error(`invalid CDP endpoint: ${trimmed}`) }
  if (!CDP_ENDPOINT_PROTOCOLS.has(url.protocol)) {
    throw new Error(`unsupported CDP endpoint protocol: ${url.protocol}`)
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('credentials in CDP endpoint URLs are not supported')
  }
  return url.toString()
}

export interface CdpLiveConfig {
  ticketTtlMs?: number
  connectTimeoutMs?: number
  frameQuality?: number
  frameMaxWidth?: number
  frameMaxHeight?: number
  frameEveryNth?: number
  bufferedAmountSoftLimit?: number
  bufferedAmountHardLimit?: number
}

export interface ResolvedCdpLiveConfig {
  ticketTtlMs: number
  connectTimeoutMs: number
  frameQuality: number
  frameMaxWidth: number
  frameMaxHeight: number
  frameEveryNth: number
  bufferedAmountSoftLimit: number
  bufferedAmountHardLimit: number
}

const RuntimeConfigSchema = z.object({
  ticketTtlMs: z.number().int().min(5_000).max(120_000).default(30_000),
  connectTimeoutMs: z.number().int().min(1_000).max(120_000).default(15_000),
  frameQuality: z.number().int().min(20).max(90).default(60),
  frameMaxWidth: z.number().int().min(320).max(3840).default(1280),
  frameMaxHeight: z.number().int().min(240).max(2160).default(900),
  frameEveryNth: z.number().int().min(1).max(30).default(1),
  bufferedAmountSoftLimit: z.number().int().min(64 * 1024).max(16 * 1024 * 1024).default(512 * 1024),
  bufferedAmountHardLimit: z.number().int().min(256 * 1024).max(64 * 1024 * 1024).default(4 * 1024 * 1024),
}).strict()

/** DSH Loader configuration schema (runtime tuning only — the endpoint is a UI setting). */
export const Config: s<CdpLiveConfig> = s.object({
  ticketTtlMs: s.number().step(1).min(5_000).max(120_000).default(30_000),
  connectTimeoutMs: s.number().step(1).min(1_000).max(120_000).default(15_000),
  frameQuality: s.number().step(1).min(20).max(90).default(60),
  frameMaxWidth: s.number().step(1).min(320).max(3840).default(1280),
  frameMaxHeight: s.number().step(1).min(240).max(2160).default(900),
  frameEveryNth: s.number().step(1).min(1).max(30).default(1),
  bufferedAmountSoftLimit: s.number().step(1).min(64 * 1024).max(16 * 1024 * 1024).default(512 * 1024),
  bufferedAmountHardLimit: s.number().step(1).min(256 * 1024).max(64 * 1024 * 1024).default(4 * 1024 * 1024),
})

export function resolveCdpLiveConfig(value: unknown = {}): ResolvedCdpLiveConfig {
  const parsed = RuntimeConfigSchema.parse(value)
  if (parsed.bufferedAmountHardLimit <= parsed.bufferedAmountSoftLimit) {
    throw new Error('bufferedAmountHardLimit must be greater than bufferedAmountSoftLimit')
  }
  return parsed
}
