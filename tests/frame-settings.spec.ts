/**
 * The frame-capture spec table (frame-settings.ts) is the single source of
 * truth the web-UI settings panel, the UI-override reader, and BOTH config
 * schemas derive from — these tests pin the ranges/defaults and the
 * UI-over-base precedence so the three surfaces cannot drift apart.
 */
import { describe, expect, it } from 'vitest'
import { resolveCdpLiveConfig } from '../src/config.ts'
import {
  FRAME_FIELD_SPECS,
  defaultFrameValues,
  readFrameOverrides,
  resolveFrameValues,
  sameFrameValues,
} from '../src/frame-settings.ts'

const specOf = (key: string) => FRAME_FIELD_SPECS.find(spec => spec.key === key)

describe('frame field spec table', () => {
  it('declares the four UI-adjustable fields with their ranges and defaults', () => {
    expect(specOf('frameQuality')).toEqual({ key: 'frameQuality', min: 20, max: 90, def: 60 })
    expect(specOf('frameEveryNth')).toEqual({ key: 'frameEveryNth', min: 1, max: 30, def: 1 })
    expect(specOf('frameMaxWidth')).toEqual({ key: 'frameMaxWidth', min: 320, max: 3840, def: 1280 })
    expect(specOf('frameMaxHeight')).toEqual({ key: 'frameMaxHeight', min: 240, max: 2160, def: 900 })
    expect(defaultFrameValues()).toEqual({
      frameQuality: 60, frameEveryNth: 1, frameMaxWidth: 1280, frameMaxHeight: 900,
    })
  })

  it('matches the loader schema defaults (config.ts builds from the table)', () => {
    expect(resolveCdpLiveConfig({})).toMatchObject(defaultFrameValues())
    expect(resolveCdpLiveConfig({ frameQuality: 80, frameMaxHeight: 720 })).toMatchObject({
      frameQuality: 80, frameEveryNth: 1, frameMaxWidth: 1280, frameMaxHeight: 720,
    })
    expect(() => resolveCdpLiveConfig({ frameQuality: 10 })).toThrow()
    expect(() => resolveCdpLiveConfig({ frameMaxWidth: 100 })).toThrow()
  })
})

describe('readFrameOverrides (the web-UI settings blob)', () => {
  it('keeps valid integers and silently drops junk', () => {
    expect(readFrameOverrides({
      frameQuality: 75, frameEveryNth: 2, frameMaxWidth: 1920, frameMaxHeight: 1080,
      endpoint: '127.0.0.1:9222', interactive: true,
    })).toEqual({ frameQuality: 75, frameEveryNth: 2, frameMaxWidth: 1920, frameMaxHeight: 1080 })
    expect(readFrameOverrides({
      frameQuality: 'high', frameEveryNth: 1.5, frameMaxWidth: 9999, frameMaxHeight: 100, frameJunk: 5,
    })).toEqual({})
    expect(readFrameOverrides(undefined)).toEqual({})
    expect(readFrameOverrides(null)).toEqual({})
    expect(readFrameOverrides('nope')).toEqual({})
  })
})

describe('resolveFrameValues (UI-over-loader precedence)', () => {
  const base = { frameQuality: 80, frameEveryNth: 3, frameMaxWidth: 1000, frameMaxHeight: 700 }

  it('lets each valid override win per key and keeps the base elsewhere', () => {
    expect(resolveFrameValues(base, { frameQuality: 25, frameMaxHeight: 2160 })).toEqual({
      frameQuality: 25, frameEveryNth: 3, frameMaxWidth: 1000, frameMaxHeight: 2160,
    })
  })

  it('never lets an out-of-range override poison the base value', () => {
    expect(resolveFrameValues(base, { frameQuality: 5 })).toEqual(base)
    expect(resolveFrameValues(base, { frameMaxWidth: Number.NaN })).toEqual(base)
  })

  it('detects changes across all four keys', () => {
    const next = { ...base, frameEveryNth: 4 }
    expect(sameFrameValues(base, next)).toBe(false)
    expect(sameFrameValues(base, { ...base })).toBe(true)
  })
})
