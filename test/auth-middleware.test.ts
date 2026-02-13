import { describe, it, expect } from 'vitest';
import { authMiddleware, requireAuth, requireGroup } from '../src/auth/middleware';
import { signJwt } from '../src/auth/jwt';
import type { AuthConfig } from '../src/auth/types';
import type { Context } from '../src/storage/TableProxy';

const SECRET = 'test-mw-secret';
const config: AuthConfig = {
  secret: SECRET,
  sessionTtlSeconds: 3600,
  allowAnonymous: true,
  providers: [],
};

function makeCtx(headers?: Record<string, string>): Context & { isAnonymous?: boolean; ugroups?: string[] } {
  return {
    sid: '',
    owner: '',
    currentTxid: 0n,
    perm: 0b111,
    headers: headers ?? {},
  };
}

describe('authMiddleware', () => {
  it('populates context from Bearer token', async () => {
    const token = await signJwt(
      { sid: 's1', owner: 'alice', isAnonymous: false, ugroups: ['admin'] },
      SECRET,
      3600
    );
    const ctx = makeCtx({ authorization: `Bearer ${token}` });
    const mw = authMiddleware(config);
    let nextCalled = false;
    await mw.fn(ctx, async () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(ctx.owner).toBe('alice');
    expect(ctx.sid).toBe('s1');
    expect(ctx.isAnonymous).toBe(false);
    expect(ctx.ugroups).toEqual(['admin']);
  });

  it('allows anonymous when configured', async () => {
    const ctx = makeCtx({});
    const mw = authMiddleware(config);
    let nextCalled = false;
    await mw.fn(ctx, async () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(ctx.isAnonymous).toBe(true);
    expect(ctx.ugroups).toEqual([]);
  });

  it('rejects missing token when anonymous disabled', async () => {
    const strictConfig: AuthConfig = { ...config, allowAnonymous: false };
    const ctx = makeCtx({});
    const mw = authMiddleware(strictConfig);
    await expect(mw.fn(ctx, async () => {})).rejects.toThrow('Missing authentication token');
  });

  it('rejects invalid tokens', async () => {
    const ctx = makeCtx({ authorization: 'Bearer invalid.token.here' });
    const mw = authMiddleware(config);
    await expect(mw.fn(ctx, async () => {})).rejects.toThrow('Invalid or expired token');
  });

  it('rejects expired tokens', async () => {
    const token = await signJwt(
      { sid: 's2', owner: 'bob', isAnonymous: false, ugroups: [] },
      SECRET,
      -10
    );
    const ctx = makeCtx({ authorization: `Bearer ${token}` });
    const mw = authMiddleware(config);
    await expect(mw.fn(ctx, async () => {})).rejects.toThrow('Invalid or expired token');
  });
});

describe('requireAuth', () => {
  it('blocks anonymous users', async () => {
    const ctx = makeCtx();
    ctx.isAnonymous = true;
    const mw = requireAuth();
    await expect(mw.fn(ctx, async () => {})).rejects.toThrow('Authentication required');
  });

  it('allows authenticated users', async () => {
    const ctx = makeCtx();
    ctx.isAnonymous = false;
    const mw = requireAuth();
    let nextCalled = false;
    await mw.fn(ctx, async () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
});

describe('requireGroup', () => {
  it('blocks non-members', async () => {
    const ctx = makeCtx();
    ctx.ugroups = ['viewer'];
    const mw = requireGroup('admin');
    await expect(mw.fn(ctx, async () => {})).rejects.toThrow("User group 'admin' required");
  });

  it('allows members', async () => {
    const ctx = makeCtx();
    ctx.ugroups = ['admin', 'viewer'];
    const mw = requireGroup('admin');
    let nextCalled = false;
    await mw.fn(ctx, async () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('blocks when ugroups undefined', async () => {
    const ctx = makeCtx();
    const mw = requireGroup('admin');
    await expect(mw.fn(ctx, async () => {})).rejects.toThrow("User group 'admin' required");
  });
});
