import { EventEmitter } from 'node:events';
import type { CdpSessionAdapter } from './browser-adapter.js';
import type { TargetKey } from './types.js';
import { TargetRegistry } from './target-registry.js';

export class TargetController extends EventEmitter {
  readonly #sessions = new Map<TargetKey, Promise<CdpSessionAdapter>>();
  readonly #registry: TargetRegistry;
  readonly #onClosed = (target: { key: TargetKey }) => { void this.detach(target.key); };

  constructor(registry: TargetRegistry) {
    super();
    this.#registry = registry;
    registry.on('closed', this.#onClosed);
  }

  has(key: TargetKey): boolean { return this.#sessions.has(key); }

  attach(key: TargetKey): Promise<CdpSessionAdapter> {
    const current = this.#sessions.get(key);
    if (current) return current;
    const pending = this.#registry.resolve(key).createSession().then((session) => {
      this.#registry.markAttached(key, true);
      this.emit('attached', key, session);
      return session;
    }).catch((error) => {
      this.#sessions.delete(key);
      throw error;
    });
    this.#sessions.set(key, pending);
    return pending;
  }

  session(key: TargetKey): Promise<CdpSessionAdapter> {
    const session = this.#sessions.get(key);
    if (!session) throw new Error(`Target is not attached: ${key}`);
    return session;
  }

  async withSession<T>(key: TargetKey, operation: (session: CdpSessionAdapter) => Promise<T>): Promise<T> {
    return operation(await this.attach(key));
  }

  async detach(key: TargetKey): Promise<void> {
    const pending = this.#sessions.get(key);
    if (!pending) return;
    this.#sessions.delete(key);
    try { await (await pending).detach(); }
    finally {
      const descriptor = this.#registry.describe(key);
      if (descriptor !== undefined && descriptor.lifecycle !== 'closed') this.#registry.markAttached(key, false);
      this.emit('detached', key);
    }
  }

  async close(): Promise<void> {
    this.#registry.off('closed', this.#onClosed);
    await Promise.allSettled([...this.#sessions.keys()].map((key) => this.detach(key)));
    this.removeAllListeners();
  }
}
