const PROTOCOL_VERSION = 1 as const

export type TargetKey = string
export type ConnectionState = 'idle' | 'opening' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export const DEFAULT_ENDPOINT_DISPLAY = '127.0.0.1:9222'

export interface OpenResult {
  protocolVersion: number
  ticket: string
  expiresAt: number
  wsPath: string
}

export interface TargetDescriptor {
  key: TargetKey
  type: string
  title: string
  url: string
  lifecycle: 'available' | 'attached' | 'closed'
  attached: boolean
  createdAt: number
  updatedAt: number
}

export interface FrameMetadata {
  offsetTop?: number
  pageScaleFactor?: number
  deviceWidth?: number
  deviceHeight?: number
  scrollOffsetX?: number
  scrollOffsetY?: number
  timestamp?: number
  [key: string]: unknown
}

export interface FrameMetaMessage {
  v: 1
  type: 'screencast.frameMeta'
  targetKey: TargetKey
  sequence: number
  metadata: FrameMetadata
  mimeType: 'image/jpeg' | 'image/png'
  byteLength: number
  receivedAt: number
}

export type ServerMessage =
  | { v: 1; type: 'ready'; generation: string; mode: 'observe' | 'interactive'; targets: TargetDescriptor[] }
  | { v: 1; type: 'targets.changed'; targets: TargetDescriptor[] }
  | { v: 1; type: 'target.closed'; targetKey: TargetKey; reason?: string }
  | FrameMetaMessage
  | { v: 1; type: 'response'; requestId: string; ok: boolean; result?: unknown; error?: { code: string; message: string } }
  | { v: 1; type: 'error'; code: string; message: string; recoverable: boolean }

export interface MouseInput {
  type: 'mousePressed' | 'mouseReleased' | 'mouseMoved' | 'mouseWheel'
  x: number
  y: number
  button?: 'none' | 'left' | 'middle' | 'right' | 'back' | 'forward'
  buttons?: number
  clickCount?: number
  deltaX?: number
  deltaY?: number
  modifiers?: number
}

export interface KeyInput {
  type: 'keyDown' | 'keyUp' | 'rawKeyDown' | 'char'
  key?: string
  code?: string
  text?: string
  unmodifiedText?: string
  windowsVirtualKeyCode?: number
  nativeVirtualKeyCode?: number
  modifiers?: number
  autoRepeat?: boolean
  isKeypad?: boolean
  isSystemKey?: boolean
  location?: number
}

export type LiveViewCommand =
  | { v: 1; type: 'targets.list'; requestId: string }
  | { v: 1; type: 'targets.create'; requestId: string }
  | { v: 1; type: 'target.select'; requestId: string; targetKey: string }
  | { v: 1; type: 'target.detach'; requestId: string; targetKey: string }
  | { v: 1; type: 'target.close'; requestId: string; targetKey: string }
  | { v: 1; type: 'visibility'; requestId: string; visible: boolean; targetKey?: string }
  | { v: 1; type: 'input.mouse'; requestId: string; targetKey: string; frameId?: number; event: MouseInput }
  | { v: 1; type: 'input.key'; requestId: string; targetKey: string; event: KeyInput }
  | { v: 1; type: 'input.text'; requestId: string; targetKey: string; text: string }
  | { v: 1; type: 'navigate'; requestId: string; targetKey: string; url: string }
  | { v: 1; type: 'history'; requestId: string; targetKey: string; action: 'back' | 'forward' | 'reload' }
  | { v: 1; type: 'ping'; requestId: string }

async function apiCall<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { accept: 'application/json', ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }), ...init?.headers } })
  const body = await response.json().catch(() => null) as { ok?: boolean; value?: T; error?: { message?: string } } | null
  if (!response.ok || body?.ok !== true || body.value === undefined) throw new Error(body?.error?.message ?? `HTTP ${response.status}`)
  return body.value
}

export function openLiveSession(sessionId: string, mode: 'observe' | 'interactive', signal?: AbortSignal): Promise<OpenResult> {
  return apiCall<OpenResult>('/dsh-cdp-live/api/open', {
    method: 'POST',
    body: JSON.stringify({ sessionId, mode }),
    signal,
  })
}

export function websocketUrl(path: string, ticket: string): string {
  const url = new URL(path, window.location.origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('ticket', ticket)
  return url.toString()
}

export function decodeMessage(data: string): ServerMessage | null {
  try {
    const value = JSON.parse(data) as Partial<ServerMessage>
    return value !== null && value.v === PROTOCOL_VERSION && typeof value.type === 'string' ? value as ServerMessage : null
  } catch { return null }
}

export function requestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function encodeCommand(command: LiveViewCommand): string { return JSON.stringify(command) }
