import { useEffect, useRef, useState, type Ref } from 'react'
import { IconChevronLeftOutline14, IconChevronRightOutline14, IconLinkOutline14, IconRefreshOutline14 } from './icons.tsx'
import { t } from './locales.ts'
import css from './cdp-live.module.css'

/**
 * Navigation chrome, styled after the built-in better-sidebar browser bar:
 * circular token-driven icon buttons (chevrons / refresh / link-go) around a
 * single-line address input — same glyphs and same spacing rhythm.
 *
 * Edit ownership uses a dirty ref, NOT blur: clicking 前往 blurs the input
 * BEFORE the click fires, so an onBlur re-sync would clobber the typed URL
 * back to the current page's URL and navigate to the OLD address (the exact
 * bug fixed here). The input keeps the user's text across blur and only
 * re-syncs when a navigation actually changes the URL (dirty=false by then);
 * Escape abandons the edit explicitly. The parent remounts this component
 * per target switch (key=targetKey), which also resets any stale edit.
 */
export function BrowserToolbar(props: {
  url?: string
  disabled?: boolean
  /** Allows the parent to focus the address bar (e.g. right after opening a new tab). */
  inputRef?: Ref<HTMLInputElement>
  onNavigate(url: string): void
  onBack(): void
  onForward(): void
  onReload(): void
}) {
  const [value, setValue] = useState(props.url ?? '')
  const dirty = useRef(false)
  useEffect(() => { if (!dirty.current) setValue(props.url ?? '') }, [props.url])
  const abandon = (): void => {
    dirty.current = false
    setValue(props.url ?? '')
  }
  const go = (): void => {
    const input = value.trim()
    if (!input) return
    dirty.current = false
    props.onNavigate(/^https?:\/\//i.test(input) ? input : `https://${input}`)
  }
  return <div className={css.browserBar}>
    <button type="button" className={css.iconButton} aria-label={t('back')} title={t('back')} disabled={props.disabled} onClick={props.onBack}>
      <IconChevronLeftOutline14 />
    </button>
    <button type="button" className={css.iconButton} aria-label={t('forward')} title={t('forward')} disabled={props.disabled} onClick={props.onForward}>
      <IconChevronRightOutline14 />
    </button>
    <button type="button" className={css.iconButton} aria-label={t('reload')} title={t('reload')} disabled={props.disabled} onClick={props.onReload}>
      <IconRefreshOutline14 />
    </button>
    <input
      ref={props.inputRef}
      className={css.browserInput}
      aria-label={t('address')}
      value={value}
      placeholder={t('address')}
      spellCheck={false}
      disabled={props.disabled}
      onChange={event => { dirty.current = true; setValue(event.target.value) }}
      onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); go() }
        else if (event.key === 'Escape') { event.preventDefault(); abandon() }
        event.stopPropagation()
      }}
    />
    <button type="button" className={css.iconButton} aria-label={t('navigate')} title={t('navigate')} disabled={props.disabled || !value.trim()} onClick={go}>
      <IconLinkOutline14 />
    </button>
  </div>
}
