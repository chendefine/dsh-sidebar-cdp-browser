/**
 * Chrome component tests: the navigation toolbar (icon buttons + address bar)
 * and the target tab strip (titles / close / new tab), the v0.2.0 interaction
 * layer. Asserted via aria-labels and visible text so the checks survive CSS
 * module hashing and locale selection.
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserToolbar } from '../src/client/BrowserToolbar.tsx'
import { TargetTabStrip } from '../src/client/TargetTabStrip.tsx'
import { t } from '../src/client/locales.ts'
import type { TargetDescriptor } from '../src/client/cdp-api.ts'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
afterEach(cleanup)

function target(partial: Partial<TargetDescriptor> & { key: string }): TargetDescriptor {
  return {
    type: 'page', title: '', url: '', lifecycle: 'available', attached: false,
    createdAt: 0, updatedAt: 0, ...partial,
  }
}

describe('BrowserToolbar', () => {
  const noop = (): void => {}

  it('fires back / forward / reload from the icon buttons', () => {
    const onBack = vi.fn(), onForward = vi.fn(), onReload = vi.fn()
    render(<BrowserToolbar url="https://example.com/" onBack={onBack} onForward={onForward} onReload={onReload} onNavigate={noop} />)
    fireEvent.click(screen.getByRole('button', { name: t('back') }))
    fireEvent.click(screen.getByRole('button', { name: t('forward') }))
    fireEvent.click(screen.getByRole('button', { name: t('reload') }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onForward).toHaveBeenCalledTimes(1)
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('navigates on Enter with an https:// default scheme, or directly for explicit schemes', () => {
    const onNavigate = vi.fn()
    render(<BrowserToolbar onBack={noop} onForward={noop} onReload={noop} onNavigate={onNavigate} />)
    const input = screen.getByLabelText(t('address'))
    fireEvent.change(input, { target: { value: 'baidu.com' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onNavigate).toHaveBeenCalledWith('https://baidu.com')
    fireEvent.change(input, { target: { value: 'http://example.com/' } })
    fireEvent.click(screen.getByRole('button', { name: t('navigate') }))
    expect(onNavigate).toHaveBeenCalledWith('http://example.com/')
    expect(onNavigate).toHaveBeenCalledTimes(2)
  })

  /**
   * The v0.2.1 regression: clicking 前往 blurs the input BEFORE the click
   * fires, so an onBlur re-sync used to reset the typed URL back to the
   * current page's URL — the button then navigated to the OLD address.
   */
  it('keeps the typed URL when clicking go (blur fires before the click)', () => {
    const onNavigate = vi.fn()
    render(<BrowserToolbar url="https://old.example/" onBack={noop} onForward={noop} onReload={noop} onNavigate={onNavigate} />)
    const input = screen.getByLabelText(t('address'))
    const go = screen.getByRole('button', { name: t('navigate') })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'new.example.com' } })
    // Exactly what a real click does: blur first, then click.
    fireEvent.blur(input)
    fireEvent.click(go)
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(onNavigate).toHaveBeenCalledWith('https://new.example.com')
  })

  it('Escape abandons the edit back to the current URL', () => {
    const onNavigate = vi.fn()
    render(<BrowserToolbar url="https://old.example/" onBack={noop} onForward={noop} onReload={noop} onNavigate={onNavigate} />)
    const input = screen.getByLabelText(t('address')) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'typed-junk' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.value).toBe('https://old.example/')
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('disables every control while disconnected and keeps edits through URL updates', () => {
    const onNavigate = vi.fn()
    const { rerender } = render(<BrowserToolbar url="https://a.example/" disabled onBack={noop} onForward={noop} onReload={noop} onNavigate={onNavigate} />)
    const input = screen.getByLabelText(t('address')) as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect((screen.getByRole('button', { name: t('back') }) as HTMLButtonElement).disabled).toBe(true)
    // While editing, server URL pushes must not clobber the typing — and the
    // edit survives blur too (only navigation or Escape reclaims the field).
    fireEvent.change(input, { target: { value: 'partial' } })
    rerender(<BrowserToolbar url="https://b.example/" disabled onBack={noop} onForward={noop} onReload={noop} onNavigate={onNavigate} />)
    expect(input.value).toBe('partial')
    fireEvent.blur(input)
    expect(input.value).toBe('partial')
  })
})

describe('TargetTabStrip', () => {
  const targets = [
    target({ key: 'k1', title: '百度一下', url: 'https://www.baidu.com/' }),
    target({ key: 'k2', title: '', url: 'https://example.com/' }),
  ]

  it('shows real titles with URL fallback and selects on click', () => {
    const onSelect = vi.fn()
    render(<TargetTabStrip targets={targets} selectedKey="k1" onSelect={onSelect} onClose={() => {}} onCreate={() => {}} />)
    const first = screen.getByRole('tab', { selected: true })
    expect(first.textContent).toContain('百度一下')
    expect(screen.getAllByRole('tab')[1]!.textContent).toContain('https://example.com/')
    fireEvent.click(screen.getAllByRole('tab')[1]!)
    expect(onSelect).toHaveBeenCalledWith('k2')
  })

  it('closes a tab without selecting it, and only when allowed', () => {
    const onClose = vi.fn(), onSelect = vi.fn()
    const { rerender } = render(
      <TargetTabStrip targets={targets} selectedKey="k1" canClose onSelect={onSelect} onClose={onClose} onCreate={() => {}} />,
    )
    const closeButtons = screen.getAllByRole('button', { name: t('closeTab') })
    expect(closeButtons).toHaveLength(2)
    fireEvent.click(closeButtons[1]!)
    expect(onClose).toHaveBeenCalledWith('k2')
    expect(onSelect).not.toHaveBeenCalled()
    rerender(<TargetTabStrip targets={targets} selectedKey="k1" onSelect={onSelect} onClose={onClose} onCreate={() => {}} />)
    expect(screen.queryByRole('button', { name: t('closeTab') })).toBeNull()
  })

  it('locks the × on the last remaining tab instead of hiding it', () => {
    const onClose = vi.fn()
    const single = [targets[0]!]
    render(<TargetTabStrip targets={single} selectedKey="k1" canClose onSelect={() => {}} onClose={onClose} onCreate={() => {}} />)
    const close = screen.getByRole('button', { name: t('keepLastTab') }) as HTMLButtonElement
    expect(close.disabled).toBe(true)
    fireEvent.click(close)
    expect(onClose).not.toHaveBeenCalled()
    // With two tabs the same × is active and reverts to the normal label.
    cleanup()
    render(<TargetTabStrip targets={targets} selectedKey="k1" canClose onSelect={() => {}} onClose={onClose} onCreate={() => {}} />)
    const active = screen.getAllByRole('button', { name: t('closeTab') })[0]! as HTMLButtonElement
    expect(active.disabled).toBe(false)
  })

  it('offers a new-tab button only when creation is allowed', () => {
    const onCreate = vi.fn()
    const { rerender } = render(<TargetTabStrip targets={targets} selectedKey="k1" onSelect={() => {}} onClose={() => {}} onCreate={onCreate} />)
    expect(screen.queryByRole('button', { name: t('newTab') })).toBeNull()
    rerender(<TargetTabStrip targets={targets} selectedKey="k1" canCreate onSelect={() => {}} onClose={() => {}} onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button', { name: t('newTab') }))
    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('renders the empty state when no targets exist', () => {
    render(<TargetTabStrip targets={[]} onSelect={() => {}} onClose={() => {}} onCreate={() => {}} />)
    expect(screen.getByText(t('noTargets')).textContent).toBe(t('noTargets'))
  })
})
