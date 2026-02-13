# Deployment

## Overview

Kontract apps run on Cloudflare Workers. The deployment unit is a single Worker script containing the gateway, middleware chain, and compiled backend routes.

```
wrangler.toml          ← Worker configuration
src/gateway.ts         ← fetch() entry point
dist/server/routes.js  ← compiled @backend handlers
```

## wrangler.toml

Minimal configuration:

```toml
name = "my-kontract-app"
main = "src/gateway.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

# Durable Object for MVCC session coordination
[durable_objects]
bindings = [
  { name = "SESSION_DO", class_name = "KontractSessionDO" },
]

[[migrations]]
tag = "v1"
new_classes = ["KontractSessionDO"]
```

## Gateway URL

Configure your production domain via routes:

```toml
[env.production]
name = "my-kontract-app"
routes = [
  { pattern = "api.example.com/*", zone_name = "example.com" }
]
```

Clients then call `https://api.example.com/rpc/<fn>` for RPC and `https://api.example.com/stream` for SSE.

If you don't own a domain, Workers provides a default URL at `https://my-kontract-app.<subdomain>.workers.dev`.

## Secrets

Set secrets via wrangler CLI (never commit these):

```bash
# PostgreSQL connection string
wrangler secret put DATABASE_URL

# 32-byte hex key for raystream E2E encryption
wrangler secret put KONTRACT_SECRET
```

| Secret | Required | Description |
|--------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (`postgresql://user:pass@host:5432/db`) |
| `KONTRACT_SECRET` | Yes | Hex-encoded 32-byte key for ChaCha20-Poly1305 encryption |

## Database Setup

Kontract requires two system tables plus your data tables:

```sql
-- System tables (required)
CREATE TABLE storage (
  id          TEXT PRIMARY KEY,
  ptr         TEXT NOT NULL,
  owner       TEXT NOT NULL,
  permissions INT  NOT NULL DEFAULT 7
);

CREATE TABLE trxs (
  sid         TEXT    PRIMARY KEY,
  owner       TEXT    NOT NULL,
  create_txid BIGINT  NOT NULL
);

-- Data tables follow the pattern:
CREATE TABLE tbl_<name>_<hash> (
  id            TEXT PRIMARY KEY,
  data          JSONB NOT NULL DEFAULT '{}',
  _txid         BIGINT NOT NULL,
  _deleted_txid BIGINT,
  _owner        TEXT NOT NULL,
  _order        SERIAL
);
```

Register table pointers:

```sql
INSERT INTO storage (id, ptr, owner, permissions)
VALUES ('users', 'tbl_users_abc123', 'tenant-1', 7);
```

Recommended PostgreSQL providers:
- [Neon](https://neon.tech) — serverless PostgreSQL, free tier
- [Supabase](https://supabase.com) — PostgreSQL with dashboard
- [Railway](https://railway.app) — simple deployment

## Deploy Commands

```bash
# Local development
wrangler dev

# Deploy to production
wrangler deploy --env production

# View logs
wrangler tail --env production
```

## Environment-Specific Config

```toml
# Development (local)
[env.development]
name = "my-app-dev"

# Staging
[env.staging]
name = "my-app-staging"

# Production
[env.production]
name = "my-app"
routes = [
  { pattern = "api.example.com/*", zone_name = "example.com" }
]
```

## CI/CD

Example GitHub Actions workflow:

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          command: deploy --env production
```
