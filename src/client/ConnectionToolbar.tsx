import type { ConnectionState } from './cdp-api.ts'
import { t } from './locales.ts'
import css from './cdp-live.module.css'

export function ConnectionToolbar(props: { state: ConnectionState; error?: string; onReconnect(): void }) {
  const label = props.state === 'connected' ? t('connected') : props.state === 'opening' ? t('opening') : props.state === 'connecting' ? t('connecting') : props.state === 'reconnecting' ? t('reconnecting') : t('disconnected')
  // 'idle' keeps the dot's neutral base color (no per-state class exists).
  const stateClass = props.state === 'idle' ? '' : ` ${css[props.state]}`
  return <div className={css.connectionToolbar}>
    <span className={`${css.connectionDot}${stateClass}`} aria-hidden="true" />
    <span className={css.connectionLabel} title={props.error}>{label}</span>
    {props.state !== 'connected' && <button type="button" onClick={props.onReconnect}>{t('reconnect')}</button>}
  </div>
}
