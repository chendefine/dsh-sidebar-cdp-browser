import type { ConnectionState } from './cdp-api.ts'
import { t } from './locales.ts'
import css from './cdp-live.module.css'

export function StatusOverlay(props: { visible: boolean; state: ConnectionState; hasTarget: boolean; hasFrame: boolean; error?: string; onRetry(): void }) {
  let message: string | undefined
  if (!props.visible) message = t('hidden')
  else if (props.error) message = props.error
  else if (props.state === 'opening') message = t('opening')
  else if (props.state === 'connecting') message = t('connecting')
  else if (props.state === 'reconnecting') message = t('reconnecting')
  else if (props.state !== 'connected') message = t('disconnected')
  else if (!props.hasTarget) message = t('selectTarget')
  else if (!props.hasFrame) message = t('loading')
  if (!message) return null
  return <div className={css.statusOverlay} role="status"><span>{message}</span>
    {(props.error || props.state === 'error') && <button type="button" onClick={props.onRetry}>{t('retry')}</button>}
  </div>
}
