import { describe, it, expect, beforeEach } from 'vitest';
import { handleAuthRoute } from '../src/auth/router';
import type { AuthConfig, AuthUser } from '../src/auth/types';
import type { PGClient } from '../src/storage/TableProxy';
import { verifyJwt } from '../src/auth/jwt';
import { createPasswordHash } from '../src/auth/providers';

const SECRET = 'test-router-secret';
const config: AuthConfig = {
  secret: SECRET,
  sessionTtlSeconds: 3600,
  allowAnonymous: true,
  providers: [],
};

function mockPG(): PGClient & { rows: Record<string, unknown>[] } {
  const rows: Record<string, unknown>[] = [
    { id: '__users', ptr: 'tbl_users_kontract', owner: '__system' },
  ];
  const userData: Record<string, unknown>[] = [];

  return {
    rows: userData,
    async query(sql: string, params?: unknown[]) {
      if (sql.includes('FROM storage')) {
        return { rows: rows.filter((r) => r.id === params?.[0] && r.owner === params?.[1]) };
      }
      if (sql.startsWith('INSERT INTO tbl_users_kontract')) {
        const id = params?.[0] as string;
        const data = JSON.parse(params?.[1] as string);
        userData.push({ id, data, _deleted_txid: null });
        return { rows: [] };
      }
      if (sql.includes('SELECT data FROM tbl_users_kontract WHERE id')) {
        return { rows: userData.filter((r) => r.id === params?.[0] && r._deleted_txid === null) };
      }
      if (sql.includes("data->>'email'")) {
        return {
          rows: userData.filter(
            (r) => (r.data as AuthUser).email === params?.[0] && r._deleted_txid === null
          ),
        };
      }
      if (sql.startsWith('UPDATE tbl_users_kontract SET data')) {
        const data = JSON.parse(params?.[0] as string);
        const id = params?.[1];
        const row = userData.find((r) => r.id === id);
        if (row) row.data = data;
        return { rows: row ? [{ id }] : [] };
      }
      return { rows: [] };
    },
  };
}

describe('Auth router', () => {
  let pg: ReturnType<typeof mockPG>;

  beforeEach(() => {
    pg = mockPG();
  });

  it('POST /auth/anonymous creates user + returns JWT', async () => {
    const resp = await handleAuthRoute(
      { method: 'POST', path: '/auth/anonymous' },
      { pg, config }
    );
    expect(resp.status).toBe(201);
    const body = resp.data as { token: string; owner: string };
    expect(body.token).toBeTruthy();
    expect(body.owner).toMatch(/^anon_/);
    const session = await verifyJwt(body.token, SECRET);
    expect(session.isAnonymous).toBe(true);
  });

  it('POST /auth/register creates user', async () => {
    const resp = await handleAuthRoute(
      { method: 'POST', path: '/auth/register', body: { email: 'test@x.com', password: 'pass123' } },
      { pg, config }
    );
    expect(resp.status).toBe(201);
    const body = resp.data as { token: string; owner: string };
    expect(body.token).toBeTruthy();
    const session = await verifyJwt(body.token, SECRET);
    expect(session.isAnonymous).toBe(false);
  });

  it('POST /auth/register rejects duplicate email', async () => {
    await handleAuthRoute(
      { method: 'POST', path: '/auth/register', body: { email: 'dup@x.com', password: 'pass' } },
      { pg, config }
    );
    await expect(
      handleAuthRoute(
        { method: 'POST', path: '/auth/register', body: { email: 'dup@x.com', password: 'pass' } },
        { pg, config }
      )
    ).rejects.toThrow('Email already registered');
  });

  it('POST /auth/login with correct credentials', async () => {
    const hash = await createPasswordHash('secret');
    const user: AuthUser = {
      id: 'u1', email: 'login@x.com', passwordHash: hash,
      isAnonymous: false, ugroups: ['admin'],
      createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString(),
    };
    pg.rows.push({ id: 'u1', data: user, _deleted_txid: null });

    const resp = await handleAuthRoute(
      { method: 'POST', path: '/auth/login', body: { email: 'login@x.com', password: 'secret' } },
      { pg, config }
    );
    expect(resp.status).toBe(200);
    const body = resp.data as { token: string; owner: string };
    expect(body.owner).toBe('u1');
  });

  it('POST /auth/login with wrong credentials -> 401', async () => {
    const hash = await createPasswordHash('right');
    const user: AuthUser = {
      id: 'u2', email: 'wrong@x.com', passwordHash: hash,
      isAnonymous: false, ugroups: [],
      createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString(),
    };
    pg.rows.push({ id: 'u2', data: user, _deleted_txid: null });

    await expect(
      handleAuthRoute(
        { method: 'POST', path: '/auth/login', body: { email: 'wrong@x.com', password: 'bad' } },
        { pg, config }
      )
    ).rejects.toThrow('Invalid email or password');
  });

  it('POST /auth/link upgrades anonymous', async () => {
    const anonResp = await handleAuthRoute(
      { method: 'POST', path: '/auth/anonymous' },
      { pg, config }
    );
    const { token, owner } = anonResp.data as { token: string; owner: string };

    const linkResp = await handleAuthRoute(
      {
        method: 'POST', path: '/auth/link',
        body: { email: 'linked@x.com', password: 'newpass' },
        headers: { authorization: `Bearer ${token}` },
      },
      { pg, config }
    );
    expect(linkResp.status).toBe(200);
    const linkBody = linkResp.data as { token: string; owner: string };
    expect(linkBody.owner).toBe(owner);
    const session = await verifyJwt(linkBody.token, SECRET);
    expect(session.isAnonymous).toBe(false);
  });

  it('POST /auth/refresh returns new token', async () => {
    const anonResp = await handleAuthRoute(
      { method: 'POST', path: '/auth/anonymous' },
      { pg, config }
    );
    const { token } = anonResp.data as { token: string };

    const refreshResp = await handleAuthRoute(
      {
        method: 'POST', path: '/auth/refresh',
        headers: { authorization: `Bearer ${token}` },
      },
      { pg, config }
    );
    expect(refreshResp.status).toBe(200);
    const newToken = (refreshResp.data as { token: string }).token;
    const session = await verifyJwt(newToken, SECRET);
    expect(session.owner).toBeTruthy();
  });

  it('POST /auth/logout returns 204', async () => {
    const resp = await handleAuthRoute(
      { method: 'POST', path: '/auth/logout' },
      { pg, config }
    );
    expect(resp.status).toBe(204);
  });

  it('GET /auth/me returns user info', async () => {
    const regResp = await handleAuthRoute(
      { method: 'POST', path: '/auth/register', body: { email: 'me@x.com', password: 'pass' } },
      { pg, config }
    );
    const { token } = regResp.data as { token: string };

    const meResp = await handleAuthRoute(
      {
        method: 'GET', path: '/auth/me',
        headers: { authorization: `Bearer ${token}` },
      },
      { pg, config }
    );
    expect(meResp.status).toBe(200);
    const user = meResp.data as Record<string, unknown>;
    expect(user.email).toBe('me@x.com');
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('GET /auth/me rejects without token', async () => {
    await expect(
      handleAuthRoute(
        { method: 'GET', path: '/auth/me' },
        { pg, config }
      )
    ).rejects.toThrow('Authentication required');
  });

  it('unknown route returns 404', async () => {
    const resp = await handleAuthRoute(
      { method: 'GET', path: '/auth/unknown' },
      { pg, config }
    );
    expect(resp.status).toBe(404);
  });
});
