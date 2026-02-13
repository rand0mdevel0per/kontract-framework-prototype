<p align="center">
  <strong>Kontract</strong><br>
  Serverless TypeScript framework with minimal database privileges
</p>

<p align="center">
  <a href="https://github.com/rand0mdevel0per/kontract/actions"><img src="https://github.com/rand0mdevel0per/kontract/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/rand0mdevel0per/kontract/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/tests-123%20passed-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/coverage-97%25-brightgreen" alt="Coverage">
</p>

---

Kontract is a full-stack TypeScript framework for Cloudflare Workers. It requires access to only **two PostgreSQL tables**, provides end-to-end encryption via the raystream protocol, and compiles a single codebase into typed client stubs and server routes with a single `@backend` decorator.

## Features

| | Feature | Description |
|---|---------|-------------|
| **Storage** | Storage Proxy + MVCC | Transparent PostgreSQL access with automatic transaction visibility. Two-table design (`storage` + `trxs`) — works in shared DB environments. |
| **Compiler** | `@backend` RPC | Single decorator marks server-side code. Compiler generates typed client stubs and server route maps. |
| **Auth** | Authentication & Sessions | Anonymous-first auth with password provider, JWT sessions (HMAC-SHA256), PBKDF2 hashing, account linking, and group-based access control. |
| **Cookbook** | API Doc Generation | Extracts `///` and `/** */` doc comments from backend functions. Auto-generates VitePress API documentation with inferred parameter and return types. |
| **Middleware** | Filtering & Inlining | Prefix, egroup, and endpoint-based middleware filtering with compile-time `next()` inlining. |
| **Security** | raystream + Permissions | ECDH key exchange, ChaCha20-Poly1305 AEAD encryption, 3-bit RWX permission model at table and field level. |

Additional capabilities: SSE event subscriptions, lazy route loading for cold-start optimization, automatic schema migrations, incremental compilation with file-level caching.

## Quick Start

Create a new project:

```bash
# Linux / macOS
bash <(curl -fsSL https://raw.githubusercontent.com/rand0mdevel0per/kontract/main/init.sh) my-app

# Windows PowerShell
irm https://raw.githubusercontent.com/rand0mdevel0per/kontract/main/init.ps1 | iex
```

Or set up manually:

```bash
cd my-app
npm install
wrangler secret put DATABASE_URL
wrangler secret put KONTRACT_SECRET
npm run dev        # local dev at http://localhost:8787
wrangler deploy    # deploy to Cloudflare Workers
```

## Example

Define a backend function:

```typescript
/// Creates a new user account.
/// Requires admin privileges.
@backend({ ugroup: 'admin', perm: perms.RWX, egroup: 'api-v1' })
async function createUser(name: string, email: string): Promise<User> {
  const id = crypto.randomUUID();
  await env.storage.users.set(id, { name, email });
  return { id, name, email };
}
```

The compiler generates a typed client stub — call it like a local function:

```typescript
import { createUser } from '@/client';
const user = await createUser('Alice', 'alice@example.com');
```

Doc comments (`///` or `/** */`) are extracted by the cookbook compiler into VitePress API pages with inferred types.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Frontend (Any Framework)                   │
│  ├─ import { api } from '@/client'         │
│  └─ WebSocket / SSE subscription           │
└──────────────┬──────────────────────────────┘
               │ raystream (E2E encrypted)
┌──────────────▼──────────────────────────────┐
│  Cloudflare Workers — Gateway               │
│  ├─ Auth middleware (JWT verification)      │
│  ├─ Middleware chain (compile-time inlined) │
│  ├─ Cookbook doc extraction                  │
│  ├─ Lazy route resolver                     │
│  ├─ DO Session (MVCC coordination)         │
│  └─ DO KVC (global shared state)           │
└──────────────┬──────────────────────────────┘
               │ PostgreSQL client
┌──────────────▼──────────────────────────────┐
│  PostgreSQL Database                         │
│  ├─ storage (id, ptr, owner, permissions)   │
│  ├─ trxs (sid, owner, create_txid)          │
│  └─ tbl_* (data tables via ptr indirection) │
└──────────────────────────────────────────────┘
```

## Project Layout

```
src/
  auth/        JWT, providers, sessions, user management, middleware, router
  compiler/    @backend extraction, cookbook doc generation, lazy route loading
  runtime/     SessionDO, HttpResp, error classes
  storage/     TableProxy (Storage Proxy + MVCC)
  middleware/  filtering and inlining
  protocol/    raystream encryption, MessageType, ErrorCode
  events/      SSE formatting, EventBus
  security/    permission constants and verification
  cli/         migration helpers
demo/          example Cloudflare Workers app
test/          unit tests (123 tests, 97%+ coverage)
docs/          VitePress documentation site
specs/         framework specification
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | TypeScript compilation |
| `npm run lint` | ESLint checks |
| `npm run typecheck` | Type verification |
| `npm run test` | Vitest with coverage thresholds |
| `npm run docs:dev` | VitePress dev server |
| `npm run docs:build` | Build documentation site |

## Documentation

Full documentation is available via VitePress:

- [Overview](docs/guide/overview.md) — architecture and design principles
- [Quickstart](docs/guide/quickstart.md) — first project setup
- [Authentication](docs/guide/authentication.md) — auth providers, JWT sessions, account linking
- [Cookbook](docs/guide/cookbook.md) — API doc generation from doc comments
- [Deployment](docs/guide/deployment.md) — Cloudflare Workers deployment
- [API Reference](docs/dev/api.md) — full API surface

## Contributing

```bash
git clone https://github.com/rand0mdevel0per/kontract.git
cd kontract
npm install
npm test
```

- One feature per branch (`feat/feature-name`)
- All tests must pass (`npm test`)
- Lint and typecheck clean (`npm run lint && npm run typecheck`)

## License

[MIT](LICENSE)
