# Features

## Minimal Database Privileges

Kontract requires access to only two tables:
- `storage` - maps logical table names to physical pointers
- `trxs` - tracks active transactions for MVCC

All data tables are accessed indirectly through ptr resolution. This means Kontract works in shared database environments where you don't have full admin access.

## Storage Proxy + MVCC

`TableProxy` provides transparent access to PostgreSQL through JavaScript object notation:

```ts
const proxy = new TableProxy(pg, 'users', ctx);

const user = await proxy.get('user-1');      // MVCC-filtered read
await proxy.set('user-1', { name: 'Alice' }); // Versioned write
await proxy.delete('user-1');                  // Logical delete
```

MVCC visibility rules are applied automatically:
- Reads only return rows with `_txid < currentTxid`
- Deleted rows are filtered by `_deleted_txid`
- No explicit transaction management needed

## @backend RPC

Mark functions with `@backend` to run them server-side:

```ts
@backend({ egroup: 'api-v1', perm: perms.RW_ })
async function createUser(name: string, email: string) {
  const id = crypto.randomUUID();
  await env.storage.users.set(id, { name, email });
  return { id, name, email };
}
```

The compiler generates:
- **Client**: typed RPC stub that calls `__kontract_rpc`
- **Server**: route registration with permission metadata

## Middleware Filtering

Middleware executes based on filter criteria:

```ts
const middleware = [
  // Applies to all API routes
  { fn: rateLimiter, filter: { prefixurl: '/api' } },

  // Applies only to admin endpoints
  { fn: adminGuard, filter: { egroup: 'admin' } },

  // Applies to specific functions
  { fn: auditLog, filter: { endpoints: ['deleteUser', 'resetPassword'] } },

  // Applies to everything (no filter)
  { fn: requestLogger }
];
```

## End-to-End Encryption (raystream)

All communication between client and gateway is encrypted using:
- **Key exchange**: ECDH with X25519
- **Encryption**: ChaCha20-Poly1305 AEAD (AES-256-GCM fallback)
- **Key derivation**: HKDF with session-specific info

Properties: confidentiality, integrity, perfect forward secrecy, replay protection.

## SSE Events

Subscribe to real-time changes:

```ts
const bus = new EventBus();

bus.subscribe('users', (event) => {
  switch (event.type) {
    case 'insert': console.log('New user:', event.data); break;
    case 'update': console.log('Updated:', event.id); break;
    case 'delete': console.log('Deleted:', event.id); break;
  }
});
```

## Permission System

3-bit permission mask (RWX):

| Bits | Constant | Access |
|------|----------|--------|
| `0b100` | `perms.R__` | Read only |
| `0b010` | `perms._W_` | Write only |
| `0b001` | `perms.__X` | Execute/Delete only |
| `0b110` | `perms.RW_` | Read + Write |
| `0b111` | `perms.RWX` | Full access |

Field-level permissions via `@perm` decorator:

```ts
interface User {
  @primkey id: string;
  @perm(perms.R__) email: string;  // Cannot be written
  name: string;                     // Read-write by default
}
```

## Authentication

Built-in auth system with an anonymous-first pattern:

```ts
import { AuthConfig, AnonymousProvider, PasswordProvider } from 'kontract';

const authConfig: AuthConfig = {
  secret: env.KONTRACT_SECRET,
  sessionTtlSeconds: 3600,
  allowAnonymous: true,
  providers: [new AnonymousProvider(), new PasswordProvider(lookupByEmail)],
};
```

- **Anonymous login**: instant session, no credentials required
- **Password login**: email + PBKDF2-hashed password
- **Account linking**: upgrade anonymous sessions to authenticated accounts
- **JWT sessions**: HMAC-SHA256 via Web Crypto API (zero dependencies)
- **Group-based access**: `ugroups` enforced by `@backend(ugroup=...)` and middleware
- **Auth middleware**: `authMiddleware`, `requireAuth`, `requireGroup`

See the [Authentication guide](/guide/authentication) for endpoints and configuration.

## API Documentation (Cookbook)

Auto-generate API documentation from doc comments:

```ts
/// Creates a new user account.
/// Supports **markdown** formatting.
@backend({ ugroup: 'admin', perm: perms.RWX, egroup: 'api-v1' })
async function createUser(name: string, email: string): Promise<User> { ... }
```

The cookbook compiler:
1. Extracts `///` (Rust-style) and `/** */` (JSDoc) doc comments
2. Infers parameter types and return types from function signatures
3. Generates VitePress-compatible markdown pages

See the [Cookbook guide](/guide/cookbook) for syntax and usage.

## Lazy Route Loading

Defers module imports until a route is first called — reduces cold-start latency in serverless environments:

```ts
import { generateLazyRoutes, LazyRouteEntry } from 'kontract';

const entries: LazyRouteEntry[] = [
  { name: 'createUser', modulePath: './api/users.js', meta: { egroup: 'api-v1' } },
];

const code = generateLazyRoutes(entries);
```

The generated code uses dynamic `import()` with caching: the first call loads the module, subsequent calls use the cached handler.

See the [Lazy Loading guide](/guide/lazy-loading) for details.

## Automatic Migrations

Safe schema changes are handled automatically:
- Adding new fields
- Adding new tables
- Adding indexes
- Changing field permissions

Dangerous changes (field removal, type change, rename) require a manual migration file.
