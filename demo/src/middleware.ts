// Kontract Demo — Middleware definitions
//
// Middleware functions are filtered by prefixurl, egroup, or endpoints.
// In a real project the compiler inlines these at build time.

import { HttpError, perms } from 'kontract';
import type { Middleware } from 'kontract';

export const middleware: Middleware[] = [
  // ── Request logger (applies to everything) ──────────
  {
    fn: async (_ctx, next) => {
      const start = Date.now();
      await next();
      console.log(`[${Date.now() - start}ms] request completed`);
    },
    // no filter → applies to all
  },

  // ── Rate limiter (applies to /rpc/ prefix) ──────────
  {
    fn: async (ctx, next) => {
      // Simplified in-memory rate limiter
      const key = `rate:${(ctx as { owner: string }).owner}`;
      const now = Date.now();
      if (!rateBuckets.has(key)) rateBuckets.set(key, []);
      const bucket = rateBuckets.get(key)!;
      // Sliding window: keep requests from last 60s
      while (bucket.length > 0 && bucket[0] < now - 60_000) bucket.shift();
      if (bucket.length >= 100) {
        throw new HttpError('Rate limit exceeded', 429, 'RATE_LIMITED');
      }
      bucket.push(now);
      await next();
    },
    filter: { prefixurl: '/rpc' },
  },

  // ── Admin guard (applies to admin egroup) ───────────
  {
    fn: async (ctx, next) => {
      const perm = (ctx as { perm: number }).perm;
      if ((perm & perms.RWX) !== perms.RWX) {
        throw new HttpError('Admin access required', 403, 'FORBIDDEN');
      }
      await next();
    },
    filter: { egroup: 'admin' },
  },
];

const rateBuckets = new Map<string, number[]>();
