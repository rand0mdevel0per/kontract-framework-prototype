# Lazy Route Loading

Lazy loading defers the import of backend route handlers until they are first invoked. This reduces cold-start time in serverless environments where only a fraction of routes are called per request.

## Problem

By default, the `@backend` compiler registers all route handlers eagerly at startup:

```typescript
// All handlers loaded immediately — even if only one is called
__kontract_routes.set('createUser', handler1);
__kontract_routes.set('getUser', handler2);
__kontract_routes.set('deleteUser', handler3);
__kontract_routes.set('listUsers', handler4);
// ... hundreds more
```

On Cloudflare Workers, every cold start pays the cost of loading and parsing all handler modules. For applications with many routes, this adds meaningful latency.

## Solution

`generateLazyRoutes` produces code that defers `import()` calls until a route is first resolved:

```typescript
import { generateLazyRoutes, LazyRouteEntry } from 'kontract';

const entries: LazyRouteEntry[] = [
  { name: 'createUser', modulePath: './api/users.js', meta: { egroup: 'api-v1' } },
  { name: 'getUser', modulePath: './api/users.js', meta: { egroup: 'api-v1' } },
  { name: 'listPosts', modulePath: './api/posts.js', meta: { egroup: 'api-v1' } },
];

const code = generateLazyRoutes(entries);
```

### Generated Code

```typescript
const __kontract_routes = new Map();
const __kontract_loaders = new Map();

__kontract_loaders.set('createUser', () => import('./api/users.js').then(m => m.createUser));
__kontract_loaders.set('getUser', () => import('./api/users.js').then(m => m.getUser));
__kontract_loaders.set('listPosts', () => import('./api/posts.js').then(m => m.listPosts));

async function __kontract_resolve(name) {
  if (__kontract_routes.has(name)) return __kontract_routes.get(name);
  const loader = __kontract_loaders.get(name);
  if (!loader) return undefined;
  const handler = await loader();
  __kontract_routes.set(name, handler);
  return handler;
}
```

### How It Works

1. At startup, only the loader map is created — no actual modules are imported
2. When a route is first called, `__kontract_resolve` triggers the dynamic `import()`
3. The resolved handler is cached in `__kontract_routes`
4. Subsequent calls to the same route skip the import and use the cache

### Gateway Integration

The gateway calls `__kontract_resolve` instead of `__kontract_routes.get`:

```typescript
// Before (eager)
const handler = __kontract_routes.get(fnName);

// After (lazy)
const handler = await __kontract_resolve(fnName);
```

## LazyRouteEntry

```typescript
interface LazyRouteEntry {
  name: string;                    // function name (route key)
  modulePath: string;              // relative path to the source module
  meta: Record<string, unknown>;   // @backend decorator metadata
}
```

## When to Use

**Use lazy loading when:**
- The application has many routes (50+)
- Most requests only invoke 1-2 routes
- Cold-start latency is a concern

**Use eager loading when:**
- The application has few routes
- Most routes are called on every request
- Module loading overhead is negligible
