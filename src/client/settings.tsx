/**
 * The side-card settings panel ("设置 → 侧边卡片 → 侧边栏内容 → CDP实时视图"
 * gear popup): the CDP endpoint, the interactive-mode switch, and the four
 * frame-capture knobs (quality / interval / max width × height), persisted in
 * better-sidebar's `pluginSettings['dsh-sidebar-cdp-browser:live']`.
 *
 * The row chrome mirrors better-sidebar's own secondary-settings popup rows
 * (l2 hairline card, 12px radius, layer-3 fill, 36×20 switch, compact numeric
 * inputs) so this panel reads as one design language with the other
 * sidebar-content feature panels. Number rows follow the same discipline as
 * dsh-sidebar-vscode's cap rows: the input shows the EFFECTIVE value at rest
 * (the stored override, else the host-served effective value — loader config
 * merged with overrides — else the code default), out-of-range drafts flag
 * live, and blur/Enter commits the clamped value only when it changed.
 *
 * @module dsh-sidebar-cdp-browser/client/settings
 */

import { useEffect, useState } from 'react'
import type { SidebarSettingsRenderProps } from 'dsh-better-sidebar/client/service'
import { DEFAULT_ENDPOINT_DISPLAY } from './cdp-api.ts'
import { t } from './i18n.ts'
import {
  FRAME_FIELD_SPECS,
  defaultFrameValues,
  readFrameOverrides,
  resolveFrameValues,
  type FrameFieldKey,
  type FrameFieldSpec,
  type FrameFieldOverrides,
  type FrameFieldValues,
} from '../frame-settings.ts'
import css from './cdp-live.module.css'

/** Read-only route serving the host's effective frame config (routes/http.ts). */
const CONFIG_ROUTE = '/dsh-cdp-live/api/config'

/** One frame spec looked up by key (the table is tiny; find is clearest). */
function specOf(key: FrameFieldKey): FrameFieldSpec {
  const spec = FRAME_FIELD_SPECS.find(entry => entry.key === key)
  if (spec === undefined) throw new Error(`unknown frame field: ${key}`)
  return spec
}

export interface LiveViewSettings {
  endpoint: string
  interactive: boolean
  /** Only the EXPLICIT frame overrides this panel stored; absent keys fall
   * back to the loader config (the host merges — see frame-settings.ts). */
  frame: FrameFieldOverrides
}

/** Empty endpoint = the default loopback address (the host normalizes). */
export function readSettings(value: Record<string, unknown> | undefined): LiveViewSettings {
  return {
    endpoint: typeof value?.endpoint === 'string' ? value.endpoint : '',
    interactive: value?.interactive === true,
    frame: readFrameOverrides(value),
  }
}

/**
 * One bounded numeric input of a frame row. The draft is local state that is
 * null at rest (the input mirrors the effective value) and raw text while
 * editing, so external store updates never clobber a mid-edit draft and an
 * unchanged draft never produces a write.
 */
function FrameNumberInput(props: {
  spec: FrameFieldSpec
  /** The value stored in pluginSettings (undefined = the key is unset). */
  stored: number | undefined
  /** What to display when unset: the host-effective value (or code default). */
  fallback: number
  ariaLabel: string
  onWrite(next: number): void
}) {
  const { spec, stored, fallback, ariaLabel, onWrite } = props
  const effective = stored ?? fallback
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(effective)
  const parsed = Number(shown)
  const outOfRange = shown.trim() !== '' && (!Number.isFinite(parsed) || parsed < spec.min || parsed > spec.max)

  /** Blur / Enter: empty or unparsable reverts; otherwise commit the
   * clamped value, writing only when it differs from what is in effect. */
  const commit = (): void => {
    if (draft === null) return
    const text = draft.trim()
    setDraft(null)
    if (text === '' || !Number.isFinite(Number(text))) return
    const clamped = Math.min(spec.max, Math.max(spec.min, Math.round(Number(text))))
    if (clamped !== effective) onWrite(clamped)
  }

  return (
    <input
      type="number"
      className={css.settingNumber}
      value={shown}
      min={spec.min}
      max={spec.max}
      step={1}
      inputMode="numeric"
      aria-label={ariaLabel}
      aria-invalid={outOfRange}
      data-invalid={outOfRange ? 'true' : undefined}
      title={outOfRange ? t('settingRangeHint') : undefined}
      onChange={event => { setDraft(event.currentTarget.value) }}
      onBlur={commit}
      onKeyDown={event => {
        // Enter commits directly (jsdom's blur() is a no-op unless focused,
        // and an explicit commit is deterministic either way); the following
        // blur re-run of commit is a no-op (the draft is already null).
        if (event.key !== 'Enter') return
        event.preventDefault()
        commit()
        event.currentTarget.blur()
      }}
    />
  )
}

/** One frame row: title/description left, a single numeric input right. */
function FrameRow(props: {
  spec: FrameFieldSpec
  title: string
  desc: string
  stored: number | undefined
  fallback: number
  onWrite(next: number): void
}) {
  return (
    <div className={css.settingRow} data-cdp-frame-row={props.spec.key}>
      <span className={css.settingText}>
        <span className={css.settingTitle}>{props.title}</span>
        <span className={css.settingDesc}>{props.desc}</span>
      </span>
      <span className={css.settingControl}>
        <FrameNumberInput spec={props.spec} stored={props.stored} fallback={props.fallback} ariaLabel={props.title} onWrite={props.onWrite} />
      </span>
    </div>
  )
}

export function SettingsPanel(props: SidebarSettingsRenderProps) {
  const settings = readSettings(props.pluginSettings)
  const [draft, setDraft] = useState(settings.endpoint)
  // Re-adopt the persisted value whenever the document changes (another tab
  // committing an edit overwrites a local draft mid-typing); local edits
  // otherwise stay in the draft and only leave on blur/Enter.
  useEffect(() => { setDraft(settings.endpoint) }, [settings.endpoint])

  // The host's effective frame values (loader config merged with the UI
  // overrides), fetched once on mount so UNSET fields display the real
  // effective value instead of a possibly-wrong code default. Falls back to
  // the code defaults merged with the stored overrides when unreachable.
  const [hostFrame, setHostFrame] = useState<FrameFieldValues>(() => resolveFrameValues(defaultFrameValues(), settings.frame))
  useEffect(() => {
    if (typeof fetch !== 'function') return
    let cancelled = false
    try {
      fetch(CONFIG_ROUTE, { headers: { accept: 'application/json' } })
        .then(async response => await response.json() as { ok?: boolean; value?: { frame?: FrameFieldValues } })
        .then(body => {
          if (!cancelled && body.ok === true && body.value?.frame !== undefined) setHostFrame(body.value.frame)
        })
        .catch(() => undefined)
    } catch {
      // An unreachable host (or a non-absolute URL before a real origin)
      // just leaves the code defaults in place — cosmetic, never fatal.
    }
    return () => { cancelled = true }
  }, [])

  /** The value one input shows at rest: the stored override, else effective. */
  const fallbackOf = (spec: FrameFieldSpec): number => settings.frame[spec.key] ?? hostFrame[spec.key] ?? spec.def
  const writeFrame = (key: FrameFieldKey, next: number): void => { props.updatePluginSetting(key, next) }

  const commitEndpoint = (): void => {
    const next = draft.trim()
    if (next !== settings.endpoint) props.updatePluginSetting('endpoint', next)
    else setDraft(next)
  }

  return <div className={css.settingsPanel}>
    <div className={`${css.settingRow} ${css.settingRowStack}`} data-cdp-endpoint-row>
      <span className={css.settingText}>
        <span className={css.settingTitle}>{t('endpoint')}</span>
        <span className={css.settingDesc}>{t('endpointDesc')}</span>
      </span>
      <input
        type="text"
        className={css.settingInput}
        value={draft}
        placeholder={DEFAULT_ENDPOINT_DISPLAY}
        aria-label={t('endpoint')}
        spellCheck={false}
        onChange={event => { setDraft(event.target.value) }}
        onBlur={commitEndpoint}
        onKeyDown={event => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          commitEndpoint()
          event.currentTarget.blur()
        }}
      />
      <span className={css.settingDesc}>{t('endpointFallback')}</span>
    </div>
    <div className={css.settingRow} data-cdp-interactive-row>
      <span className={css.settingText}>
        <span className={css.settingTitle}>{t('interactive')}</span>
        <span className={css.settingDesc}>{t('interactiveDesc')}</span>
      </span>
      <label className={css.settingSwitch}>
        <input
          type="checkbox"
          className={css.switchInput}
          checked={settings.interactive}
          aria-label={t('interactive')}
          onChange={event => { props.updatePluginSetting('interactive', event.currentTarget.checked) }}
        />
        <span className={css.switchTrack} aria-hidden="true"><span className={css.switchThumb} /></span>
      </label>
    </div>
    <FrameRow
      spec={specOf('frameQuality')}
      title={t('frameQuality')}
      desc={t('frameQualityDesc')}
      stored={settings.frame.frameQuality}
      fallback={fallbackOf(specOf('frameQuality'))}
      onWrite={next => writeFrame('frameQuality', next)}
    />
    <FrameRow
      spec={specOf('frameEveryNth')}
      title={t('frameEveryNth')}
      desc={t('frameEveryNthDesc')}
      stored={settings.frame.frameEveryNth}
      fallback={fallbackOf(specOf('frameEveryNth'))}
      onWrite={next => writeFrame('frameEveryNth', next)}
    />
    {/* Width and height sit side by side: one dimension pair, one row. */}
    <div className={css.settingRow} data-cdp-frame-row="frameMaxSize">
      <span className={css.settingText}>
        <span className={css.settingTitle}>{t('frameMaxSize')}</span>
        <span className={css.settingDesc}>{t('frameMaxSizeDesc')}</span>
      </span>
      <span className={css.settingControl}>
        <FrameNumberInput
          spec={specOf('frameMaxWidth')}
          stored={settings.frame.frameMaxWidth}
          fallback={fallbackOf(specOf('frameMaxWidth'))}
          ariaLabel={`${t('frameMaxSize')} · ${t('frameWidth')}`}
          onWrite={next => writeFrame('frameMaxWidth', next)}
        />
        <span className={css.settingTimes} aria-hidden="true">×</span>
        <FrameNumberInput
          spec={specOf('frameMaxHeight')}
          stored={settings.frame.frameMaxHeight}
          fallback={fallbackOf(specOf('frameMaxHeight'))}
          ariaLabel={`${t('frameMaxSize')} · ${t('frameHeight')}`}
          onWrite={next => writeFrame('frameMaxHeight', next)}
        />
      </span>
    </div>
    <p className={css.settingHint}>{t('frameApplyHint')}</p>
  </div>
}
