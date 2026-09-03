import { useCallback, useEffect, useState } from 'react'
import type { TabComponentProps } from 'dsh-better-sidebar/client/service'
import { requestId, DEFAULT_ENDPOINT_DISPLAY, type KeyInput, type MouseInput, type ServerMessage } from './cdp-api.ts'
import type { RenderedFrame } from './frame-renderer.ts'
import { readSettings } from './settings.tsx'
import { useTargetStore } from './use-target-store.ts'
import { useCdpSocket } from './use-cdp-socket.ts'
import { ConnectionToolbar } from './ConnectionToolbar.tsx'
import { TargetTabStrip } from './TargetTabStrip.tsx'
import { BrowserToolbar } from './BrowserToolbar.tsx'
import { LiveCanvas } from './LiveCanvas.tsx'
import { StatusOverlay } from './StatusOverlay.tsx'
import { t } from './i18n.ts'
import css from './cdp-live.module.css'

export function SidebarCdpBrowser(props: TabComponentProps) {
  const settings = readSettings(props.store.getPrefs().pluginSettings?.['dsh-sidebar-cdp-browser:live'])
  const targets = useTargetStore()
  const [frame, setFrame] = useState<RenderedFrame>()
  const [listError, setListError] = useState<string>()

  useEffect(() => { setListError(undefined) }, [settings.endpoint])

  // The endpoint lives in the host (read from the same UI setting); the
  // client just opens a ticket and the host dials the current address.
  //
  // Two-stage control gate: the plugin setting 交互输入 is the master
  // permission, and the title-bar checkbox 键盘鼠标远程控制 is the runtime
  // arm switch (unchecked by default, so a fresh view is ALWAYS view-only).
  // The session mode — and with it the host-side requireInteractive() gate —
  // only turns interactive when BOTH are on; toggling either reconnects with
  // the new mode (the same proven flow an endpoint change uses).
  const interactiveAllowed = settings.interactive
  const [armedInput, setArmedInput] = useState(false)
  const armed = interactiveAllowed && armedInput
  // Disarming must persist: turning the master setting off clears the box so
  // re-enabling the setting later does not silently re-arm control.
  useEffect(() => { if (!interactiveAllowed) setArmedInput(false) }, [interactiveAllowed])
  const mode: 'observe' | 'interactive' = armed ? 'interactive' : 'observe'
  const onMessage = useCallback((message: ServerMessage) => {
    if (message.type === 'ready' || message.type === 'targets.changed') targets.replace(message.targets)
    else if (message.type === 'target.closed') targets.remove(message.targetKey)
    else if (message.type === 'response' && !message.ok) setListError(message.error?.message ?? 'CDP command failed')
    else if (message.type === 'response' && message.ok) {
      // targets.create replies with the new tab's key: switch to it straight
      // away (the screencast follow-up rides on the targetKey effect).
      const key = (message.result as { targetKey?: unknown } | undefined)?.targetKey
      if (typeof key === 'string' && key !== '') targets.select(key)
    }
    else if (message.type === 'error') setListError(message.message)
  }, [targets.remove, targets.replace, targets.select])
  const socket = useCdpSocket({
    sessionId: props.scope.sessionId,
    mode,
    enabled: props.visible,
    targetKey: targets.selectedKey,
    onMessage,
    onFrame: next => { if (targets.selectedKey === undefined || next.targetKey === targets.selectedKey) setFrame(next) },
  })

  useEffect(() => { setFrame(undefined) }, [settings.endpoint, targets.selectedKey])

  const navigate = useCallback((url: string) => {
    if (targets.selectedKey === undefined) return
    socket.send({ v: 1, type: 'navigate', requestId: requestId(), targetKey: targets.selectedKey, url })
  }, [socket.send, targets.selectedKey])
  const history = useCallback((action: 'back' | 'forward' | 'reload') => {
    if (targets.selectedKey === undefined) return
    socket.send({ v: 1, type: 'history', requestId: requestId(), targetKey: targets.selectedKey, action })
  }, [socket.send, targets.selectedKey])
  const sendMouse = useCallback((event: MouseInput, frameId?: number): boolean => {
    if (targets.selectedKey === undefined) return false
    return socket.send({ v: 1, type: 'input.mouse', requestId: requestId(), targetKey: targets.selectedKey, frameId, event })
  }, [socket.send, targets.selectedKey])
  const sendKey = useCallback((event: KeyInput): boolean => {
    if (targets.selectedKey === undefined) return false
    return socket.send({ v: 1, type: 'input.key', requestId: requestId(), targetKey: targets.selectedKey, event })
  }, [socket.send, targets.selectedKey])
  const sendText = useCallback((text: string): boolean => {
    if (targets.selectedKey === undefined || text === '') return false
    return socket.send({ v: 1, type: 'input.text', requestId: requestId(), targetKey: targets.selectedKey, text })
  }, [socket.send, targets.selectedKey])
  const createTarget = useCallback(() => {
    socket.send({ v: 1, type: 'targets.create', requestId: requestId() })
  }, [socket.send])
  const closeTarget = useCallback((key: string) => {
    socket.send({ v: 1, type: 'target.close', requestId: requestId(), targetKey: key })
  }, [socket.send])

  const interactiveReady = socket.state === 'connected' && mode === 'interactive'
  return <div className={css.root} data-sidebar-cdp-browser="">
    <div className={css.topRow}>
      <span className={css.endpointChip} title={t('endpoint')}>{settings.endpoint.trim() === '' ? DEFAULT_ENDPOINT_DISPLAY : settings.endpoint.trim()}</span>
      <ConnectionToolbar
        state={socket.state}
        error={socket.error}
        onReconnect={socket.reconnect}
        remoteControl={{ enabled: interactiveAllowed, checked: armed, onChange: setArmedInput }}
      />
    </div>
    <TargetTabStrip
      targets={targets.targets}
      selectedKey={targets.selectedKey}
      canClose={interactiveReady}
      canCreate={interactiveReady}
      disabled={!interactiveReady}
      onSelect={targets.select}
      onClose={closeTarget}
      onCreate={createTarget}
    />
    <BrowserToolbar
      key={targets.selectedKey ?? 'none'}
      url={targets.selected?.url}
      disabled={!targets.selectedKey || socket.state !== 'connected' || mode !== 'interactive'}
      onNavigate={navigate}
      onBack={() => history('back')}
      onForward={() => history('forward')}
      onReload={() => history('reload')}
    />
    <div className={css.viewport}>
      <LiveCanvas frame={frame} interactive={mode === 'interactive' && props.visible} sendMouse={sendMouse} sendKey={sendKey} sendText={sendText} />
      <StatusOverlay visible={props.visible} state={socket.state} hasTarget={Boolean(targets.selectedKey)} hasFrame={Boolean(frame)} error={listError ?? socket.error} onRetry={() => { setListError(undefined); socket.reconnect() }} />
    </div>
  </div>
}
