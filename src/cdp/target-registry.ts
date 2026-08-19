import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { BrowserAdapter, BrowserTargetAdapter } from './browser-adapter.js';
import type { TargetDescriptor, TargetKey, TargetLifecycleState } from './types.js';

interface TargetRecord {
  target: BrowserTargetAdapter;
  descriptor: TargetDescriptor;
}

export interface TargetRegistryOptions {
  include?: (target: BrowserTargetAdapter) => boolean;
  now?: () => number;
}

export class TargetRegistry extends EventEmitter {
  readonly #byTarget = new WeakMap<BrowserTargetAdapter, TargetRecord>();
  readonly #byKey = new Map<TargetKey, TargetRecord>();
  readonly #include: (target: BrowserTargetAdapter) => boolean;
  readonly #now: () => number;
  #browser: BrowserAdapter | undefined;

  readonly #created = (target: BrowserTargetAdapter) => { this.#upsert(target, 'available'); };
  readonly #changed = (target: BrowserTargetAdapter) => { this.#upsert(target); };
  readonly #destroyed = (target: BrowserTargetAdapter) => { this.#destroy(target); };

  constructor(options: TargetRegistryOptions = {}) {
    super();
    this.#include = options.include ?? ((target) => target.type === 'page' || target.type === 'webview');
    this.#now = options.now ?? Date.now;
  }

  async bind(browser: BrowserAdapter): Promise<void> {
    this.unbind();
    this.#browser = browser;
    browser.onTargetCreated(this.#created);
    browser.onTargetChanged(this.#changed);
    browser.onTargetDestroyed(this.#destroyed);
    for (const target of await browser.listTargets()) this.#upsert(target, 'available');
  }

  unbind(): void {
    const browser = this.#browser;
    if (!browser) return;
    browser.offTargetCreated(this.#created);
    browser.offTargetChanged(this.#changed);
    browser.offTargetDestroyed(this.#destroyed);
    this.#browser = undefined;
  }

  list(options: { includeClosed?: boolean } = {}): TargetDescriptor[] {
    return [...this.#byKey.values()]
      .map(({ descriptor }) => ({ ...descriptor }))
      .filter((descriptor) => options.includeClosed || descriptor.lifecycle !== 'closed');
  }

  resolve(key: TargetKey): BrowserTargetAdapter {
    const record = this.#byKey.get(key);
    if (!record || record.descriptor.lifecycle === 'closed') throw new Error(`Unknown or closed target: ${key}`);
    return record.target;
  }

  describe(key: TargetKey): TargetDescriptor | undefined {
    const descriptor = this.#byKey.get(key)?.descriptor;
    return descriptor ? { ...descriptor } : undefined;
  }

  /** The opaque key assigned to a live adapter, once it has been upserted. */
  keyOf(target: BrowserTargetAdapter): TargetKey | undefined {
    const record = this.#byTarget.get(target);
    return record !== undefined && record.descriptor.lifecycle !== 'closed' ? record.descriptor.key : undefined;
  }

  /**
   * Re-read the live title/url/type of every tracked target and emit one
   * 'changed' when anything moved.
   *
   * Needed because puppeteer's browser-level 'targetchanged' event only
   * fires when the URL changes: a title-only TargetInfo update (the normal
   * "page finished loading and set its title" moment) updates the adapter's
   * internal state but is never forwarded. The freshest title is therefore
   * already sitting on the adapter — it just has to be re-read. Pure memory
   * reads, no CDP round-trips; driven by the connection manager's poll.
   */
  refresh(): boolean {
    let changed = false;
    const now = this.#now();
    for (const { target, descriptor } of this.#byKey.values()) {
      if (descriptor.lifecycle === 'closed') continue;
      if (descriptor.title !== target.title) { descriptor.title = target.title; descriptor.updatedAt = now; changed = true; }
      if (descriptor.url !== target.url) { descriptor.url = target.url; descriptor.updatedAt = now; changed = true; }
      if (descriptor.type !== target.type) { descriptor.type = target.type; descriptor.updatedAt = now; changed = true; }
    }
    if (changed) this.emit('changed', this.list());
    return changed;
  }

  markAttached(key: TargetKey, attached: boolean): void {
    const record = this.#byKey.get(key);
    if (!record || record.descriptor.lifecycle === 'closed') throw new Error(`Unknown or closed target: ${key}`);
    record.descriptor.attached = attached;
    record.descriptor.lifecycle = attached ? 'attached' : 'available';
    record.descriptor.updatedAt = this.#now();
    this.#emitChanged(record.descriptor);
  }

  override emit(event: 'changed', targets: TargetDescriptor[]): boolean;
  override emit(event: 'closed', target: TargetDescriptor): boolean;
  override emit(event: string | symbol, ...args: unknown[]): boolean { return super.emit(event, ...args); }
  override on(event: 'changed', listener: (targets: TargetDescriptor[]) => void): this;
  override on(event: 'closed', listener: (target: TargetDescriptor) => void): this;
  override on(event: string, listener: (...args: any[]) => void): this { return super.on(event, listener); }

  #upsert(target: BrowserTargetAdapter, initialState?: TargetLifecycleState): void {
    if (!this.#include(target)) return;
    const existing = this.#byTarget.get(target);
    const now = this.#now();
    if (existing) {
      existing.descriptor.type = target.type;
      existing.descriptor.title = target.title;
      existing.descriptor.url = target.url;
      existing.descriptor.updatedAt = now;
      this.#emitChanged(existing.descriptor);
      return;
    }
    const key = randomBytes(18).toString('base64url') as TargetKey;
    const descriptor: TargetDescriptor = {
      key, type: target.type, title: target.title, url: target.url,
      lifecycle: initialState ?? 'available', attached: false, createdAt: now, updatedAt: now,
    };
    const record = { target, descriptor };
    this.#byTarget.set(target, record);
    this.#byKey.set(key, record);
    this.#emitChanged(descriptor);
  }

  #destroy(target: BrowserTargetAdapter): void {
    const record = this.#byTarget.get(target);
    if (!record || record.descriptor.lifecycle === 'closed') return;
    record.descriptor.lifecycle = 'closed';
    record.descriptor.attached = false;
    record.descriptor.updatedAt = this.#now();
    this.emit('closed', { ...record.descriptor });
    this.#byKey.delete(record.descriptor.key);
    this.#emitChanged(record.descriptor);
  }

  #emitChanged(_descriptor: TargetDescriptor): void { this.emit('changed', this.list()); }
}
