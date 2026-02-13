import { describe, it, expect } from 'vitest';
import { filterApplicable, inlineMiddlewareChain, Middleware } from '../src/middleware/inline';

describe('middleware inline', () => {
  it('filters by prefix and egroup', async () => {
    const mw: Middleware[] = [
      { fn: async () => {}, filter: { prefixurl: '/api' } },
      { fn: async () => {}, filter: { egroup: 'v1' } },
      { fn: async () => {} }
    ];
    const f = filterApplicable(mw, '/api/users', 'v1', 'getUser');
    expect(f.length).toBe(3);
  });

  it('inlines chain and enforces next()', async () => {
    const order: number[] = [];
    const mw: Middleware[] = [
      { fn: async (_ctx, next) => { order.push(1); await next(); order.push(4); } },
      { fn: async (_ctx, next) => { order.push(2); await next(); order.push(3); } }
    ];
    const run = inlineMiddlewareChain(mw);
    await run({}, async () => { order.push(5); });
    expect(order).toEqual([1,2,5,3,4]);
  });

  it('filters out non-matching prefix', () => {
    const mw: Middleware[] = [
      { fn: async () => {}, filter: { prefixurl: '/admin' } },
      { fn: async () => {}, filter: { egroup: 'v1' } },
    ];
    const f = filterApplicable(mw, '/api/users', 'v1', 'getUser');
    expect(f.length).toBe(1);
  });

  it('filters by endpoints list', () => {
    const mw: Middleware[] = [
      { fn: async () => {}, filter: { endpoints: ['getUser'] } },
      { fn: async () => {}, filter: { endpoints: ['other'] } },
    ];
    const f = filterApplicable(mw, '/api/users', 'v1', 'getUser');
    expect(f.length).toBe(1);
  });

  it('excludes endpoint-filtered middleware when no endpoint provided', () => {
    const mw: Middleware[] = [
      { fn: async () => {}, filter: { endpoints: ['getUser'] } },
      { fn: async () => {} },
    ];
    const f = filterApplicable(mw, '/api/users', 'v1');
    expect(f.length).toBe(1);
    expect(f[0].filter).toBeUndefined();
  });
});
