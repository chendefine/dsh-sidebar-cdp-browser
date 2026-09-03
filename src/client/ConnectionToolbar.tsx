import type { ConnectionState } from './cdp-api.ts'
import { t } from './i18n.ts'
import css from './cdp-live.module.css'

/**
 * The runtime arm switch shown in the title bar, LEFT of the connection
 * status: keyboard/mouse control stays off until it is explicitly checked,
 * even when the plugin's "interactive input" setting is on. `enabled` is
 * false while that master setting is off — then the box renders unchecked
 * and grayed out (see SidebarCdpBrowser for the mode wiring).
 */
export interface RemoteControlToggle {
  enabled: boolean
  checked: boolean
  onChange(next: boolean): void
}

export function ConnectionToolbar(props: { state: ConnectionState; error?: string; onReconnect(): void; remoteControl: RemoteControlToggle }) {
  const label = props.state === 'connected' ? t('connected') : props.state === 'opening' ? t('opening') : props.state === 'connecting' ? t('connecting') : props.state === 'reconnecting' ? t('reconnecting') : t('disconnected')
  // 'idle' keeps the dot's neutral base color (no per-state class exists).
  const stateClass = props.state === 'idle' ? '' : ` ${css[props.state]}`
  const control = props.remoteControl
  return <div className={css.connectionToolbar}>
    <label
      className={css.controlToggle}
      data-enabled={control.enabled ? 'true' : 'false'}
      title={control.enabled ? t('remoteControlHint') : t('remoteControlLocked')}
    >
      <input
        type="checkbox"
        checked={control.checked}
        disabled={!control.enabled}
        onChange={event => control.onChange(event.currentTarget.checked)}
      />
      <span className={css.controlToggleLabel}>{t('remoteControl')}</span>
    </label>
    <span className={css.connectionStatus}>
      <span className={`${css.connectionDot}${stateClass}`} aria-hidden="true" />
      <span className={css.connectionLabel} title={props.error}>{label}</span>
    </span>
    {props.state !== 'connected' && <button type="button" onClick={props.onReconnect}>{t('reconnect')}</button>}
  </div>
}
