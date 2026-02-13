import type { PGClient } from '../storage/TableProxy';
import type { AuthConfig, AuthUser } from './types';
import { HttpResp, UnauthorizedError } from '../runtime/http';
import { AnonymousProvider, PasswordProvider, createPasswordHash } from './providers';
import { createSession, verifySession, refreshSession } from './session';
import { createUser, getUser, getUserByEmail, linkAccount } from './user';

export interface AuthRouterDeps {
  pg: PGClient;
  config: AuthConfig;
}

export type AuthRequest = {
  method: string;
  path: string;
  body?: Record<string, string>;
  headers?: Record<string, string>;
};

function extractBearer(headers?: Record<string, string>): string | null {
  const auth = headers?.['authorization'] ?? headers?.['Authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

export async function handleAuthRoute(
  req: AuthRequest,
  deps: AuthRouterDeps
): Promise<HttpResp<unknown>> {
  const { pg, config } = deps;
  const route = req.path.replace(/^\/auth\/?/, '');

  if (req.method === 'POST' && route === 'anonymous') {
    if (!config.allowAnonymous) {
      throw new UnauthorizedError('Anonymous login disabled');
    }
    const provider = new AnonymousProvider();
    const { owner, user } = await provider.authenticate({});
    const fullUser: AuthUser = {
      id: owner,
      isAnonymous: true,
      ugroups: [],
      createdAt: user.createdAt ?? new Date().toISOString(),
      lastLoginAt: user.lastLoginAt ?? new Date().toISOString(),
      ...user,
    };
    await createUser(pg, fullUser);
    const token = await createSession(owner, config, {
      isAnonymous: true,
      ugroups: [],
    });
    return HttpResp.created({ token, owner });
  }

  if (req.method === 'POST' && route === 'register') {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      throw new UnauthorizedError('Email and password required');
    }
    const existing = await getUserByEmail(pg, email);
    if (existing) {
      throw new UnauthorizedError('Email already registered');
    }
    const id = `user_${crypto.getRandomValues(new Uint8Array(8)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '')}`;
    const passwordHash = await createPasswordHash(password);
    const user: AuthUser = {
      id,
      email,
      passwordHash,
      isAnonymous: false,
      ugroups: [],
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    await createUser(pg, user);
    const token = await createSession(id, config, {
      isAnonymous: false,
      ugroups: [],
    });
    return HttpResp.created({ token, owner: id });
  }

  if (req.method === 'POST' && route === 'login') {
    const lookup = (email: string) => getUserByEmail(pg, email);
    const provider = new PasswordProvider(lookup);
    const { owner, user } = await provider.authenticate(req.body ?? {});
    const token = await createSession(owner, config, {
      isAnonymous: false,
      ugroups: user.ugroups ?? [],
    });
    return HttpResp.ok({ token, owner });
  }

  if (req.method === 'POST' && route === 'link') {
    const bearer = extractBearer(req.headers);
    if (!bearer) throw new UnauthorizedError('Authentication required');
    const session = await verifySession(bearer, config);
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      throw new UnauthorizedError('Email and password required');
    }
    const passwordHash = await createPasswordHash(password);
    const updated = await linkAccount(pg, session.owner, email, passwordHash);
    const token = await createSession(session.owner, config, {
      isAnonymous: false,
      ugroups: updated.ugroups,
    });
    return HttpResp.ok({ token, owner: session.owner });
  }

  if (req.method === 'POST' && route === 'refresh') {
    const bearer = extractBearer(req.headers);
    if (!bearer) throw new UnauthorizedError('Authentication required');
    const token = await refreshSession(bearer, config);
    return HttpResp.ok({ token });
  }

  if (req.method === 'POST' && route === 'logout') {
    return HttpResp.noContent();
  }

  if (req.method === 'GET' && route === 'me') {
    const bearer = extractBearer(req.headers);
    if (!bearer) throw new UnauthorizedError('Authentication required');
    const session = await verifySession(bearer, config);
    const user = await getUser(pg, session.owner);
    if (!user) throw new UnauthorizedError('User not found');
    const { passwordHash, ...safeUser } = user;
    void passwordHash;
    return HttpResp.ok(safeUser);
  }

  return new HttpResp({ error: 'Unknown auth route' }, 404);
}
