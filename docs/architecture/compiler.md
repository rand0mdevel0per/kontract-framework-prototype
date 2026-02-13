# Compiler

The compiler transforms a unified TypeScript codebase into separate client and server bundles, using `@backend` as the single decorator for marking server-side code.

## Build Pipeline

```
TypeScript Source
    ↓
ESLint Analysis (type extraction)
    ↓
Babel Transform (@backend extraction)
    ↓
Cookbook Extraction (doc comments + types → API docs)
    ↓
Middleware Inlining (next() replacement)
    ↓
Lazy Route Generation (optional: dynamic import() loaders)
    ↓
SWC Optimization (O3 passes)
    ↓
FlatBuffers Schema Generation
    ↓
Client Bundle + Server Bundle
```

## Decorator Specifications

### @backend

Marks a function for server-side execution:

```ts
@backend({ ugroup?: string, perm?: number, egroup?: string })
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `ugroup` | `string` | Required user group for access |
| `perm` | `number` | Permission bitmask (`R__`, `_W_`, `__X`, or combinations) |
| `egroup` | `string` | Endpoint group for middleware filtering |

Example:

```ts
@backend({ ugroup: 'admin', perm: 0b110, egroup: 'api-v1' })
async function deleteUser(id: string) {
  await env.storage.users.delete(id);
}
```

### @primkey

Marks a field as primary key in a storage table:

```ts
interface User {
  @primkey id: string;
  name: string;
}
```

If absent, the first field is used as primary key.

### @perm

Sets field-level permission restrictions:

```ts
interface User {
  @primkey id: string;
  @perm(perms.R__) email: string;  // read-only
  name: string;                     // read-write (default)
}
```

### @mwfilter

Applies filtering to middleware functions:

```ts
@mwfilter({ prefixurl?: string, egroup?: string, endpoints?: string[] })
```

- No parameters: applies to all requests
- `prefixurl`: matches URL prefix
- `egroup`: matches endpoint group
- `endpoints`: matches exact endpoint names

## Compilation Output

### Client Side

Backend functions are replaced with RPC stubs:

```ts
// Original
@backend({ egroup: 'api-v1' })
async function getUser(id: string): Promise<User | null> { ... }

// Generated client stub
export async function getUser(id: string): Promise<User | null> {
  return await __kontract_rpc('getUser', [id], { egroup: 'api-v1' });
}
```

### Server Side

Backend functions are registered in a route map:

```ts
__kontract_routes.set('getUser', {
  handler: async (ctx: Context, args: [string]) => {
    const [id] = args;
    return await env.storage.users.get(id);
  },
  meta: { egroup: 'api-v1', perm: 0b100 }
});
```

## Middleware Inlining

The compiler resolves applicable middleware at build time:

1. Load all middleware from `src/middleware.ts`
2. For each backend function, filter applicable middleware by `prefixurl`, `egroup`, `endpoints`
3. Replace `await next()` calls with the next middleware's code
4. Inline the result before the function body

Complexity: O(M x F) where M = middleware count, F = function count.

## Incremental Compilation

File-level hashing with SHA-256 enables selective recompilation:

```ts
buildCache(entries: FileEntry[], version?: string): CacheOutput

interface FileEntry {
  path: string;
  content: string;
  dependencies?: string[];
}
```

Only changed files and their dependents are recompiled.

## Cookbook Extraction

The cookbook compiler runs during the Babel transform phase, extracting documentation from `@backend` functions:

1. **Doc comments**: `///` (Rust-style triple-slash) and `/** */` (JSDoc) blocks above the function are parsed into markdown
2. **Parameter types**: extracted from function signatures (name, type, optional flag)
3. **Return type**: extracted from the return type annotation

Output is a `CookbookOutput` containing `CookbookEntry[]`, which can be converted to VitePress markdown pages via `cookbookToVitepress()`.

```ts
import { generateCookbook, cookbookToVitepress } from 'kontract';

const cookbook = generateCookbook(sources);
const pages = cookbookToVitepress(cookbook);
// pages.get('index.md')      → API index
// pages.get('createUser.md') → per-function page
```

See the [Cookbook guide](/guide/cookbook) for doc comment syntax and generated output structure.

## Lazy Route Loading

When `lazy` mode is enabled, the server bundle uses dynamic `import()` instead of eager route registration:

```ts
// Eager (default)
__kontract_routes.set('createUser', handler);

// Lazy
__kontract_loaders.set('createUser', () => import('./api/users.js').then(m => m.createUser));
```

The gateway calls `__kontract_resolve(fnName)` which triggers the import on first call and caches the handler for subsequent calls. This reduces cold-start latency in serverless environments with many routes.

```ts
import { generateLazyRoutes, LazyRouteEntry } from 'kontract';

const entries: LazyRouteEntry[] = [
  { name: 'createUser', modulePath: './api/users.js', meta: { egroup: 'api-v1' } },
];
const code = generateLazyRoutes(entries);
```

See the [Lazy Loading guide](/guide/lazy-loading) for when to use lazy vs eager loading.

## SWC Optimization (Phase 4)

After middleware inlining and lazy route generation, the compiled output passes through SWC for optimization. The spec defines "O3 passes" — 3 iterations of the following transforms:

| Pass | Description |
|------|-------------|
| Dead code elimination | Removes unreachable branches (`if (false) { ... }`) and unused variables |
| Constant folding | Evaluates compile-time expressions (`2 + 3` → `5`) |
| Function inlining | Inlines small functions at call sites (threshold: ~50 AST nodes) |
| Variable reduction | Collapses intermediate variables into their usage sites |
| Expression simplification | Merges and simplifies chained expressions |

```ts
import { optimize } from 'kontract';

const optimized = await optimize(serverBundle, {
  dce: true,
  constantFolding: true,
  inlineLevel: 2,
  reduceVars: true,
  simplify: true,
  passes: 3,        // O3
  mangle: false,     // keep names readable
});
```

Example from the spec — a permission check that is known at compile time:

```ts
// Before
const canWrite = ctx.perm & 0b010;  // Known to be 0b100 at compile-time
if (canWrite) {
  await deleteOperation();
}

// After SWC O3 (optimized out entirely, since 0b100 & 0b010 === 0)
```

`mangle: false` is the default so generated code stays debuggable. Enable `mangle: true` for production bundles when size matters.

Requires `@swc/core` as a dependency (`npm install -D @swc/core`).

## StorageRegistry Generation

The compiler uses the TypeScript Compiler API to extract interface definitions and generate typed storage access:

```ts
generateStorageRegistry(source: string): { dts: string; keys: string[] }
```

Generated output:

```ts
declare module 'kontract/runtime' {
  interface StorageRegistry {
    users: User;
    posts: Post;
  }
  interface Storage {
    get<K extends keyof StorageRegistry>(key: K): TableProxy<StorageRegistry[K]>;
  }
}
```
