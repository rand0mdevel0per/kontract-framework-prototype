import { describe, it, expect, beforeEach } from 'vitest';
import { SharedStorage, MemoryDOStub } from '../src/runtime/shared';
import type { KVStore } from '../src/runtime/shared';

function createMockKV(): KVStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async get<T>(key: string): Promise<T | null> {
      const raw = data.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      void opts;
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
  };
}

describe('MemoryDOStub', () => {
  let stub: MemoryDOStub;

  beforeEach(() => {
    stub = new MemoryDOStub();
  });

  it('get returns null for missing key', async () => {
    expect(await stub.get('x')).toBeNull();
  });

  it('set and get round-trip', async () => {
    await stub.set('k', { hello: 'world' });
    expect(await stub.get('k')).toEqual({ hello: 'world' });
  });

  it('delete removes key', async () => {
    await stub.set('k', 1);
    await stub.delete('k');
    expect(await stub.get('k')).toBeNull();
  });

  it('respects TTL expiration', async () => {
    await stub.set('k', 'val', { ttl: 1 }); // 1ms TTL
    await new Promise((r) => setTimeout(r, 5));
    expect(await stub.get('k')).toBeNull();
  });
});

describe('SharedStorage', () => {
  let doStub: MemoryDOStub;
  let kv: ReturnType<typeof createMockKV>;
  let shared: SharedStorage;

  beforeEach(() => {
    doStub = new MemoryDOStub();
    kv = createMockKV();
    shared = new SharedStorage(doStub, kv);
  });

  it('returns null for missing key', async () => {
    expect(await shared.get('x')).toBeNull();
  });

  it('set writes to both DO and KV', async () => {
    await shared.set('k', { data: 1 });
    // Wait for async KV write
    await new Promise((r) => setTimeout(r, 10));
    expect(await doStub.get('k')).toEqual({ data: 1 });
    expect(kv.data.has('k')).toBe(true);
  });

  it('get reads from DO first (tier 1)', async () => {
    await doStub.set('k', 'from-do');
    kv.data.set('k', '"from-kv"');
    expect(await shared.get('k')).toBe('from-do');
  });

  it('get falls back to KV when DO misses (tier 2)', async () => {
    kv.data.set('k', '{"val":42}');
    expect(await shared.get('k')).toEqual({ val: 42 });
    // Backfills DO
    expect(await doStub.get('k')).toEqual({ val: 42 });
  });

  it('delete removes from both tiers', async () => {
    await shared.set('k', 'val');
    await new Promise((r) => setTimeout(r, 10));
    await shared.delete('k');
    await new Promise((r) => setTimeout(r, 10));
    expect(await doStub.get('k')).toBeNull();
    expect(kv.data.has('k')).toBe(false);
  });
});
