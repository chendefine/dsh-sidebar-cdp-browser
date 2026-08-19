import { randomBytes } from 'node:crypto'
import type { RawData, WebSocket } from 'ws'
import type { ResolvedCdpLiveConfig } from '../config.ts'
import type { TicketClaims } from '../routes/http.ts'
import { encodeServerMessage, parseJsonClientRequest, PROTOCOL_VERSION, type ClientRequest } from './protocol.ts'
import { EndpointManager } from './endpoint-manager.ts'
import type { TargetKey } from './types.ts'

export interface LiveCdpSession {
  attach(claims: TicketClaims, socket: WebSocket): Promise<void> | void
  close(): Promise<void>
}

export class CdpLiveSession implements LiveCdpSession {
  readonly #config: ResolvedCdpLiveConfig
  readonly #endpoints: EndpointManager
  readonly #sockets = new Set<WebSocket>()

  constructor(config: ResolvedCdpLiveConfig, endpoints = new EndpointManager(config)) {
    this.#config = config
    this.#endpoints = endpoints
  }

  /**
   * The CDP endpoint setting changed: close every attached client so they
   * re-open a ticket and land on a fresh connection to the new address. The
   * client's reconnect loop (with backoff) does the rest.
   */
  restart(reason: string): void {
    for (const socket of [...this.#sockets]) socket.close(1012, reason.slice(0, 120))
  }

  async attach(claims: TicketClaims, ws: WebSocket): Promise<void> {
    const owner = `${claims.sessionId}:${randomBytes(10).toString('base64url')}`
    let selected: TargetKey | undefined
    let framePump: Promise<void> | undefined
    let closed = false
    // Buffer commands that arrive while the browser connection is still being
    // established (the client fires its initial targets.list on socket open);
    // they are flushed right after `ready` is sent.
    const early: string[] = []
    ws.on('message', (data: RawData, binary: boolean) => {
      if (!binary) early.push(data.toString())
    })
    this.#sockets.add(ws)
    // Attach may fail before the real cleanup handler is wired (e.g. the
    // endpoint is unreachable): always unregister the socket on close.
    ws.on('close', () => { this.#sockets.delete(ws) })
    const managed = await this.#endpoints.get()
    const { manager, generation } = managed

    const sendJson = (message: Parameters<typeof encodeServerMessage>[0]): void => {
      if (ws.readyState === ws.OPEN) ws.send(encodeServerMessage(message))
    }
    const response = (requestId: string, result?: unknown): void => sendJson({ v: PROTOCOL_VERSION, type: 'response', requestId, ok: true, ...(result === undefined ? {} : { result }) })
    const failure = (requestId: string, error: unknown): void => sendJson({
      v: PROTOCOL_VERSION,
      type: 'response',
      requestId,
      ok: false,
      error: { code: 'command-failed', message: error instanceof Error ? error.message : String(error) },
    })

    const sendTargets = (): void => sendJson({ v: PROTOCOL_VERSION, type: 'targets.changed', targets: manager.registry.list() })
    const onTargetsChanged = (): void => sendTargets()
    const onTargetClosed = (target: { key: TargetKey }): void => {
      sendJson({ v: PROTOCOL_VERSION, type: 'target.closed', targetKey: target.key, reason: 'target closed' })
      if (selected === target.key) selected = undefined
    }
    manager.registry.on('changed', onTargetsChanged)
    manager.registry.on('closed', onTargetClosed)

    const stopSelected = async (): Promise<void> => {
      const key = selected
      selected = undefined
      if (key === undefined) return
      manager.leases.revokeOwner(owner)
      await manager.screencast.stop(key).catch(() => undefined)
      await manager.targets.detach(key).catch(() => undefined)
      await framePump?.catch(() => undefined)
      framePump = undefined
    }

    const startTarget = async (key: TargetKey): Promise<void> => {
      if (selected === key && framePump !== undefined) return
      await stopSelected()
      manager.registry.resolve(key)
      manager.leases.acquire(key, owner, 60_000)
      selected = key
      const queue = await manager.screencast.start(key, {
        format: 'jpeg',
        quality: this.#config.frameQuality,
        maxWidth: this.#config.frameMaxWidth,
        maxHeight: this.#config.frameMaxHeight,
        everyNthFrame: this.#config.frameEveryNth,
      })
      framePump = (async () => {
        for await (const frame of queue) {
          if (closed || selected !== key || ws.readyState !== ws.OPEN) return
          if (ws.bufferedAmount > this.#config.bufferedAmountHardLimit) {
            ws.close(1013, 'client backpressure limit exceeded')
            return
          }
          if (ws.bufferedAmount > this.#config.bufferedAmountSoftLimit) continue
          const bytes = Buffer.from(frame.data, 'base64')
          sendJson({
            v: PROTOCOL_VERSION,
            type: 'screencast.frameMeta',
            targetKey: frame.targetKey,
            sequence: frame.sequence,
            metadata: frame.metadata as unknown as Record<string, unknown>,
            mimeType: 'image/jpeg',
            byteLength: bytes.byteLength,
            receivedAt: frame.receivedAt,
          })
          if (ws.readyState === ws.OPEN) ws.send(bytes, { binary: true })
        }
      })()
    }

    // The single endpoint is fully operator-controlled from the web UI: the
    // only remaining gate is the session's own mode (observe vs interactive).
    const requireInteractive = (): void => {
      if (claims.mode !== 'interactive') throw new Error('interactive control is not permitted')
    }

    /**
     * A navigation commits its URL long before the new document's title
     * exists, and Chromium NEVER emits title-only TargetInfo updates — the
     * real title is only observable via Target.getTargets commands (see
     * BrowserAdapter.refreshTargetInfo). These nudges fetch + apply right
     * after a navigation so the tab title flips within a beat instead of
     * waiting for the 1s poll.
     */
    const nudgeTitleRefresh = (): void => {
      for (const delay of [250, 800, 2_000]) {
        const timer = setTimeout(() => { void manager.refreshTargetInfoNow().catch(() => undefined) }, delay)
        timer.unref?.()
      }
    }

    const handle = async (request: ClientRequest): Promise<void> => {
      try {
        switch (request.type) {
          case 'targets.list': response(request.requestId, { targets: manager.registry.list() }); break
          case 'targets.create': {
            requireInteractive()
            const targetKey = await manager.createTarget()
            response(request.requestId, { targetKey })
            break
          }
          case 'target.select': await startTarget(request.targetKey as TargetKey); response(request.requestId); break
          case 'target.detach':
            if (selected === request.targetKey) await stopSelected()
            else await manager.targets.detach(request.targetKey as TargetKey)
            response(request.requestId)
            break
          case 'target.close': {
            requireInteractive()
            if (selected === request.targetKey) await stopSelected()
            await manager.closeTarget(request.targetKey as TargetKey)
            response(request.requestId)
            break
          }
          case 'visibility':
            if (!request.visible) await stopSelected()
            else if (request.targetKey !== undefined) await startTarget(request.targetKey as TargetKey)
            response(request.requestId)
            break
          case 'screencast.start': await startTarget(request.targetKey as TargetKey); response(request.requestId); break
          case 'screencast.stop':
            if (selected === request.targetKey) await stopSelected()
            else await manager.screencast.stop(request.targetKey as TargetKey)
            response(request.requestId)
            break
          case 'input.mouse': requireInteractive(); await manager.input.dispatchMouse(request.targetKey as TargetKey, request.event); response(request.requestId); break
          case 'input.key': requireInteractive(); await manager.input.dispatchKey(request.targetKey as TargetKey, request.event); response(request.requestId); break
          case 'input.text': requireInteractive(); await manager.input.insertText(request.targetKey as TargetKey, request.text); response(request.requestId); break
          case 'navigate': requireInteractive(); await manager.input.navigate(request.targetKey as TargetKey, request.url); nudgeTitleRefresh(); response(request.requestId); break
          case 'history': requireInteractive(); await manager.input.history(request.targetKey as TargetKey, request.action); nudgeTitleRefresh(); response(request.requestId); break
          case 'ping': response(request.requestId, { pong: Date.now() }); break
        }
      } catch (error) { failure(request.requestId, error) }
    }

    sendJson({ v: PROTOCOL_VERSION, type: 'ready', generation, mode: claims.mode, targets: manager.registry.list() })

    // replace the early-buffering listener with the real command handler
    ws.listeners('message').slice().forEach(listener => ws.off('message', listener as never))
    ws.on('message', (data: RawData, binary: boolean) => {
      if (binary) return
      try { void handle(parseJsonClientRequest(data.toString())) }
      catch (error) {
        sendJson({ v: PROTOCOL_VERSION, type: 'error', code: 'invalid-message', message: error instanceof Error ? error.message : String(error), recoverable: true })
      }
    })
    ws.on('close', () => { void cleanup() })
    ws.on('error', () => { ws.close() })
    for (const buffered of early.splice(0)) {
      try { void handle(parseJsonClientRequest(buffered)) }
      catch { /* an early malformed message is superseded by later traffic */ }
    }

    const cleanup = async (): Promise<void> => {
      if (closed) return
      closed = true
      this.#sockets.delete(ws)
      manager.registry.off('changed', onTargetsChanged)
      manager.registry.off('closed', onTargetClosed)
      await stopSelected()
    }
  }

  async close(): Promise<void> {
    this.restart('plugin shutdown')
    this.#sockets.clear()
    await this.#endpoints.close()
  }
}
