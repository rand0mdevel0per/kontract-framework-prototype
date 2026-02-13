import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, getUser, getUserByEmail, linkAccount, deleteUser } from '../src/auth/user';
import type { AuthUser } from '../src/auth/types';
import type { PGClient } from '../src/storage/TableProxy';

function mockPG(): PGClient & { tables: Record<string, Record<string, unknown>[]> } {
  const tables: Record<string, Record<string, unknown>[]> = {
    storage: [{ id: '__users', ptr: 'tbl_users_kontract', owner: '__system' }],
    tbl_users_kontract: [],
  };

  return {
    tables,
    async query(sql: string, params?: unknown[]) {
      if (sql.includes('FROM storage')) {
        const id = params?.[0];
        const owner = params?.[1];
        const rows = tables.storage.filter(
          (r) => r.id === id && r.owner === owner
        );
        return { rows };
      }
      if (sql.startsWith('INSERT INTO tbl_users_kontract')) {
        const id = params?.[0] as string;
        const data = JSON.parse(params?.[1] as string);
        tables.tbl_users_kontract.push({ id, data, _deleted_txid: null });
        return { rows: [] };
      }
      if (sql.includes('SELECT data FROM tbl_users_kontract WHERE id')) {
        const id = params?.[0];
        const rows = tables.tbl_users_kontract.filter(
          (r) => r.id === id && r._deleted_txid === null
        );
        return { rows };
      }
      if (sql.includes("data->>'email'")) {
        const email = params?.[0];
        const rows = tables.tbl_users_kontract.filter(
          (r) => (r.data as AuthUser).email === email && r._deleted_txid === null
        );
        return { rows };
      }
      if (sql.startsWith('UPDATE tbl_users_kontract SET data')) {
        const data = JSON.parse(params?.[0] as string);
        const id = params?.[1];
        const row = tables.tbl_users_kontract.find((r) => r.id === id);
        if (row) row.data = data;
        return { rows: row ? [{ id }] : [] };
      }
      if (sql.includes('SET _deleted_txid')) {
        const txid = params?.[0];
        const id = params?.[1];
        const row = tables.tbl_users_kontract.find(
          (r) => r.id === id && r._deleted_txid === null
        );
        if (row) {
          row._deleted_txid = txid;
          return { rows: [{ id }] };
        }
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

describe('User CRUD', () => {
  let pg: ReturnType<typeof mockPG>;

  const alice: AuthUser = {
    id: 'user_alice',
    email: 'alice@test.com',
    passwordHash: 'fakehash',
    isAnonymous: false,
    ugroups: ['admin'],
    createdAt: '2026-01-01T00:00:00Z',
    lastLoginAt: '2026-01-01T00:00:00Z',
  };

  const anonBob: AuthUser = {
    id: 'anon_bob',
    isAnonymous: true,
    ugroups: [],
    createdAt: '2026-01-01T00:00:00Z',
    lastLoginAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    pg = mockPG();
  });

  it('creates and retrieves a user', async () => {
    await createUser(pg, alice);
    const user = await getUser(pg, 'user_alice');
    expect(user).not.toBeNull();
    expect(user!.id).toBe('user_alice');
    expect(user!.email).toBe('alice@test.com');
  });

  it('returns null for nonexistent user', async () => {
    const user = await getUser(pg, 'nobody');
    expect(user).toBeNull();
  });

  it('finds user by email', async () => {
    await createUser(pg, alice);
    const user = await getUserByEmail(pg, 'alice@test.com');
    expect(user).not.toBeNull();
    expect(user!.id).toBe('user_alice');
  });

  it('returns null for nonexistent email', async () => {
    const user = await getUserByEmail(pg, 'nobody@test.com');
    expect(user).toBeNull();
  });

  it('links anonymous account to email/password', async () => {
    await createUser(pg, anonBob);
    const linked = await linkAccount(pg, 'anon_bob', 'bob@test.com', 'newhash');
    expect(linked.isAnonymous).toBe(false);
    expect(linked.email).toBe('bob@test.com');
    expect(linked.passwordHash).toBe('newhash');
  });

  it('rejects linking already-authenticated account', async () => {
    await createUser(pg, alice);
    await expect(
      linkAccount(pg, 'user_alice', 'new@test.com', 'hash')
    ).rejects.toThrow('Account already linked');
  });

  it('rejects linking nonexistent user', async () => {
    await expect(
      linkAccount(pg, 'nobody', 'x@test.com', 'hash')
    ).rejects.toThrow('User not found');
  });

  it('deletes a user', async () => {
    await createUser(pg, alice);
    const deleted = await deleteUser(pg, 'user_alice', 100n);
    expect(deleted).toBe(true);
    const user = await getUser(pg, 'user_alice');
    expect(user).toBeNull();
  });

  it('returns false when deleting nonexistent user', async () => {
    const deleted = await deleteUser(pg, 'nobody', 100n);
    expect(deleted).toBe(false);
  });
});
