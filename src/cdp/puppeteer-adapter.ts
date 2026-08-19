import puppeteer, { type Browser, type CDPSession, type Target } from 'puppeteer-core';
import type { BrowserAdapter, BrowserTargetAdapter, CdpEventHandler, CdpSessionAdapter } from './browser-adapter.js';

class PuppeteerSessionAdapter implements CdpSessionAdapter {
  constructor(readonly session: CDPSession) {}
  send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    return this.session.send(method as never, params as never) as Promise<T>;
  }
  on(event: string, handler: CdpEventHandler): void { this.session.on(event as never, handler as never); }
  off(event: string, handler: CdpEventHandler): void { this.session.off(event as never, handler as never); }
  async detach(): Promise<void> { await this.session.detach(); }
}

/**
 * Event-driven title (puppeteer's internal TargetInfo cache). This cache only
 * updates from Target.targetInfoChanged events — and Chromium never emits
 * title-only updates, so after a navigation it stays on the tentative title
 * (e.g. "baidu.com") forever. It is the FALLBACK; the primary source is the
 * browser adapter's command-fetched snapshot (see refreshTargetInfo).
 */
function eventTitle(target: Target): string {
  const info = (target as unknown as { _getTargetInfo?: () => { title?: string; url?: string } })._getTargetInfo?.();
  const title = info?.title?.trim();
  return title ? title : target.url();
}

function targetIdOf(target: Target): string {
  return (target as unknown as { _targetId: string })._targetId;
}

interface TargetInfoSnapshot { title: string; url: string }

class PuppeteerTargetAdapter implements BrowserTargetAdapter {
  readonly #id: string;
  constructor(readonly target: Target, private readonly browserAdapter: PuppeteerBrowserAdapter) {
    this.#id = targetIdOf(target);
  }
  get type(): string { return this.target.type(); }
  /** Command-fetched snapshot first (titles never arrive as events); event cache second. */
  get title(): string {
    const snapshot = this.browserAdapter.snapshotOf(this.#id);
    const title = snapshot?.title?.trim();
    return title ? title : eventTitle(this.target);
  }
  /** URL events DO fire on commit, so the event-driven url is the freshest source. */
  get url(): string { return this.target.url() || this.browserAdapter.snapshotOf(this.#id)?.url || ''; }
  async createSession(): Promise<CdpSessionAdapter> {
    return new PuppeteerSessionAdapter(await this.target.createCDPSession());
  }
  async close(): Promise<void> {
    // puppeteer's public Target API has no close(); Page.close() is the
    // sanctioned route (sends Target.closeTarget + session cleanup). asPage()
    // deliberately uses a null viewport so closing never resizes anything.
    const page = await this.target.asPage()
    await page.close()
  }
}

export class PuppeteerBrowserAdapter implements BrowserAdapter {
  readonly #wrappers = new WeakMap<Target, PuppeteerTargetAdapter>();
  readonly #created = new Map<(target: BrowserTargetAdapter) => void, (target: Target) => void>();
  readonly #changed = new Map<(target: BrowserTargetAdapter) => void, (target: Target) => void>();
  readonly #destroyed = new Map<(target: BrowserTargetAdapter) => void, (target: Target) => void>();
  /** targetId → freshest title/url, fetched via Target.getTargets commands. */
  readonly #snapshots = new Map<string, TargetInfoSnapshot>();
  #infoSession: CDPSession | undefined;

  constructor(readonly browser: Browser) {}

  snapshotOf(targetId: string): TargetInfoSnapshot | undefined { return this.#snapshots.get(targetId); }

  async refreshTargetInfo(): Promise<void> {
    if (this.#infoSession === undefined) this.#infoSession = await this.browser.target().createCDPSession();
    const result = await this.#infoSession.send('Target.getTargets' as never) as { targetInfos: Array<{ targetId: string; title?: string; url?: string }> };
    this.#snapshots.clear();
    for (const info of result.targetInfos) {
      this.#snapshots.set(info.targetId, { title: info.title ?? '', url: info.url ?? '' });
    }
  }

  async listTargets(): Promise<readonly BrowserTargetAdapter[]> { return this.browser.targets().map((target) => this.#wrap(target)); }
  /**
   * New page via puppeteer's `newPage()`: it resolves only after the target
   * has appeared (targetcreated) AND initialized, so the registry entry is
   * already live by the time the caller maps the adapter to a TargetKey.
   * No defaultViewport is configured at connect time, so the page keeps the
   * browser's natural size instead of being forced into an 800x600 override.
   */
  async createTarget(): Promise<BrowserTargetAdapter> {
    const page = await this.browser.newPage();
    return this.#wrap(page.target());
  }
  onTargetCreated(handler: (target: BrowserTargetAdapter) => void): void { this.#on('targetcreated', this.#created, handler); }
  offTargetCreated(handler: (target: BrowserTargetAdapter) => void): void { this.#off('targetcreated', this.#created, handler); }
  onTargetChanged(handler: (target: BrowserTargetAdapter) => void): void { this.#on('targetchanged', this.#changed, handler); }
  offTargetChanged(handler: (target: BrowserTargetAdapter) => void): void { this.#off('targetchanged', this.#changed, handler); }
  onTargetDestroyed(handler: (target: BrowserTargetAdapter) => void): void { this.#on('targetdestroyed', this.#destroyed, handler); }
  offTargetDestroyed(handler: (target: BrowserTargetAdapter) => void): void { this.#off('targetdestroyed', this.#destroyed, handler); }
  isConnected(): boolean { return this.browser.connected; }
  async disconnect(): Promise<void> { await this.browser.disconnect(); }

  #wrap(target: Target): PuppeteerTargetAdapter {
    let wrapper = this.#wrappers.get(target);
    if (!wrapper) { wrapper = new PuppeteerTargetAdapter(target, this); this.#wrappers.set(target, wrapper); }
    return wrapper;
  }

  #on(event: 'targetcreated' | 'targetchanged' | 'targetdestroyed', map: Map<(target: BrowserTargetAdapter) => void, (target: Target) => void>, handler: (target: BrowserTargetAdapter) => void): void {
    if (map.has(handler)) return;
    const wrapped = (target: Target) => handler(this.#wrap(target));
    map.set(handler, wrapped);
    this.browser.on(event, wrapped);
  }

  #off(event: 'targetcreated' | 'targetchanged' | 'targetdestroyed', map: Map<(target: BrowserTargetAdapter) => void, (target: Target) => void>, handler: (target: BrowserTargetAdapter) => void): void {
    const wrapped = map.get(handler);
    if (!wrapped) return;
    map.delete(handler);
    this.browser.off(event, wrapped);
  }
}

export interface ConnectPuppeteerOptions {
  browserWSEndpoint: string;
  headers?: Record<string, string>;
}

export async function connectPuppeteer(options: ConnectPuppeteerOptions): Promise<PuppeteerBrowserAdapter> {
  const browser = await puppeteer.connect({
    browserWSEndpoint: options.browserWSEndpoint,
    headers: options.headers,
    /**
     * puppeteer's connect() defaults defaultViewport to a frozen 800x600 and
     * applies it inside newPage()/target.page() via Emulation override — every
     * tab we create would render at 800x600 regardless of the browser's real
     * window size ("new tabs come up narrow"). null (≠ undefined, so the
     * destructuring default does not kick in) makes CdpPage skip the override
     * entirely: new pages keep the remote browser's natural viewport, same as
     * tabs that existed before we connected.
     */
    defaultViewport: null,
  } as Parameters<typeof puppeteer.connect>[0]);
  return new PuppeteerBrowserAdapter(browser);
}
