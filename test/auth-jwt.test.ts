import { describe, it, expect, vi, afterEach } from 'vitest';
import { signJwt, verifyJwt } from '../src/auth/jwt';

const SECRET = 'test-secret-key-for-jwt';

describe('JWT', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('signs and verifies a JWT round-trip', async () => {
    const token = await signJwt(
      { sid: 's1', owner: 'alice', isAnonymous: false, ugroups: ['admin'] },
      SECRET,
      3600
    );
    const payload = await verifyJwt(token, SECRET);
    expect(payload.sid).toBe('s1');
    expect(payload.owner).toBe('alice');
    expect(payload.isAnonymous).toBe(false);
    expect(payload.ugroups).toEqual(['admin']);
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it('rejects expired tokens', async () => {
    const token = await signJwt(
      { sid: 's2', owner: 'bob', isAnonymous: true, ugroups: [] },
      SECRET,
      -10
    );
    await expect(verifyJwt(token, SECRET)).rejects.toThrow('JWT expired');
  });

  it('rejects tampered tokens', async () => {
    const token = await signJwt(
      { sid: 's3', owner: 'carol', isAnonymous: false, ugroups: [] },
      SECRET,
      3600
    );
    const tampered = token.slice(0, -5) + 'XXXXX';
    await expect(verifyJwt(tampered, SECRET)).rejects.toThrow('Invalid JWT signature');
  });

  it('rejects malformed tokens', async () => {
    await expect(verifyJwt('not.a.valid.jwt', SECRET)).rejects.toThrow('Malformed JWT');
    await expect(verifyJwt('onlyonepart', SECRET)).rejects.toThrow('Malformed JWT');
    await expect(verifyJwt('', SECRET)).rejects.toThrow('Malformed JWT');
  });

  it('sets iat and exp correctly', async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await signJwt(
      { sid: 's4', owner: 'dave', isAnonymous: false, ugroups: [] },
      SECRET,
      7200
    );
    const after = Math.floor(Date.now() / 1000);
    const payload = await verifyJwt(token, SECRET);
    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.iat).toBeLessThanOrEqual(after);
    expect(payload.exp).toBe(payload.iat + 7200);
  });

  it('rejects tokens signed with a different secret', async () => {
    const token = await signJwt(
      { sid: 's5', owner: 'eve', isAnonymous: false, ugroups: [] },
      SECRET,
      3600
    );
    await expect(verifyJwt(token, 'wrong-secret')).rejects.toThrow('Invalid JWT signature');
  });
});
