import type { TargetDescriptor } from './cdp-api.ts'
import { IconCloseFill14, IconPlusOutline16 } from './icons.tsx'
import { t } from './locales.ts'
import css from './cdp-live.module.css'

/**
 * Remote browser tabs, styled after the better-sidebar tab bar: one row of
 * title tabs (active tab highlighted, title truncated with the URL as the
 * tooltip), a close button per tab, and a trailing "+" that opens a new tab —
 * the close/new controls only render while the session allows interaction.
 */
export function TargetTabStrip(props: {
  targets: TargetDescriptor[]
  selectedKey?: string
  canClose?: boolean
  canCreate?: boolean
  disabled?: boolean
  onSelect(key: string): void
  onClose(key: string): void
  onCreate(): void
}) {
  // Chromium exits when its last tab closes — the × stays visible but is
  // locked (with a tooltip) whenever only one tab remains. The host refuses
  // the close too; this is the affordance, that is the enforcement.
  const lastTab = props.targets.length <= 1
  return <div className={css.targetTabs} role="tablist">
    {props.targets.length === 0 && <span className={css.emptyTabs}>{t('noTargets')}</span>}
    {props.targets.map(target => {
      const active = target.key === props.selectedKey
      const label = target.title || target.url || target.type
      const closeBlocked = props.canClose && lastTab
      return <div
        key={target.key}
        role="tab"
        aria-selected={active}
        tabIndex={0}
        className={`${css.tab}${active ? ` ${css.tabActive}` : ''}`}
        onClick={() => props.onSelect(target.key)}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); props.onSelect(target.key) } }}
        title={`${label}\n${target.url}`}
      >
        <span className={css.tabTitle}>{label}</span>
        {props.canClose && <button
          type="button"
          className={css.tabClose}
          aria-label={closeBlocked ? t('keepLastTab') : t('closeTab')}
          title={closeBlocked ? t('keepLastTab') : t('closeTab')}
          disabled={props.disabled || closeBlocked}
          onClick={event => { event.stopPropagation(); props.onClose(target.key) }}
        >
          <IconCloseFill14 size={12} />
        </button>}
      </div>
    })}
    {props.canCreate && <button
      type="button"
      className={css.newTabButton}
      aria-label={t('newTab')}
      title={t('newTab')}
      disabled={props.disabled}
      onClick={props.onCreate}
    >
      <IconPlusOutline16 size={14} />
    </button>}
  </div>
}
