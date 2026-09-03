/**
 * i18n coverage: the zh/en dictionaries stay key-aligned, `t()` follows the
 * DSH locale service (with a browser-language fallback before attach), the
 * host close reasons map to localized copy, and the loader Config carries
 * bilingual per-field descriptions (schemastery `i18n()`).
 */
import { describe, expect, it } from 'vitest'
import { en, zh, NS, type LocaleKey } from '../src/client/locales.ts'
import { activeLocale, attachLocale, closingMessage, t } from '../src/client/i18n.ts'
import { Config } from '../src/config.ts'

type Dict = Record<LocaleKey, string>

describe('locale dictionaries', () => {
  it('keeps zh and en key-aligned with non-empty copy', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
    for (const key of Object.keys(en) as LocaleKey[]) {
      expect((zh as Dict)[key].length).toBeGreaterThan(0)
      expect((en as Dict)[key].length).toBeGreaterThan(0)
    }
  })
})

describe('t()', () => {
  it('falls back to the browser language before the service attaches', () => {
    // node/vitest default navigator (en-US) — must resolve English copy.
    expect(activeLocale().toLowerCase().startsWith('zh')).toBe(false)
    expect(t('title')).toBe(en.title)
  })

  it('follows the service snapshot after attachLocale, and detaches on dispose', () => {
    const registered: Array<[string, string]> = []
    const unregistered: string[] = []
    let active = 'zh'
    const dispose = attachLocale({
      register: (ns, locale, dict) => {
        registered.push([ns, locale])
        expect(Object.keys(dict).length).toBeGreaterThan(0)
        return () => unregistered.push(locale)
      },
      getSnapshot: () => ({ active }),
    })
    expect(registered).toEqual([[NS, 'zh'], [NS, 'en']])
    expect(t('title')).toBe(zh.title)
    active = 'en'
    expect(t('title')).toBe(en.title)
    active = 'zh-CN'
    expect(t('title')).toBe(zh.title)
    dispose()
    expect(unregistered.sort()).toEqual(['en', 'zh'])
    // detached: back to the browser-language fallback
    expect(t('title')).toBe(en.title)
  })
})

describe('closingMessage()', () => {
  it('localizes the known host close reasons', () => {
    expect(closingMessage(1012, 'cdp endpoint changed')).toBe(t('closeEndpointChanged'))
    expect(closingMessage(1012, 'cdp frame settings changed')).toBe(t('closeFrameChanged'))
    expect(closingMessage(1013, 'client backpressure limit exceeded')).toBe(t('closeBackpressure'))
  })

  it('passes unknown diagnostic reasons through and formats bare closes', () => {
    expect(closingMessage(1011, 'CDP discovery failed with HTTP 404'))
      .toBe('CDP discovery failed with HTTP 404')
    expect(closingMessage(1006, '')).toBe(t('closedWithCode').replace('{code}', '1006'))
  })
})

describe('loader Config descriptions', () => {
  it('carries zh/en descriptions on every field', () => {
    const fields = (Config as unknown as { dict: Record<string, { meta: { description?: unknown } }> }).dict
    const keys = Object.keys(fields)
    expect(keys.length).toBe(8)
    for (const key of keys) {
      const description = fields[key]!.meta.description as Record<string, string>
      expect(description.zh?.length ?? 0).toBeGreaterThan(0)
      expect(description.en?.length ?? 0).toBeGreaterThan(0)
    }
  })
})
