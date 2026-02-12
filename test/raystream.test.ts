import { describe, it, expect } from 'vitest';
import { hkdf, encrypt, decrypt } from '../src/protocol/raystream';

describe('raystream', () => {
  it('hkdf derives fixed length', () => {
    const key = hkdf(new Uint8Array([1, 2, 3]), 'info', 32);
    expect(key.length).toBe(32);
  });

  it('encrypt and decrypt roundtrip', () => {
    const key = hkdf(new Uint8Array([1, 2, 3]), 'info', 32);
    const payload = new TextEncoder().encode('hello');
    const enc = encrypt(payload, key);
    const dec = decrypt(enc, key);
    expect(new TextDecoder().decode(dec)).toBe('hello');
  });
});
