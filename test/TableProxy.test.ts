import { describe, it, expect } from 'vitest';
import { TableProxy, PGClient } from '../src/storage/TableProxy';

class MockPG implements PGClient {
  calls: { sql: string; params?: unknown[] }[] = [];
  storage: Record<string, string> = {};
  rows: Array<Record<string, unknown>> = [];
  async query(sql: string, params?: unknown[]) {
    this.calls.push({ sql, params });
    if (/SELECT ptr FROM storage/.test(sql)) {
      const [name, owner] = params as [string, string];
      const ptr = this.storage[`${name}:${owner}`];
      return { rows: ptr ? [{ ptr }] : [] };
    }
    return { rows: this.rows };
  }
}

const ctx = { sid: 's', owner: 'o', currentTxid: 10n, perm: 0b111 };

describe('TableProxy', () => {
  it('caches ptr after first retrieval', async () => {
    const pg = new MockPG();
    pg.storage['users:o'] = 'tbl_users_abc';
    type AnyRec = Record<string, unknown>;
    const proxy = new TableProxy<AnyRec>(pg, 'users', ctx);
    await proxy.getPtr();
    await proxy.getPtr();
    const selects = pg.calls.filter(c => /SELECT ptr FROM storage/.test(c.sql));
    expect(selects.length).toBe(1);
  });

  it('builds MVCC get query', async () => {
    const pg = new MockPG();
    pg.storage['users:o'] = 'tbl_users_abc';
    pg.rows = [{ data: { id: '1' } }];
    type AnyRec = Record<string, unknown>;
    const proxy = new TableProxy<AnyRec>(pg, 'users', ctx);
    const u = await proxy.get('1');
    expect(u?.id).toBe('1');
    const last = pg.calls[pg.calls.length - 1];
    expect(last.sql.includes('AND _txid < $2')).toBe(true);
  });

  it('push and pop honor _order', async () => {
    const pg = new MockPG();
    pg.storage['tasks:o'] = 'tbl_tasks';
    type AnyRec = Record<string, unknown>;
    const proxy = new TableProxy<AnyRec>(pg, 'tasks', ctx);
    await proxy.push({ title: 't' });
    const popRows = [{ data: { title: 't' } }];
    pg.rows = popRows;
    const val = await proxy.pop();
    expect(val?.title).toBe('t');
    const popCall = pg.calls.find(c => /DELETE FROM tbl_tasks/.test(c.sql) && c.sql.includes('MAX(_order)'));
    expect(!!popCall).toBe(true);
  });
  it('shift removes first item', async () => {
    const pg = new MockPG();
    pg.storage['tasks:o'] = 'tbl_tasks';
    const proxy = new TableProxy<AnyRec>(pg, 'tasks', ctx);
    pg.rows = [{ data: { title: 'first' } }];
    const val = await proxy.shift();
    expect(val?.title).toBe('first');
    const shiftCall = pg.calls.find(c => /DELETE FROM tbl_tasks/.test(c.sql) && c.sql.includes('MIN(_order)'));
    expect(!!shiftCall).toBe(true);
  });

  it('update merges partial fields and calls set', async () => {
    const pg = new MockPG();
    pg.storage['users:o'] = 'tbl_users_abc';
    pg.rows = [{ data: { id: '1', name: 'A', email: 'e' } }];
    const proxy = new TableProxy<AnyRec>(pg, 'users', ctx);
    await proxy.update('1', { name: 'B' });
    const insertCall = pg.calls.find(c => /INSERT INTO tbl_users_abc/.test(c.sql));
    expect(!!insertCall).toBe(true);
    const payload = insertCall?.params?.[1] as string;
    const merged = JSON.parse(payload) as Record<string, unknown>;
    expect(merged.name).toBe('B');
    expect(merged.email).toBe('e');
  });

  it('delete marks row as logically deleted', async () => {
    const pg = new MockPG();
    pg.storage['users:o'] = 'tbl_users_abc';
    pg.rows = [{ id: '1' }];
    const proxy = new TableProxy<AnyRec>(pg, 'users', ctx);
    const ok = await proxy.delete('1');
    expect(ok).toBe(true);
    const delCall = pg.calls.find(c => /UPDATE tbl_users_abc/.test(c.sql) && c.sql.includes('_deleted_txid'));
    expect(!!delCall).toBe(true);
  });

  it('query yields matching results', async () => {
    const pg = new MockPG();
    pg.storage['users:o'] = 'tbl_users_abc';
    pg.rows = [{ data: { id: '1', name: 'Alice' } }, { data: { id: '2', name: 'Alice' } }];
    const proxy = new TableProxy<AnyRec>(pg, 'users', ctx);
    const out: AnyRec[] = [];
    for await (const u of proxy.query({ name: 'Alice' })) {
      out.push(u);
    }
    expect(out.length).toBe(2);
    const q = pg.calls.find(c => /SELECT data FROM tbl_users_abc/.test(c.sql) && c.sql.includes('data @>'));
    expect(!!q).toBe(true);
  });

  it('exec rewrites table name and prevents other tables', async () => {
    const pg = new MockPG();
    pg.storage['users:o'] = 'tbl_users_abc';
    type AnyRec = Record<string, unknown>;
    const proxy = new TableProxy<AnyRec>(pg, 'users', ctx);
    await proxy.exec('SELECT * FROM users WHERE id = $1', ['1']);
    const last = pg.calls[pg.calls.length - 1];
    expect(last.sql.includes('tbl_users_abc')).toBe(true);
    await expect(proxy.exec('SELECT * FROM other WHERE id = $1', ['1'])).rejects.toThrow();
  });

  it('exec prevents join on other tables', async () => {
    const pg = new MockPG();
    pg.storage['users:o'] = 'tbl_users_abc';
    const proxy = new TableProxy<AnyRec>(pg, 'users', ctx);
    await expect(proxy.exec('SELECT * FROM users JOIN other ON users.id=other.id', [])).rejects.toThrow();
  });

  it('getPtr throws when table not found', async () => {
    const pg = new MockPG();
    const proxy = new TableProxy<AnyRec>(pg, 'users', ctx);
    await expect(proxy.getPtr()).rejects.toThrow();
  });

  it('getPtr sanitizes identifier and rejects invalid', async () => {
    const pg = new MockPG();
    pg.storage['users:o'] = 'tbl-users-invalid!';
    const proxy = new TableProxy<AnyRec>(pg, 'users', ctx);
    await expect(proxy.getPtr()).rejects.toThrow();
  });
});
