import { EventEmitter } from 'node:events';
import type { BrowserAdapter } from './browser-adapter.js';
import { InputController } from './input-controller.js';
import { LeaseManager } from './lease-manager.js';
import { ScreencastController } from './screencast-controller.js';
import { TargetController } from './target-controller.js';
import { TargetRegistry, type TargetRegistryOptions } from './target-registry.js';
import type { TargetKey } from './types.js';

export type BrowserConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'closed';

export interface BrowserConnectionManagerOptions {
  connect: () => Promise<BrowserAdapter>;
  targetRegistry?: TargetRegistryOptions;
  leases?: LeaseManager;
  /**
   * How often (ms) to re-read target titles/urls into the registry; 0
   * disables the poll. Default 1000. Title-only updates never arrive as
   * puppeteer events (see TargetRegistry.refresh), so the poll is what keeps
   * tab titles live.
   */
  targetInfoPollMs?: number;
}

/** Composition root for one browser connection generation. */
export class BrowserConnectionManager extends EventEmitter {
  readonly registry: TargetRegistry;
  readonly leases: LeaseManager;
  readonly #connectAdapter: () => Promise<BrowserAdapter>;
  readonly #targetInfoPollMs: number;
  #adapter: BrowserAdapter | undefined;
  #targets: TargetController | undefined;
  #screencast: ScreencastController | undefined;
  #input: InputController | undefined;
  #state: BrowserConnectionState = 'idle';
  #transition: Promise<void> | undefined;
  #pollTimer: NodeJS.Timeout | undefined;

  constructor(options: BrowserConnectionManagerOptions) {
    super();
    this.#connectAdapter = options.connect;
    this.#targetInfoPollMs = options.targetInfoPollMs ?? 1_000;
    this.registry = new TargetRegistry(options.targetRegistry);
    this.leases = options.leases ?? new LeaseManager();
    this.registry.on('closed', (target) => this.leases.revokeTarget(target.key));
  }

  get state(): BrowserConnectionState { return this.#state; }
  get connected(): boolean { return this.#state === 'connected' && this.#adapter?.isConnected() === true; }
  get targets(): TargetController { return this.#require(this.#targets, 'Target controller'); }
  get screencast(): ScreencastController { return this.#require(this.#screencast, 'Screencast controller'); }
  get input(): InputController { return this.#require(this.#input, 'Input controller'); }

  /**
   * Create a new page target and return its registry key. `newPage()` already
   * waits for the target to appear + initialize, so the registry entry exists
   * by the time it resolves; the short poll is a belt-and-braces guard against
   * event-ordering surprises, not an expected wait.
   */
  async createTarget(): Promise<TargetKey> {
    const adapter = this.#require(this.#adapter, 'Browser adapter');
    const target = await adapter.createTarget();
    const deadline = Date.now() + 3_000;
    for (;;) {
      const key = this.registry.keyOf(target);
      if (key !== undefined) return key;
      if (Date.now() >= deadline) throw new Error('new target did not appear in the registry');
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  }

  /**
   * Close a target: detach any session we hold first, then close it remotely.
   * The last remaining tab is refused — Chromium exits when its last target
   * closes, which would kill the browser for every viewer of this endpoint
   * (and leave the endpoint dead until the remote is restarted).
   */
  async closeTarget(key: TargetKey): Promise<void> {
    const target = this.registry.resolve(key);
    const live = this.registry.list();
    if (live.length <= 1) {
      throw new Error('cannot close the last remaining tab: the remote browser would exit');
    }
    const targets = this.#require(this.#targets, 'Target controller');
    await targets.detach(key);
    await target.close();
  }

  connect(): Promise<void> {
    if (this.#state === 'closed') return Promise.reject(new Error('Browser connection manager is closed'));
    if (this.#state === 'connected') return Promise.resolve();
    if (this.#transition) return this.#transition;
    this.#setState('connecting');
    this.#transition = (async () => {
      const adapter = await this.#connectAdapter();
      if (!adapter.isConnected()) throw new Error('Browser adapter connected in disconnected state');
      const targets = new TargetController(this.registry);
      this.#adapter = adapter;
      this.#targets = targets;
      this.#screencast = new ScreencastController(targets);
      this.#input = new InputController(targets);
      await this.registry.bind(adapter);
      // Prime the command-backed title/url snapshot, then keep polling.
      await adapter.refreshTargetInfo().catch(() => undefined);
      this.registry.refresh();
      this.#startTargetInfoPoll();
      this.#setState('connected');
    })().catch(async (error) => {
      await this.#cleanup();
      this.#setState('idle');
      throw error;
    }).finally(() => { this.#transition = undefined; });
    return this.#transition;
  }

  disconnect(): Promise<void> {
    if (this.#state === 'idle') return Promise.resolve();
    if (this.#state === 'closed') return Promise.resolve();
    if (this.#transition && this.#state === 'disconnecting') return this.#transition;
    const waitForConnect = this.#transition;
    this.#setState('disconnecting');
    this.#transition = (async () => {
      if (waitForConnect) await waitForConnect.catch(() => undefined);
      await this.#cleanup();
      this.#setState('idle');
    })().finally(() => { this.#transition = undefined; });
    return this.#transition;
  }

  async close(): Promise<void> {
    if (this.#state === 'closed') return;
    await this.disconnect();
    this.leases.clear();
    this.registry.removeAllListeners();
    this.#setState('closed');
    this.removeAllListeners();
  }

  async #cleanup(): Promise<void> {
    this.#stopTargetInfoPoll();
    const screencast = this.#screencast;
    const targets = this.#targets;
    const adapter = this.#adapter;
    this.#screencast = undefined;
    this.#input = undefined;
    this.#targets = undefined;
    this.#adapter = undefined;
    this.registry.unbind();
    this.leases.clear();
    await screencast?.close().catch(() => undefined);
    await targets?.close().catch(() => undefined);
    await adapter?.disconnect().catch(() => undefined);
  }

  /** Keep tab titles live: fetch via commands, then apply (see refreshTargetInfo). */
  #startTargetInfoPoll(): void {
    this.#stopTargetInfoPoll();
    if (this.#targetInfoPollMs <= 0) return;
    this.#pollTimer = setInterval(() => { void this.#pollTargetInfo(); }, this.#targetInfoPollMs);
    // Never hold the host process open on account of the poll alone.
    this.#pollTimer.unref?.();
  }

  #pollTargetInfo = (): void => {
    const adapter = this.#adapter;
    if (adapter === undefined || this.#state !== 'connected') return;
    void adapter.refreshTargetInfo().then(
      () => { this.registry.refresh() },
      () => undefined, // a failed fetch keeps the last snapshot; the next tick retries
    );
  }

  /** On-demand refresh (navigation nudge): fetch + apply immediately. */
  async refreshTargetInfoNow(): Promise<void> {
    const adapter = this.#adapter;
    if (adapter === undefined || this.#state !== 'connected') return;
    await adapter.refreshTargetInfo();
    this.registry.refresh();
  }

  #stopTargetInfoPoll(): void {
    if (this.#pollTimer === undefined) return;
    clearInterval(this.#pollTimer);
    this.#pollTimer = undefined;
  }

  #setState(state: BrowserConnectionState): void {
    this.#state = state;
    this.emit('state', state);
  }

  #require<T>(value: T | undefined, label: string): T {
    if (!value || this.#state !== 'connected') throw new Error(`${label} is unavailable while ${this.#state}`);
    return value;
  }
}
