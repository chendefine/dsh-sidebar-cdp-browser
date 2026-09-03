/**
 * Locale integration: registers the zh/en dictionaries with the DSH locale
 * service (via the client context's `locale` face) and serves `t()` from the
 * active locale. `t()` is a plain function over a module-level service
 * handle — React re-renders pick new copy up through the app-wide locale
 * re-render; the tab title and settings rows use `() => t(...)` callbacks so
 * their re-renders read fresh values.
 *
 * The active locale follows the DSH i18n system (the host-backed
 * `locale.preference` setting) rather than the raw browser language; the
 * browser language is only the pre-service fallback.
 *
 * @module dsh-sidebar-cdp-browser/client/i18n
 */

import { en, zh, NS, type LocaleKey } from './locales.ts'

/** One supported dictionary locale id. */
export type LocaleId = 'zh' | 'en'

/** The locale service face (structural subset of the better-sidebar context
 *  mirror of @deepseek-ai/dsh-client-locale). */
export interface LocaleServiceFace {
  /** Registers one locale's dictionary; returns an unregister disposer when
   *  the real service provides one (void-tolerant for foreign shapes). */
  register(ns: string, locale: string, dict: Record<string, string>): unknown
  /** The active locale snapshot (`active` is 'zh' | 'en' today). */
  getSnapshot(): { active: string }
}

/** Attached service (module-level; the plugin is a singleton per page). */
let localeService: LocaleServiceFace | undefined

/** The active locale id: the service snapshot, else the browser language. */
export function activeLocale(): string {
  return localeService?.getSnapshot().active
    ?? (typeof navigator !== 'undefined' ? navigator.language : 'en')
}

/** Translate one copy key in the active locale (zh* → zh, else en). */
export function t(key: LocaleKey): string {
  return (activeLocale().toLowerCase().startsWith('zh') ? zh : en)[key]
}

/** The known host-side close reasons, localized (unknown reasons pass
 *  through verbatim — they are diagnostic text, not UI copy). */
const CLOSE_REASON_KEYS: Record<string, LocaleKey> = {
  'cdp endpoint changed': 'closeEndpointChanged',
  'cdp frame settings changed': 'closeFrameChanged',
  'client backpressure limit exceeded': 'closeBackpressure',
}

/** Localize a WebSocket close event into UI copy. */
export function closingMessage(code: number, reason: string): string {
  const key = CLOSE_REASON_KEYS[reason]
  if (key !== undefined) return t(key)
  return reason !== '' ? reason : t('closedWithCode').replace('{code}', String(code))
}

/**
 * Wire the dictionaries to the service (called once from the plugin body).
 * @returns the disposer cordis holds via `ctx.effect`: unregisters the
 * dictionaries (each service disposer, when returned) and drops the
 * module-level service handle.
 */
export function attachLocale(service: LocaleServiceFace): () => void {
  localeService = service
  const stops = (['zh', 'en'] as const).map(locale =>
    service.register(NS, locale, locale === 'zh' ? { ...zh } : { ...en }))
  return () => {
    for (const stop of stops) if (typeof stop === 'function') stop()
    localeService = undefined
  }
}
