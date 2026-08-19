import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Lease, LeaseId, TargetKey } from './types.js';

export interface LeaseManagerOptions {
  minTtlMs?: number;
  maxTtlMs?: number;
  now?: () => number;
}

export class LeaseManager extends EventEmitter {
  readonly #byId = new Map<LeaseId, Lease>();
  readonly #byTarget = new Map<TargetKey, LeaseId>();
  readonly #minTtlMs: number;
  readonly #maxTtlMs: number;
  readonly #now: () => number;

  constructor(options: LeaseManagerOptions = {}) {
    super();
    this.#minTtlMs = options.minTtlMs ?? 1_000;
    this.#maxTtlMs = options.maxTtlMs ?? 5 * 60_000;
    this.#now = options.now ?? Date.now;
  }

  acquire(targetKey: TargetKey, owner: string, ttlMs: number): Lease {
    this.#prune();
    const currentId = this.#byTarget.get(targetKey);
    const current = currentId && this.#byId.get(currentId);
    if (current) {
      if (current.owner !== owner) throw new Error('Target lease is held by another owner');
      return this.renew(current.id, ttlMs, owner);
    }
    const now = this.#now();
    const lease: Lease = {
      id: randomBytes(18).toString('base64url') as LeaseId,
      targetKey, owner, issuedAt: now, expiresAt: now + this.#ttl(ttlMs),
    };
    this.#byId.set(lease.id, lease);
    this.#byTarget.set(targetKey, lease.id);
    this.emit('acquired', { ...lease });
    return { ...lease };
  }

  renew(id: LeaseId, ttlMs: number, owner?: string): Lease {
    const lease = this.assert(id);
    if (owner !== undefined && owner !== lease.owner) throw new Error('Lease owner mismatch');
    lease.expiresAt = this.#now() + this.#ttl(ttlMs);
    this.emit('renewed', { ...lease });
    return { ...lease };
  }

  assert(id: LeaseId, targetKey?: TargetKey, owner?: string): Lease {
    this.#prune();
    const lease = this.#byId.get(id);
    if (!lease) throw new Error('Lease is missing or expired');
    if (targetKey !== undefined && lease.targetKey !== targetKey) throw new Error('Lease does not cover target');
    if (owner !== undefined && lease.owner !== owner) throw new Error('Lease owner mismatch');
    return lease;
  }

  release(id: LeaseId, owner?: string): boolean {
    const lease = this.#byId.get(id);
    if (!lease) return false;
    if (owner !== undefined && owner !== lease.owner) throw new Error('Lease owner mismatch');
    this.#delete(lease, 'released');
    return true;
  }

  revokeTarget(targetKey: TargetKey): void {
    const id = this.#byTarget.get(targetKey);
    const lease = id && this.#byId.get(id);
    if (lease) this.#delete(lease, 'target-revoked');
  }

  revokeOwner(owner: string): void {
    for (const lease of [...this.#byId.values()]) if (lease.owner === owner) this.#delete(lease, 'owner-revoked');
  }

  clear(): void { for (const lease of [...this.#byId.values()]) this.#delete(lease, 'cleared'); }

  #ttl(ttlMs: number): number {
    if (!Number.isFinite(ttlMs) || ttlMs < this.#minTtlMs || ttlMs > this.#maxTtlMs) {
      throw new Error(`Lease TTL must be between ${this.#minTtlMs} and ${this.#maxTtlMs} ms`);
    }
    return Math.floor(ttlMs);
  }

  #prune(): void {
    const now = this.#now();
    for (const lease of [...this.#byId.values()]) if (lease.expiresAt <= now) this.#delete(lease, 'expired');
  }

  #delete(lease: Lease, reason: string): void {
    this.#byId.delete(lease.id);
    if (this.#byTarget.get(lease.targetKey) === lease.id) this.#byTarget.delete(lease.targetKey);
    this.emit('revoked', { ...lease }, reason);
  }
}
