import { useEffect, useState } from 'react'
import type { SidebarSettingsRenderProps } from 'dsh-better-sidebar/client/service'
import { DEFAULT_ENDPOINT_DISPLAY } from './cdp-api.ts'
import { t } from './locales.ts'
import css from './cdp-live.module.css'

export interface LiveViewSettings {
  endpoint: string
  interactive: boolean
}

/** Empty endpoint = the default loopback address (the host normalizes). */
export function readSettings(value: Record<string, unknown> | undefined): LiveViewSettings {
  return {
    endpoint: typeof value?.endpoint === 'string' ? value.endpoint : '',
    interactive: value?.interactive === true,
  }
}

export function SettingsPanel(props: SidebarSettingsRenderProps) {
  const settings = readSettings(props.pluginSettings)
  const [draft, setDraft] = useState(settings.endpoint)
  // Re-adopt the persisted value whenever the document changes (another tab
  // committing an edit overwrites a local draft mid-typing); local edits
  // otherwise stay in the draft and only leave on blur/Enter.
  useEffect(() => { setDraft(settings.endpoint) }, [settings.endpoint])

  const commitEndpoint = (): void => {
    const next = draft.trim()
    if (next !== settings.endpoint) props.updatePluginSetting('endpoint', next)
    else setDraft(next)
  }

  return <div className={css.settingsPanel}>
    <label className={css.settingRow}>
      <span><strong>{t('endpoint')}</strong><small>{t('endpointDesc')}</small></span>
      <input
        type="text"
        className={css.settingInput}
        value={draft}
        placeholder={DEFAULT_ENDPOINT_DISPLAY}
        aria-label={t('endpoint')}
        spellCheck={false}
        onChange={event => { setDraft(event.target.value) }}
        onBlur={commitEndpoint}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
      />
    </label>
    <p className={css.settingHint}>{t('endpointFallback')}</p>
    <label className={css.settingRow}>
      <span><strong>{t('interactive')}</strong><small>{t('interactiveDesc')}</small></span>
      <input
        type="checkbox"
        checked={settings.interactive}
        onChange={event => props.updatePluginSetting('interactive', event.target.checked)}
      />
    </label>
  </div>
}
