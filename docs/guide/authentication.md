# Authentication

Kontract provides a built-in authentication system inspired by Convex Auth and Supabase Auth. It follows an **anonymous-first** pattern: users start with an anonymous session and can later upgrade to a full account.

## Overview

- **Anonymous login**: instant session with no credentials, identified by `anon_<hex>` owner
- **Password login**: email + PBKDF2-hashed password
- **Account linking**: upgrade anonymous sessions to authenticated accounts
- **JWT sessions**: HMAC-SHA256 tokens via Web Crypto API (zero external dependencies)
- **Group-based access**: `ugroups` array on each user, enforced by `@backend(ugroup=...)` and middleware

## Setup

Configure auth in your gateway:

```typescript
import { AuthConfig, AnonymousProvider, PasswordProvider } from 'kontract';

const authConfig: AuthConfig = {
  secret: env.KONTRACT_SECRET,    // JWT signing key
  sessionTtlSeconds: 3600,        // 1 hour
  allowAnonymous: true,
  providers: [
    new AnonymousProvider(),
    new PasswordProvider((email) => getUserByEmail(pg, email)),
  ],
};
```

### Database

Auth users are stored via Kontract's standard ptr indirection. Register the users table:

```sql
CREATE TABLE IF NOT EXISTS tbl_users_kontract (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  _txid BIGINT NOT NULL DEFAULT 0,
  _deleted_txid BIGINT,
  _owner TEXT NOT NULL,
  _order SERIAL
);

INSERT INTO storage (id, ptr, owner, permissions)
VALUES ('__users', 'tbl_users_kontract', '__system', 7);
```

## Auth Endpoints

The auth router provides 7 routes:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/anonymous` | Create anonymous session |
| `POST` | `/auth/register` | Register with email + password |
| `POST` | `/auth/login` | Login with email + password |
| `POST` | `/auth/link` | Link anonymous account to email + password |
| `POST` | `/auth/refresh` | Refresh JWT token |
| `POST` | `/auth/logout` | End session |
| `GET` | `/auth/me` | Get current user info |

### Anonymous Login

```bash
curl -X POST https://api.example.com/auth/anonymous
```

Response:
```json
{ "token": "eyJ...", "owner": "anon_a1b2c3d4e5f6" }
```

### Register

```bash
curl -X POST https://api.example.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "secret123"}'
```

### Login

```bash
curl -X POST https://api.example.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "secret123"}'
```

### Account Linking

Upgrade an anonymous session to a password account while preserving the same owner ID:

```bash
curl -X POST https://api.example.com/auth/link \
  -H "Authorization: Bearer <anonymous-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "secret123"}'
```

The user's data, permissions, and owner references remain intact.

### Get Current User

```bash
curl https://api.example.com/auth/me \
  -H "Authorization: Bearer <jwt>"
```

Returns user info (excluding `passwordHash`).

## Middleware

Three middleware functions integrate auth into the gateway pipeline:

### authMiddleware

Extracts the Bearer token from the `Authorization` header, verifies the JWT, and populates `ctx` fields:

```typescript
import { authMiddleware } from 'kontract';

const mw = authMiddleware(authConfig);
// After execution: ctx.owner, ctx.isAnonymous, ctx.ugroups are set
```

If `allowAnonymous` is true and no token is provided, the request proceeds as anonymous. Otherwise, a missing or invalid token returns 401.

### requireAuth

Rejects anonymous users with 401:

```typescript
import { requireAuth } from 'kontract';

const mw = requireAuth();
// Use as middleware — only authenticated users pass through
```

### requireGroup

Rejects users not in the specified group with 403:

```typescript
import { requireGroup } from 'kontract';

const mw = requireGroup('admin');
// Only users with 'admin' in their ugroups pass through
```

All three return standard `Middleware` objects compatible with `filterApplicable` and `inlineMiddlewareChain`.

## Context Injection

Auth middleware mutates the gateway `Context` in-place (per spec §7.1). Backend functions access auth info directly:

```typescript
@backend({ ugroup: 'admin', perm: perms.RW_ })
async function adminDashboard() {
  // ctx is injected — no explicit parameter
  console.log(ctx.owner);       // "user_abc123"
  console.log(ctx.isAnonymous); // false
  console.log(ctx.ugroups);     // ["admin"]
}
```

## Security Details

- **JWT**: HMAC-SHA256 via `crypto.subtle`, no external dependencies
- **Password hashing**: PBKDF2 with 100,000 iterations, random 16-byte salt
- **Token format**: standard 3-part JWT (`header.payload.signature`)
- **Session expiry**: configurable TTL, verified on every request

See [Security](/architecture/security) for the full threat model.
