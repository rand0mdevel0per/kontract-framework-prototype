import { describe, it, expect } from 'vitest';
import { createSession, verifySession, refreshSession } from '../src/auth/session';
import type { AuthConfig } from '../src/auth/types';

const config: AuthConfig = {
  secret: 'test-session-secret',
  sessionTtlSeconds: 3600,
  allowAnonymous: true,
  providers: [],
};

describe('Session lifecycle', () => {
  it('creates a valid session token', async () => {
    const token = await createSession('alice', config, {
      isAnonymous: false,
      ugroups: ['admin'],
    });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('verifies a session token', async () => {
    const token = await createSession('bob', config, {
      isAnonymous: true,
      ugroups: [],
    });
    const session = await verifySession(token, config);
    expect(session.owner).toBe('bob');
    expect(session.isAnonymous).toBe(true);
    expect(session.ugroups).toEqual([]);
    expect(session.sid).toBeTruthy();
  });

  it('refreshes a session with extended expiry', async () => {
    const token = await createSession('carol', config, {
      isAnonymous: false,
      ugroups: ['viewer'],
    });
    const original = await verifySession(token, config);
    const newToken = await refreshSession(token, config);
    const refreshed = await verifySession(newToken, config);
    expect(refreshed.owner).toBe('carol');
    expect(refreshed.sid).toBe(original.sid);
    expect(refreshed.exp).toBeGreaterThanOrEqual(original.exp);
  });

  it('rejects expired session on verify', async () => {
    const shortConfig: AuthConfig = { ...config, sessionTtlSeconds: -10 };
    const token = await createSession('expired', shortConfig, {
      isAnonymous: false,
      ugroups: [],
    });
    await expect(verifySession(token, config)).rejects.toThrow('JWT expired');
  });

  it('rejects expired session on refresh', async () => {
    const shortConfig: AuthConfig = { ...config, sessionTtlSeconds: -10 };
    const token = await createSession('expired', shortConfig, {
      isAnonymous: false,
      ugroups: [],
    });
    await expect(refreshSession(token, config)).rejects.toThrow('JWT expired');
  });
});
