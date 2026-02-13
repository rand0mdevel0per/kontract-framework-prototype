import { describe, it, expect } from 'vitest';
import {
  AnonymousProvider,
  PasswordProvider,
  createPasswordHash,
  verifyPasswordHash,
} from '../src/auth/providers';
import type { AuthUser } from '../src/auth/types';

describe('AnonymousProvider', () => {
  const provider = new AnonymousProvider();

  it('generates unique owner IDs', async () => {
    const r1 = await provider.authenticate({});
    const r2 = await provider.authenticate({});
    expect(r1.owner).not.toBe(r2.owner);
    expect(r1.owner).toMatch(/^anon_/);
    expect(r2.owner).toMatch(/^anon_/);
  });

  it('returns user with isAnonymous true', async () => {
    const { user } = await provider.authenticate({});
    expect(user.isAnonymous).toBe(true);
    expect(user.ugroups).toEqual([]);
  });
});

describe('PasswordProvider', () => {
  const users: AuthUser[] = [];

  function makeLookup() {
    return async (email: string) =>
      users.find((u) => u.email === email) ?? null;
  }

  it('register + login round-trip', async () => {
    const hash = await createPasswordHash('s3cret');
    const user: AuthUser = {
      id: 'user_1',
      email: 'alice@test.com',
      passwordHash: hash,
      isAnonymous: false,
      ugroups: ['admin'],
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    users.push(user);

    const provider = new PasswordProvider(makeLookup());
    const result = await provider.authenticate({
      email: 'alice@test.com',
      password: 's3cret',
    });
    expect(result.owner).toBe('user_1');
    expect(result.user.isAnonymous).toBe(false);
  });

  it('rejects wrong password', async () => {
    const provider = new PasswordProvider(makeLookup());
    await expect(
      provider.authenticate({ email: 'alice@test.com', password: 'wrong' })
    ).rejects.toThrow('Invalid email or password');
  });

  it('rejects nonexistent email', async () => {
    const provider = new PasswordProvider(makeLookup());
    await expect(
      provider.authenticate({ email: 'nobody@test.com', password: 'any' })
    ).rejects.toThrow('Invalid email or password');
  });

  it('rejects missing credentials', async () => {
    const provider = new PasswordProvider(makeLookup());
    await expect(provider.authenticate({})).rejects.toThrow(
      'Email and password are required'
    );
  });
});

describe('Password hashing', () => {
  it('hash and verify round-trip', async () => {
    const hash = await createPasswordHash('mypassword');
    expect(await verifyPasswordHash('mypassword', hash)).toBe(true);
    expect(await verifyPasswordHash('wrongpassword', hash)).toBe(false);
  });

  it('produces different hashes for same password (random salt)', async () => {
    const h1 = await createPasswordHash('same');
    const h2 = await createPasswordHash('same');
    expect(h1).not.toBe(h2);
  });
});
