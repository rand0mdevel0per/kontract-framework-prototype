import type { Middleware } from '../middleware/inline';
import type { AuthConfig, AuthSession } from './types';
import type { Context } from '../storage/TableProxy';
import { verifyJwt } from './jwt';
import { UnauthorizedError, ForbiddenError } from '../runtime/http';

interface MutableContext extends Context {
  isAnonymous?: boolean;
  ugroups?: string[];
}

export function authMiddleware(config: AuthConfig): Middleware {
  return {
    fn: async (ctx: unknown, next: () => Promise<void>) => {
      const c = ctx as MutableContext;
      const authHeader = c.headers?.['authorization'] ?? c.headers?.['Authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        if (config.allowAnonymous) {
          c.owner = c.owner || `anon_${Date.now()}`;
          c.isAnonymous = true;
          c.ugroups = [];
          return next();
        }
        throw new UnauthorizedError('Missing authentication token');
      }
      const token = authHeader.slice(7);
      let session: AuthSession;
      try {
        session = await verifyJwt(token, config.secret);
      } catch {
        throw new UnauthorizedError('Invalid or expired token');
      }
      c.sid = session.sid;
      c.owner = session.owner;
      c.isAnonymous = session.isAnonymous;
      c.ugroups = session.ugroups;
      return next();
    },
  };
}

export function requireAuth(): Middleware {
  return {
    fn: async (ctx: unknown, next: () => Promise<void>) => {
      const c = ctx as MutableContext;
      if (c.isAnonymous) {
        throw new UnauthorizedError('Authentication required');
      }
      return next();
    },
  };
}

export function requireGroup(ugroup: string): Middleware {
  return {
    fn: async (ctx: unknown, next: () => Promise<void>) => {
      const c = ctx as MutableContext;
      if (!c.ugroups?.includes(ugroup)) {
        throw new ForbiddenError(`User group '${ugroup}' required`);
      }
      return next();
    },
  };
}
