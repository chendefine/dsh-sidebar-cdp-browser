/**
 * The settings panel DOM ("设置 → 侧边卡片 → 侧边栏内容 → CDP实时视图" gear
 * popup): the popup-row layout (endpoint / interactive switch / frame rows),
 * the effective-value display for unset frame fields, and the numeric
 * commit discipline (draft at rest, live out-of-range flag, clamped
 * blur/Enter commit, write-only-on-change). Asserted via aria-labels so the
 * checks survive CSS module hashing.
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsPanel, readSettings } from '../src/client/settings.tsx'
import { t } from '../src/client/i18n.ts'
import type { SidebarSettingsRenderProps } from 'dsh-better-sidebar/client/service'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
afterEach(cleanup)

type Write = { key: string, value: unknown }

function mountPanel(pluginSettings: Record<string, unknown> = {}, writes: Write[] = []): { update: ReturnType<typeof vi.fn> } {
  const update = vi.fn((key: string, value: unknown) => { writes.push({ key, value }) })
  const props = { pluginSettings, updatePluginSetting: update } as unknown as SidebarSettingsRenderProps
  render(<SettingsPanel {...props} />)
  return { update }
}

const qualityLabel = t('frameQuality')
const intervalLabel = t('frameEveryNth')
const widthLabel = `${t('frameMaxSize')} · ${t('frameWidth')}`
const heightLabel = `${t('frameMaxSize')} · ${t('frameHeight')}`

const valueOf = (node: Element): string => (node as HTMLInputElement).value

describe('SettingsPanel layout', () => {
  it('renders the endpoint, the interactive switch, and all four frame inputs', () => {
    mountPanel()
    expect(screen.getByLabelText(t('endpoint'))).toBeDefined()
    expect(screen.getByLabelText(t('interactive'))).toBeDefined()
    expect(screen.getByLabelText(qualityLabel)).toBeDefined()
    expect(screen.getByLabelText(intervalLabel)).toBeDefined()
    // Width and height share one row, side by side, as two labeled inputs.
    expect(screen.getByLabelText(widthLabel)).toBeDefined()
    expect(screen.getByLabelText(heightLabel)).toBeDefined()
  })

  it('displays the code defaults for unset frame fields when the config route is unreachable', () => {
    mountPanel()
    expect(valueOf(screen.getByLabelText(qualityLabel))).toBe('60')
    expect(valueOf(screen.getByLabelText(intervalLabel))).toBe('1')
    expect(valueOf(screen.getByLabelText(widthLabel))).toBe('1280')
    expect(valueOf(screen.getByLabelText(heightLabel))).toBe('900')
  })

  it('displays stored overrides verbatim', () => {
    mountPanel({ frameQuality: 75, frameMaxWidth: 1920 })
    expect(valueOf(screen.getByLabelText(qualityLabel))).toBe('75')
    expect(valueOf(screen.getByLabelText(widthLabel))).toBe('1920')
    expect(valueOf(screen.getByLabelText(intervalLabel))).toBe('1')
  })
})

describe('SettingsPanel frame commits', () => {
  it('commits an in-range edit on blur and writes nothing when untouched', () => {
    const { update } = mountPanel()
    const quality = screen.getByLabelText(qualityLabel)
    fireEvent.blur(quality) // untouched blur: no write
    expect(update).not.toHaveBeenCalled()

    fireEvent.change(quality, { target: { value: '75' } })
    fireEvent.blur(quality)
    expect(update).toHaveBeenCalledWith('frameQuality', 75)
  })

  it('commits Enter like blur', () => {
    const { update } = mountPanel()
    const interval = screen.getByLabelText(intervalLabel)
    fireEvent.change(interval, { target: { value: '3' } })
    fireEvent.keyDown(interval, { key: 'Enter' })
    expect(update).toHaveBeenCalledWith('frameEveryNth', 3)
  })

  it('clamps an out-of-range draft to the nearest bound and flags it live', () => {
    const { update } = mountPanel()
    const quality = screen.getByLabelText(qualityLabel)
    fireEvent.change(quality, { target: { value: '999' } })
    expect(quality.getAttribute('aria-invalid')).toBe('true')
    fireEvent.blur(quality)
    expect(update).toHaveBeenCalledWith('frameQuality', 90)

    const height = screen.getByLabelText(heightLabel)
    fireEvent.change(height, { target: { value: '10' } })
    fireEvent.blur(height)
    expect(update).toHaveBeenCalledWith('frameMaxHeight', 240)
  })

  it('reverts silently on a cleared field (no write)', () => {
    const { update } = mountPanel()
    const width = screen.getByLabelText(widthLabel)
    fireEvent.change(width, { target: { value: '' } })
    fireEvent.blur(width)
    expect(update).not.toHaveBeenCalled()
  })

  it('does not re-write a value equal to the effective one (the key stays unset)', () => {
    const { update } = mountPanel()
    const quality = screen.getByLabelText(qualityLabel)
    fireEvent.change(quality, { target: { value: '60' } })
    fireEvent.blur(quality)
    expect(update).not.toHaveBeenCalled()
  })

  it('commits width and height independently from the paired row', () => {
    const { update } = mountPanel()
    fireEvent.change(screen.getByLabelText(widthLabel), { target: { value: '1920' } })
    fireEvent.blur(screen.getByLabelText(widthLabel))
    fireEvent.change(screen.getByLabelText(heightLabel), { target: { value: '1080' } })
    fireEvent.blur(screen.getByLabelText(heightLabel))
    expect(update).toHaveBeenCalledWith('frameMaxWidth', 1920)
    expect(update).toHaveBeenCalledWith('frameMaxHeight', 1080)
  })
})

describe('readSettings', () => {
  it('parses endpoint/interactive and filters the frame overrides', () => {
    expect(readSettings({
      endpoint: ' 10.1.1.5:9223 ', interactive: true,
      frameQuality: 75, frameEveryNth: 0, frameMaxWidth: 1600,
    })).toEqual({
      endpoint: ' 10.1.1.5:9223 ', interactive: true,
      frame: { frameQuality: 75, frameMaxWidth: 1600 },
    })
    expect(readSettings(undefined)).toEqual({ endpoint: '', interactive: false, frame: {} })
  })
})
