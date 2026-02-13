/**
 * SharedStorage — Two-tier cache (DO memory + KV).
 * Spec §7.4.1
 */

export interface DOStub {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, opts?: { ttl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface KVStore {
  get<T = unknown>(key: string, opts?: { type?: string }): Promise<T | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export class SharedStorage {
  constructor(
    private doStub: DOStub,
    private kv: KVStore
  ) {}

  async get<T>(key: string): Promise<T | null> {
    // Tier 1: DO memory (hot, ~100ms TTL)
    const cached = await this.doStub.get<T>(key);
    if (cached !== null) return cached;

    // Tier 2: KV (warm, 1 hour TTL)
    const kvValue = await this.kv.get<T>(key, { type: 'json' });
    if (kvValue !== null && kvValue !== undefined) {
      // Backfill DO cache
      await this.doStub.set(key, kvValue, { ttl: 100 });
      return kvValue;
    }

    return null;
  }

  async set<T>(key: string, value: T, opts?: { ttl?: number }): Promise<void> {
    // Write to DO (immediate)
    await this.doStub.set(key, value, opts);

    // Write to KV (async, eventual consistency)
    this.kv.put(key, JSON.stringify(value), {
      expirationTtl: opts?.ttl ?? 3600,
    }).catch(() => {
      // KV write failures are non-fatal
    });
  }

  async delete(key: string): Promise<void> {
    await this.doStub.delete(key);
    this.kv.delete(key).catch(() => {});
  }
}

/**
 * MemoryDOStub — In-process DOStub with TTL support.
 * Used for single-node / testing environments.
 */
export class MemoryDOStub implements DOStub {
  private store = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, opts?: { ttl?: number }): Promise<void> {
    const expiresAt = opts?.ttl ? Date.now() + opts.ttl : 0;
    this.store.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  get size(): number {
    return this.store.size;
  }
}
