import { describe, it, expect } from 'vitest';
import { verifyAccess, checkTablePermission, checkFieldPermissions } from '../src/security/permissions';

describe('permissions', () => {
  it('verifyAccess checks owner and mask', () => {
    const ctx = { sid: 's', owner: 'me', perm: 0b110 };
    expect(() => verifyAccess(ctx, 0b100, 'me')).not.toThrow();
    expect(() => verifyAccess(ctx, 0b001, 'me')).toThrow();
    expect(() => verifyAccess(ctx, 0b100, 'you')).toThrow();
  });

  it('table permission checks', () => {
    expect(() => checkTablePermission(0b100, 'read')).not.toThrow();
    expect(() => checkTablePermission(0b100, 'write')).toThrow();
  });

  it('field permission checks', () => {
    const data = { email: 'a', name: 'b' };
    const perms = { email: 0b100, name: 0b110 };
    expect(() => checkFieldPermissions(data, perms, 0b010)).not.toThrow();
    expect(() => checkFieldPermissions({ name: 'c' }, perms, 0b000)).toThrow();
  });
});
