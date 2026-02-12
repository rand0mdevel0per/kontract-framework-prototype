import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

export interface RPCCall {
  method: string;
  args: Uint8Array;
  metadata: Record<string, string>;
}

export function hkdf(input: Uint8Array, info: string, len: number): Uint8Array {
  const h = createHash('sha256');
  h.update(Buffer.from(input));
  h.update(Buffer.from(info));
  const out = h.digest();
  return out.subarray(0, len);
}

export function encrypt(payload: Uint8Array, key: Uint8Array): { nonce: Uint8Array; data: Uint8Array; tag: Uint8Array } {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key), nonce);
  const enc = Buffer.concat([cipher.update(Buffer.from(payload)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { nonce, data: enc, tag };
}

export function decrypt(encrypted: { nonce: Uint8Array; data: Uint8Array; tag: Uint8Array }, key: Uint8Array): Uint8Array {
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(encrypted.nonce));
  decipher.setAuthTag(Buffer.from(encrypted.tag));
  const dec = Buffer.concat([decipher.update(Buffer.from(encrypted.data)), decipher.final()]);
  return dec;
}
