import type { AuthSession } from './types';

function base64UrlEncode(data: Uint8Array): string {
  const binStr = Array.from(data, (b) => String.fromCharCode(b)).join('');
  return btoa(binStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binStr = atob(padded);
  return Uint8Array.from(binStr, (c) => c.charCodeAt(0));
}

function toBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

function textEncode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function textDecode(buf: Uint8Array): string {
  return new TextDecoder().decode(buf);
}

async function hmacSign(
  data: string,
  secret: string
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    toBuffer(textEncode(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, toBuffer(textEncode(data)));
  return new Uint8Array(sig);
}

async function hmacVerify(
  data: string,
  signature: Uint8Array,
  secret: string
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    toBuffer(textEncode(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify('HMAC', key, toBuffer(signature), toBuffer(textEncode(data)));
}

export async function signJwt(
  payload: Omit<AuthSession, 'iat' | 'exp'>,
  secret: string,
  expiresInSeconds: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: AuthSession = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };
  const header = base64UrlEncode(
    textEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  );
  const body = base64UrlEncode(
    textEncode(JSON.stringify(fullPayload))
  );
  const sigInput = `${header}.${body}`;
  const sig = await hmacSign(sigInput, secret);
  return `${sigInput}.${base64UrlEncode(sig)}`;
}

export async function verifyJwt(
  token: string,
  secret: string
): Promise<AuthSession> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT');
  }
  const [header, body, sig] = parts;
  const sigInput = `${header}.${body}`;
  const sigBytes = base64UrlDecode(sig);
  const valid = await hmacVerify(sigInput, sigBytes, secret);
  if (!valid) {
    throw new Error('Invalid JWT signature');
  }
  const payload: AuthSession = JSON.parse(
    textDecode(base64UrlDecode(body))
  );
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    throw new Error('JWT expired');
  }
  return payload;
}
