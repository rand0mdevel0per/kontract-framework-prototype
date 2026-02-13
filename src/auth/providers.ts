import type { AuthProvider, AuthUser } from './types';

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  const saltBuf = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password).buffer as ArrayBuffer,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBuf, iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );
  const saltHex = Array.from(salt, (b) => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(derived), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}

export async function createPasswordHash(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return hashPassword(password, salt);
}

export async function verifyPasswordHash(password: string, stored: string): Promise<boolean> {
  const [saltHex, expectedHash] = stored.split(':');
  const salt = Uint8Array.from(
    saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16))
  );
  const result = await hashPassword(password, salt);
  const [, resultHash] = result.split(':');
  return resultHash === expectedHash;
}

export class AnonymousProvider implements AuthProvider {
  name = 'anonymous';

  async authenticate(
    credentials: Record<string, string>
  ): Promise<{ owner: string; user: Partial<AuthUser> }> {
    void credentials;
    const owner = `anon_${generateId()}`;
    return {
      owner,
      user: {
        id: owner,
        isAnonymous: true,
        ugroups: [],
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      },
    };
  }
}

export class PasswordProvider implements AuthProvider {
  name = 'password';

  private lookupByEmail: (email: string) => Promise<AuthUser | null>;

  constructor(lookupByEmail: (email: string) => Promise<AuthUser | null>) {
    this.lookupByEmail = lookupByEmail;
  }

  async authenticate(
    credentials: Record<string, string>
  ): Promise<{ owner: string; user: Partial<AuthUser> }> {
    const { email, password } = credentials;
    if (!email || !password) {
      throw new Error('Email and password are required');
    }
    const user = await this.lookupByEmail(email);
    if (!user || !user.passwordHash) {
      throw new Error('Invalid email or password');
    }
    const valid = await verifyPasswordHash(password, user.passwordHash);
    if (!valid) {
      throw new Error('Invalid email or password');
    }
    return {
      owner: user.id,
      user: {
        id: user.id,
        email: user.email,
        isAnonymous: false,
        ugroups: user.ugroups,
        lastLoginAt: new Date().toISOString(),
      },
    };
  }
}
