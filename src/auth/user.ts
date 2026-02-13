import type { PGClient } from '../storage/TableProxy';
import type { AuthUser } from './types';

const USERS_PTR = '__users';
const SYSTEM_OWNER = '__system';

async function resolveUsersTable(pg: PGClient): Promise<string> {
  const result = await pg.query(
    'SELECT ptr FROM storage WHERE id = $1 AND owner = $2',
    [USERS_PTR, SYSTEM_OWNER]
  );
  const row = result.rows[0];
  if (!row) throw new Error('Users table not registered in storage');
  const ptr = String(row.ptr);
  if (!/^[a-zA-Z0-9_]+$/.test(ptr)) throw new Error('Invalid users table name');
  return ptr;
}

export async function createUser(pg: PGClient, user: AuthUser): Promise<void> {
  const ptr = await resolveUsersTable(pg);
  await pg.query(
    `INSERT INTO ${ptr} (id, data, _txid, _owner)
     VALUES ($1, $2, 0, $3)`,
    [user.id, JSON.stringify(user), SYSTEM_OWNER]
  );
}

export async function getUser(pg: PGClient, owner: string): Promise<AuthUser | null> {
  const ptr = await resolveUsersTable(pg);
  const result = await pg.query(
    `SELECT data FROM ${ptr} WHERE id = $1 AND _deleted_txid IS NULL`,
    [owner]
  );
  return (result.rows[0]?.data as AuthUser) ?? null;
}

export async function getUserByEmail(pg: PGClient, email: string): Promise<AuthUser | null> {
  const ptr = await resolveUsersTable(pg);
  const result = await pg.query(
    `SELECT data FROM ${ptr} WHERE data->>'email' = $1 AND _deleted_txid IS NULL`,
    [email]
  );
  return (result.rows[0]?.data as AuthUser) ?? null;
}

export async function linkAccount(
  pg: PGClient,
  owner: string,
  email: string,
  passwordHash: string
): Promise<AuthUser> {
  const user = await getUser(pg, owner);
  if (!user) throw new Error('User not found');
  if (!user.isAnonymous) throw new Error('Account already linked');
  const updated: AuthUser = {
    ...user,
    email,
    passwordHash,
    isAnonymous: false,
  };
  const ptr = await resolveUsersTable(pg);
  await pg.query(
    `UPDATE ${ptr} SET data = $1 WHERE id = $2`,
    [JSON.stringify(updated), owner]
  );
  return updated;
}

export async function deleteUser(pg: PGClient, owner: string, txid: bigint): Promise<boolean> {
  const ptr = await resolveUsersTable(pg);
  const result = await pg.query(
    `UPDATE ${ptr} SET _deleted_txid = $1 WHERE id = $2 AND _deleted_txid IS NULL RETURNING id`,
    [txid, owner]
  );
  return !!result.rows[0];
}
