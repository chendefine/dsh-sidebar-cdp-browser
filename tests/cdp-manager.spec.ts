import { describe, expect, it, vi } from 'vitest'
import type { BrowserAdapter, BrowserTargetAdapter, CdpEventHandler, CdpSessionAdapter } from '../src/cdp/browser-adapter.ts'
import { BrowserConnectionManager } from '../src/cdp/browser-connection-manager.ts'
import { InputController } from '../src/cdp/input-controller.ts'
import { ScreencastController } from '../src/cdp/screencast-controller.ts'
import { TargetController } from '../src/cdp/target-controller.ts'
import { TargetRegistry } from '../src/cdp/target-registry.ts'

class FakeSession implements CdpSessionAdapter {
  readonly sent: Array<{ method: string; params?: Record<string, unknown> }> = []
  readonly handlers = new Map<string, Set<CdpEventHandler>>()
  detached = false
  async send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    this.sent.push({ method, params })
    if (method === 'Page.getNavigationHistory') return { currentIndex: 1, entries: [{ id: 1 }, { id: 2 }, { id: 3 }] } as T
    return {} as T
  }
  on(event: string, handler: CdpEventHandler): void { (this.handlers.get(event) ?? this.handlers.set(event, new Set()).get(event)!).add(handler) }
  off(event: string, handler: CdpEventHandler): void { this.handlers.get(event)?.delete(handler) }
  async detach(): Promise<void> { this.detached = true }
  emit(event: string, payload: unknown): void { for (const handler of this.handlers.get(event) ?? []) handler(payload) }
}

class FakeTarget implements BrowserTargetAdapter {
  readonly type = 'page'
  /** What event-driven caches would show: never updated on title-only changes. */
  eventTitle = 'Example'
  url = 'https://example.com/'
  closed = false
  readonly session = new FakeSession()
  constructor(private readonly browser?: FakeBrowser) {}
  /** Title getter mirrors the real adapter: command snapshot first, event cache second. */
  get title(): string { return this.browser?.snapshotTitle || this.eventTitle }
  async createSession(): Promise<CdpSessionAdapter> { return this.session }
  async close(): Promise<void> {
    this.closed = true
    this.browser?.targetClosed(this)
  }
}

class FakeBrowser implements BrowserAdapter {
  readonly target = new FakeTarget(this)
  /** What Target.getTargets would return: the REAL current title. */
  snapshotTitle = ''
  refreshes = 0
  readonly created = new Set<(target: BrowserTargetAdapter) => void>()
  readonly changed = new Set<(target: BrowserTargetAdapter) => void>()
  readonly destroyed = new Set<(target: BrowserTargetAdapter) => void>()
  async listTargets(): Promise<readonly BrowserTargetAdapter[]> { return [this.target] }
  async refreshTargetInfo(): Promise<void> { this.refreshes += 1 }
  async createTarget(): Promise<BrowserTargetAdapter> {
    const target = new FakeTarget(this)
    target.eventTitle = ''
    target.url = 'about:blank'
    for (const handler of this.created) handler(target)
    return target
  }
  targetClosed(target: FakeTarget): void { for (const handler of this.destroyed) handler(target) }
  onTargetCreated(handler: (target: BrowserTargetAdapter) => void): void { this.created.add(handler) }
  offTargetCreated(handler: (target: BrowserTargetAdapter) => void): void { this.created.delete(handler) }
  onTargetChanged(handler: (target: BrowserTargetAdapter) => void): void { this.changed.add(handler) }
  offTargetChanged(handler: (target: BrowserTargetAdapter) => void): void { this.changed.delete(handler) }
  onTargetDestroyed(handler: (target: BrowserTargetAdapter) => void): void { this.destroyed.add(handler) }
  offTargetDestroyed(handler: (target: BrowserTargetAdapter) => void): void { this.destroyed.delete(handler) }
  isConnected(): boolean { return true }
  async disconnect(): Promise<void> {}
}

describe('CDP manager components', () => {
  it('ACKs screencast frames immediately and exposes the latest frame', async () => {
    const browser = new FakeBrowser()
    const registry = new TargetRegistry()
    await registry.bind(browser)
    const targetKey = registry.list()[0]!.key
    const targets = new TargetController(registry)
    const screencast = new ScreencastController(targets)
    const queue = await screencast.start(targetKey, { quality: 60 })
    browser.target.session.emit('Page.screencastFrame', {
      data: Buffer.from('jpeg').toString('base64'),
      sessionId: 7,
      metadata: { deviceWidth: 1280, deviceHeight: 720, pageScaleFactor: 1, offsetTop: 0, scrollOffsetX: 0, scrollOffsetY: 0, timestamp: 1 },
    })
    const frame = await queue.take()
    expect(frame.done).toBe(false)
    expect(frame.value?.targetKey).toBe(targetKey)
    await vi.waitFor(() => expect(browser.target.session.sent).toContainEqual({ method: 'Page.screencastFrameAck', params: { sessionId: 7 } }))
    await screencast.stop(targetKey)
    expect(browser.target.session.sent.some(item => item.method === 'Page.stopScreencast')).toBe(true)
    await targets.close()
  })

  it('dispatches whitelisted input and rejects non-HTTP navigation', async () => {
    const browser = new FakeBrowser()
    const registry = new TargetRegistry()
    await registry.bind(browser)
    const targetKey = registry.list()[0]!.key
    const targets = new TargetController(registry)
    const input = new InputController(targets)
    await input.dispatchMouse(targetKey, { type: 'mousePressed', x: 10, y: 20, button: 'left', buttons: 1 })
    expect(browser.target.session.sent.some(item => item.method === 'Input.dispatchMouseEvent')).toBe(true)
    await expect(input.navigate(targetKey, 'data:text/html,boom')).rejects.toThrow(/not allowed/i)
    await input.history(targetKey, 'back')
    expect(browser.target.session.sent).toContainEqual({ method: 'Page.navigateToHistoryEntry', params: { entryId: 1 } })
    await targets.close()
  })

  it('propagates live title changes through the registry', async () => {
    const browser = new FakeBrowser()
    const registry = new TargetRegistry()
    await registry.bind(browser)
    browser.target.eventTitle = 'New Page Title'
    for (const handler of browser.changed) handler(browser.target)
    expect(registry.list()[0]!.title).toBe('New Page Title')
  })

  /**
   * The real-world title bug: after an address-bar navigation Chromium never
   * emits the title-only update, so the event cache stays on the tentative
   * title ("baidu.com") while Target.getTargets already returns the real one.
   * refreshTargetInfoNow() must apply the command-fetched title.
   */
  it('applies the command-fetched title when the event cache stays stale', async () => {
    const browser = new FakeBrowser()
    const manager = new BrowserConnectionManager({ connect: async () => browser })
    await manager.connect()
    // Navigation committed: URL known (event carried it), title still tentative.
    // The registry descriptor is STILL the pre-navigation one — exactly the
    // user's symptom (old title persists after an address-bar navigation).
    browser.target.url = 'https://www.baidu.com/'
    browser.target.eventTitle = 'baidu.com'
    browser.snapshotTitle = '百度一下，你就知道'
    expect(manager.registry.list()[0]!.title).toBe('Example')
    await manager.refreshTargetInfoNow()
    expect(manager.registry.list()[0]!.title).toBe('百度一下，你就知道')
    expect(manager.registry.list()[0]!.url).toBe('https://www.baidu.com/')
    await manager.close()
  })

  it('creates a target and returns its registry key', async () => {
    const browser = new FakeBrowser()
    const manager = new BrowserConnectionManager({ connect: async () => browser })
    await manager.connect()
    const key = await manager.createTarget()
    const descriptor = manager.registry.list().find(target => target.key === key)
    expect(descriptor?.url).toBe('about:blank')
    await manager.close()
  })

  it('closes a target: detaches the held session, closes remotely, drops it from the list', async () => {
    const browser = new FakeBrowser()
    const manager = new BrowserConnectionManager({ connect: async () => browser })
    await manager.connect()
    // Two tabs: the last-tab guard must not interfere with a legitimate close.
    await manager.createTarget()
    const key = manager.registry.list()[0]!.key
    await manager.targets.attach(key)
    const closedListener = vi.fn()
    manager.registry.on('closed', closedListener)
    await manager.closeTarget(key)
    expect(browser.target.session.detached).toBe(true)
    expect(browser.target.closed).toBe(true)
    expect(closedListener).toHaveBeenCalledTimes(1)
    expect(manager.registry.list()).toHaveLength(1)
    await manager.close()
  })

  it('refuses to close the last remaining tab', async () => {
    const browser = new FakeBrowser()
    const manager = new BrowserConnectionManager({ connect: async () => browser })
    await manager.connect()
    const key = manager.registry.list()[0]!.key
    await expect(manager.closeTarget(key)).rejects.toThrow(/last remaining tab/i)
    expect(browser.target.closed).toBe(false)
    expect(manager.registry.list()).toHaveLength(1)
    await manager.close()
  })

  it('refresh() applies only real changes and does not spam events', async () => {
    const browser = new FakeBrowser()
    const manager = new BrowserConnectionManager({ connect: async () => browser })
    await manager.connect()
    browser.snapshotTitle = '百度一下，你就知道'
    expect(manager.registry.refresh()).toBe(true)
    expect(manager.registry.list()[0]!.title).toBe('百度一下，你就知道')
    expect(manager.registry.refresh()).toBe(false) // no further change, no spam
    await manager.close()
  })

  it('refuses lifecycle operations while disconnected', async () => {
    const manager = new BrowserConnectionManager({ connect: async () => new FakeBrowser() })
    await expect(manager.createTarget()).rejects.toThrow(/idle/i)
    await expect(manager.closeTarget('k'.repeat(18) as never)).rejects.toThrow()
  })
})
