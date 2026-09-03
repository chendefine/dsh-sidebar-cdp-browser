import s from 'schemastery'
import { z } from 'zod'
import { FRAME_FIELD_SPECS, type FrameFieldKey } from './frame-settings.ts'

/**
 * The single CDP endpoint model: no profile list, no host-side
 * endpoint declaration. The address lives in the web UI ("设置 → 侧边卡片 →
 * 侧边栏内容 → CDP实时视图"), persisted in better-sidebar's prefs document
 * under `pluginSettings['dsh-sidebar-cdp-browser:live'].endpoint`. An empty value
 * falls back to {@link DEFAULT_CDP_ENDPOINT}.
 *
 * The four frame-capture fields live in that same UI document and override
 * the loader values here per key (see frame-settings.ts); the loader config
 * stays the deployment default.
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

/**
 * Build the four frame-field schema members from the shared spec table
 * (frame-settings.ts), so the loader schema, the UI panel inputs, and the
 * override reader share one set of ranges/defaults. The mapped-type cast
 * keeps the literal keys for zod / schemastery inference.
 */
function frameSchemas<T>(build: (spec: (typeof FRAME_FIELD_SPECS)[number]) => T): { [K in FrameFieldKey]: T } {
  const entries = FRAME_FIELD_SPECS.map(spec => [spec.key, build(spec)] as const)
  return Object.fromEntries(entries) as { [K in FrameFieldKey]: T }
}

const RuntimeConfigSchema = z.object({
  ticketTtlMs: z.number().int().min(5_000).max(120_000).default(30_000),
  connectTimeoutMs: z.number().int().min(1_000).max(120_000).default(15_000),
  ...frameSchemas(spec => z.number().int().min(spec.min).max(spec.max).default(spec.def)),
  bufferedAmountSoftLimit: z.number().int().min(64 * 1024).max(16 * 1024 * 1024).default(512 * 1024),
  bufferedAmountHardLimit: z.number().int().min(256 * 1024).max(64 * 1024 * 1024).default(4 * 1024 * 1024),
}).strict()

/** DSH Loader configuration schema (runtime tuning only — the endpoint is a UI setting). */
export const Config: s<CdpLiveConfig> = s.object({
  ticketTtlMs: s.number().step(1).min(5_000).max(120_000).default(30_000),
  connectTimeoutMs: s.number().step(1).min(1_000).max(120_000).default(15_000),
  ...frameSchemas(spec => s.number().step(1).min(spec.min).max(spec.max).default(spec.def)),
  bufferedAmountSoftLimit: s.number().step(1).min(64 * 1024).max(16 * 1024 * 1024).default(512 * 1024),
  bufferedAmountHardLimit: s.number().step(1).min(256 * 1024).max(64 * 1024 * 1024).default(4 * 1024 * 1024),
}).i18n({
  zh: {
    ticketTtlMs: '一次性 ticket 有效期（毫秒）',
    connectTimeoutMs: 'CDP 连接超时（毫秒）',
    frameQuality: 'JPEG 画质（20–90；部署默认值，可被 Web UI 覆盖）',
    frameEveryNth: '每 N 帧取 1 帧（1–30；部署默认值，可被 Web UI 覆盖）',
    frameMaxWidth: '帧最大宽度像素（320–3840；部署默认值，可被 Web UI 覆盖）',
    frameMaxHeight: '帧最大高度像素（240–2160；部署默认值，可被 Web UI 覆盖）',
    bufferedAmountSoftLimit: '发送缓冲软上限（字节），超过开始丢帧',
    bufferedAmountHardLimit: '发送缓冲硬上限（字节），超过断开连接（须大于软上限）',
  },
  en: {
    ticketTtlMs: 'One-time ticket TTL (ms)',
    connectTimeoutMs: 'CDP connection timeout (ms)',
    frameQuality: 'JPEG quality (20–90; deployment default, web-UI overridable)',
    frameEveryNth: 'Keep 1 of every N frames (1–30; deployment default, web-UI overridable)',
    frameMaxWidth: 'Max frame width in pixels (320–3840; deployment default, web-UI overridable)',
    frameMaxHeight: 'Max frame height in pixels (240–2160; deployment default, web-UI overridable)',
    bufferedAmountSoftLimit: 'Soft send-buffer limit in bytes; frames drop past it',
    bufferedAmountHardLimit: 'Hard send-buffer limit in bytes; the connection closes past it (must exceed the soft limit)',
  },
})

export function resolveCdpLiveConfig(value: unknown = {}): ResolvedCdpLiveConfig {
  const parsed = RuntimeConfigSchema.parse(value)
  if (parsed.bufferedAmountHardLimit <= parsed.bufferedAmountSoftLimit) {
    throw new Error('bufferedAmountHardLimit must be greater than bufferedAmountSoftLimit')
  }
  return parsed
}
