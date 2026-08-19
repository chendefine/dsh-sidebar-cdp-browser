import { useCallback, useEffect, useRef, useState } from 'react'
import {
  decodeMessage,
  encodeCommand,
  openLiveSession,
  requestId,
  websocketUrl,
  type ConnectionState,
  type LiveViewCommand,
  type ServerMessage,
} from './cdp-api.ts'
import type { RenderedFrame } from './frame-renderer.ts'

export interface UseCdpSocketOptions {
  sessionId: string
  mode: 'observe' | 'interactive'
  enabled: boolean
  targetKey?: string
  onMessage?(message: ServerMessage): void
  onFrame?(frame: RenderedFrame): void
}

export interface CdpSocket {
  state: ConnectionState
  error?: string
  reconnect(): void
  send(command: LiveViewCommand): boolean
}

export function useCdpSocket(options: UseCdpSocketOptions): CdpSocket {
  const { sessionId, mode, enabled, targetKey } = options
  const socketRef = useRef<WebSocket | null>(null)
  const selectedRef = useRef<string>()
  const pendingMeta = useRef<Omit<RenderedFrame, 'blob'> | null>(null)
  const callbacks = useRef({ onMessage: options.onMessage, onFrame: options.onFrame })
  const [state, setState] = useState<ConnectionState>('idle')
  const [error, setError] = useState<string>()
  const [generation, setGeneration] = useState(0)
  callbacks.current = { onMessage: options.onMessage, onFrame: options.onFrame }

  const send = useCallback((command: LiveViewCommand): boolean => {
    const socket = socketRef.current
    if (socket === null || socket.readyState !== WebSocket.OPEN) return false
    socket.send(encodeCommand(command))
    return true
  }, [])
  const reconnect = useCallback(() => setGeneration(value => value + 1), [])

  useEffect(() => {
    if (!enabled) { setState('idle'); return }
    let disposed = false
    let failures = 0
    let retryTimer: number | undefined
    let controller: AbortController | undefined

    const connect = async (): Promise<void> => {
      if (disposed) return
      controller?.abort()
      controller = new AbortController()
      try {
        setState(failures === 0 ? 'opening' : 'reconnecting')
        setError(undefined)
        const opened = await openLiveSession(sessionId, mode, controller.signal)
        if (disposed) return
        setState('connecting')
        const socket = new WebSocket(websocketUrl(opened.wsPath, opened.ticket))
        socket.binaryType = 'arraybuffer'
        socketRef.current = socket
        socket.onopen = () => {
          failures = 0
          setState('connected')
          socket.send(encodeCommand({ v: 1, type: 'targets.list', requestId: requestId() }))
          if (targetKey !== undefined) {
            selectedRef.current = targetKey
            socket.send(encodeCommand({ v: 1, type: 'target.select', requestId: requestId(), targetKey }))
          }
        }
        socket.onmessage = event => {
          if (typeof event.data === 'string') {
            const message = decodeMessage(event.data)
            if (message === null) return
            if (message.type === 'screencast.frameMeta') {
              pendingMeta.current = {
                targetKey: message.targetKey,
                sequence: message.sequence,
                metadata: message.metadata,
                mimeType: message.mimeType,
                receivedAt: message.receivedAt,
              }
            } else callbacks.current.onMessage?.(message)
            return
          }
          const pending = pendingMeta.current
          if (pending === null) return
          pendingMeta.current = null
          const blob = event.data instanceof Blob ? event.data : new Blob([event.data], { type: pending.mimeType ?? 'image/jpeg' })
          callbacks.current.onFrame?.({ ...pending, blob })
        }
        socket.onerror = () => socket.close()
        socket.onclose = event => {
          if (socketRef.current === socket) socketRef.current = null
          if (disposed) return
          failures += 1
          setError(event.reason || `Connection closed (${event.code})`)
          if (failures >= 5) { setState('error'); return }
          const delay = Math.min(8_000, 500 * 2 ** Math.min(failures, 4)) + Math.round(Math.random() * 250)
          retryTimer = window.setTimeout(() => { void connect() }, delay)
        }
      } catch (reason) {
        if (disposed || controller.signal.aborted) return
        failures += 1
        setError(reason instanceof Error ? reason.message : String(reason))
        if (failures >= 5) { setState('error'); return }
        retryTimer = window.setTimeout(() => { void connect() }, Math.min(8_000, 500 * 2 ** Math.min(failures, 4)))
      }
    }

    void connect()
    return () => {
      disposed = true
      controller?.abort()
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
      socketRef.current?.close(1000, 'view hidden')
      socketRef.current = null
      pendingMeta.current = null
      selectedRef.current = undefined
    }
  }, [enabled, generation, mode, sessionId])

  useEffect(() => {
    if (state !== 'connected' || targetKey === selectedRef.current) return
    selectedRef.current = targetKey
    if (targetKey === undefined) return
    send({ v: 1, type: 'target.select', requestId: requestId(), targetKey })
  }, [send, state, targetKey])

  return { state, error, reconnect, send }
}
