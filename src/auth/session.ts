import type { AuthConfig, AuthSession } from './types';
import { signJwt, verifyJwt } from './jwt';

function generateSid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createSession(
  owner: string,
  config: AuthConfig,
  userInfo: { isAnonymous: boolean; ugroups: string[] }
): Promise<string> {
  const sid = generateSid();
  return signJwt(
    { sid, owner, isAnonymous: userInfo.isAnonymous, ugroups: userInfo.ugroups },
    config.secret,
    config.sessionTtlSeconds
  );
}

export async function verifySession(
  token: string,
  config: AuthConfig
): Promise<AuthSession> {
  return verifyJwt(token, config.secret);
}

export async function refreshSession(
  token: string,
  config: AuthConfig
): Promise<string> {
  const session = await verifyJwt(token, config.secret);
  return signJwt(
    {
      sid: session.sid,
      owner: session.owner,
      isAnonymous: session.isAnonymous,
      ugroups: session.ugroups,
    },
    config.secret,
    config.sessionTtlSeconds
  );
}
