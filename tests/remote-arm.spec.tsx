/**
 * The runtime arm switch (键盘鼠标远程控制): even with the plugin's
 * "interactive input" setting ON, a fresh view opens as a pure OBSERVER —
 * the ticket's mode (and with it the host-side requireInteractive() gate)
 * only turns interactive once the title-bar checkbox is checked. Toggling
 * the box, or the master setting, reconnects with the new mode. All of this
 * is asserted against the real SidebarCdpBrowser wiring with a fake
 * ticket-issuing fetch and a test-driven WebSocket double.
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TabComponentProps } from 'dsh-better-sidebar/client/service'
import { SidebarCdpBrowser } from '../src/client/SidebarCdpBrowser.tsx'
import { t } from '../src/client/i18n.ts'
import type { TargetDescriptor } from '../src/client/cdp-api.ts'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

/** Controllable WebSocket double: the test plays the server. */
class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: FakeWebSocket[] = []
  readyState = FakeWebSocket.CONNECTING
  binaryType = 'blob'
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null
  sent: string[] = []
  constructor(public url: string) { FakeWebSocket.instances.push(this) }
  send(data: string): void { this.sent.push(data) }
  close(code = 1000, reason = ''): void {
    if (this.readyState === FakeWebSocket.CLOSED) return
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code, reason })
  }
  /** Server side: complete the handshake and greet with ready + targets. */
  accept(): void { this.readyState = FakeWebSocket.OPEN; this.onopen?.() }
  push(message: unknown): void { this.onmessage?.({ data: JSON.stringify(message) }) }
}

const page: TargetDescriptor = {
  key: 'k1', type: 'page', title: '示例页', url: 'https://example.com/',
  lifecycle: 'available', attached: false, createdAt: 0, updatedAt: 0,
}

const flush = async (): Promise<void> => { for (let i = 0; i < 8; i++) await Promise.resolve() }

interface Mount { opens: Array<{ sessionId: string; mode: string }>; rerender(prefs: { interactive?: boolean }): void }

function mountCard(prefs: { interactive?: boolean }): Mount {
  let current = prefs
  const opens: Array<{ sessionId: string; mode: string }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { body?: unknown }) => {
    if (String(input) !== '/dsh-cdp-live/api/open') return { ok: true, json: async () => ({ ok: true, value: {} }) }
    opens.push(JSON.parse(String(init?.body)) as { sessionId: string; mode: string })
    return {
      ok: true,
      json: async () => ({ ok: true, value: { protocolVersion: 1, ticket: `t${opens.length}`, expiresAt: Date.now() + 60_000, wsPath: '/sidebar/ws/cdp-live' } }),
    }
  }))
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.stubGlobal('ResizeObserver', class { observe(): void {} disconnect(): void {} })
  const props = () => ({
    ctx: {},
    store: { getPrefs: () => ({ pluginSettings: { 'dsh-sidebar-cdp-browser:live': current } }) },
    scope: { sessionId: 's1' },
    tab: {},
    visible: true,
  }) as unknown as TabComponentProps
  const utils = render(<SidebarCdpBrowser {...props()} />)
  return {
    opens,
    rerender(next) {
      current = next
      utils.rerender(<SidebarCdpBrowser {...props()} />)
    },
  }
}

const armBox = (): HTMLInputElement => screen.getByRole('checkbox', { name: t('remoteControl') }) as HTMLInputElement

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  FakeWebSocket.instances = []
})

describe('remote-control arm switch', () => {
  it('opens view-only even with the interactive setting on; the box starts unchecked', async () => {
    const { opens } = mountCard({ interactive: true })
    await act(async () => { await flush() })
    expect(opens).toHaveLength(1)
    expect(opens[0]).toMatchObject({ sessionId: 's1', mode: 'observe' })
    expect(armBox().disabled).toBe(false)
    expect(armBox().checked).toBe(false)
    // Disarmed = the canvas never offers keyboard capture.
    expect(screen.queryByText(t('clickToType'))).toBeNull()
  })

  it('re-opens as interactive when armed, and back to observe when disarmed', async () => {
    const { opens } = mountCard({ interactive: true })
    await act(async () => { await flush() })
    await act(async () => { fireEvent.click(armBox()) })
    await act(async () => { await flush() })
    expect(opens.map(open => open.mode)).toEqual(['observe', 'interactive'])
    expect(armBox().checked).toBe(true)
    expect(screen.queryByText(t('clickToType'))).not.toBeNull()
    await act(async () => { fireEvent.click(armBox()) })
    await act(async () => { await flush() })
    expect(opens.map(open => open.mode)).toEqual(['observe', 'interactive', 'observe'])
    expect(screen.queryByText(t('clickToType'))).toBeNull()
  })

  it('grays the box out and ignores clicks while the interactive setting is off', async () => {
    const { opens } = mountCard({ interactive: false })
    await act(async () => { await flush() })
    const box = armBox()
    expect(box.disabled).toBe(true)
    expect(box.checked).toBe(false)
    fireEvent.click(box)
    await act(async () => { await flush() })
    expect(opens).toHaveLength(1)
    expect(opens[0]!.mode).toBe('observe')
  })

  it('disarms when the setting turns off mid-flight and never silently re-arms', async () => {
    const { opens, rerender } = mountCard({ interactive: true })
    await act(async () => { await flush() })
    await act(async () => { fireEvent.click(armBox()) })
    await act(async () => { await flush() })
    expect(opens.map(open => open.mode)).toEqual(['observe', 'interactive'])

    rerender({ interactive: false })
    await act(async () => { await flush() })
    expect(armBox().checked).toBe(false)
    expect(armBox().disabled).toBe(true)
    expect(opens.at(-1)!.mode).toBe('observe')

    // Re-enabling the master setting must NOT restore the earlier check.
    rerender({ interactive: true })
    await act(async () => { await flush() })
    expect(armBox().disabled).toBe(false)
    expect(armBox().checked).toBe(false)
    expect(opens.at(-1)!.mode).toBe('observe')
  })
})
