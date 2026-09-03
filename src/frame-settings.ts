/**
 * The frame-capture knobs the web UI exposes ("设置 → 侧边卡片 → 侧边栏内容 →
 * CDP实时视图"): one spec table shared by the host config schemas, the
 * UI-override reader, and the settings panel. Import-free on purpose — the
 * client bundle (browser-pure, Node builtins rejected at build time) and the
 * host bundle both value-import this module.
 *
 * @module dsh-sidebar-cdp-browser/frame-settings
 */

/** The four frame-capture keys adjustable from the web UI. */
export type FrameFieldKey = 'frameQuality' | 'frameEveryNth' | 'frameMaxWidth' | 'frameMaxHeight'

/** One frame field: pluginSettings key, allowed integer range, code default. */
export interface FrameFieldSpec {
  readonly key: FrameFieldKey
  readonly min: number
  readonly max: number
  readonly def: number
}

/**
 * The single source of truth for the frame-field ranges and defaults:
 * `config.ts` builds its zod / schemastery schemas from this table, and the
 * settings panel mirrors the same bounds in its inputs — they can never
 * drift apart.
 */
export const FRAME_FIELD_SPECS: readonly FrameFieldSpec[] = [
  { key: 'frameQuality', min: 20, max: 90, def: 60 },
  { key: 'frameEveryNth', min: 1, max: 30, def: 1 },
  { key: 'frameMaxWidth', min: 320, max: 3840, def: 1280 },
  { key: 'frameMaxHeight', min: 240, max: 2160, def: 900 },
]

/** All four values resolved (loader config / effective capture params). */
export type FrameFieldValues = Record<FrameFieldKey, number>

/** Only the keys explicitly set by the web UI (absent = use the base value). */
export type FrameFieldOverrides = Partial<FrameFieldValues>

/** The code defaults as a complete value set. */
export function defaultFrameValues(): FrameFieldValues {
  const values = {} as FrameFieldValues
  for (const spec of FRAME_FIELD_SPECS) values[spec.key] = spec.def
  return values
}

/** Whether one raw number is a valid value for the spec (int, in range). */
function isValid(spec: FrameFieldSpec, value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= spec.min && value <= spec.max
}

/**
 * Extract the VALID frame overrides from an arbitrary blob (the better-sidebar
 * pluginSettings document): junk — non-numbers, non-integers, out-of-range —
 * is silently ignored, so a corrupted doc can never poison the capture
 * params (the base value survives instead).
 */
export function readFrameOverrides(raw: unknown): FrameFieldOverrides {
  const overrides: FrameFieldOverrides = {}
  if (raw === null || typeof raw !== 'object') return overrides
  const blob = raw as Record<string, unknown>
  for (const spec of FRAME_FIELD_SPECS) {
    const value = blob[spec.key]
    if (isValid(spec, value)) overrides[spec.key] = value
  }
  return overrides
}

/**
 * UI-over-_base precedence: each override that is still valid wins over the
 * base (loader-config) value; everything else keeps the base. Called at
 * screencast start, so a settings write applies without a plugin reload.
 */
export function resolveFrameValues(base: FrameFieldValues, overrides: FrameFieldOverrides): FrameFieldValues {
  const merged = {} as FrameFieldValues
  for (const spec of FRAME_FIELD_SPECS) {
    const override = overrides[spec.key]
    merged[spec.key] = isValid(spec, override) ? override : base[spec.key]
  }
  return merged
}

/** Value equality over all four keys (change detection for the restart nudge). */
export function sameFrameValues(a: FrameFieldValues, b: FrameFieldValues): boolean {
  return FRAME_FIELD_SPECS.every(spec => a[spec.key] === b[spec.key])
}
