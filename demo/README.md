# Kontract Demo — Task API

A minimal Cloudflare Workers app built with the Kontract framework, demonstrating the gateway pattern, middleware chain, RPC dispatch, and SSE streaming.

## Structure

```
demo/
├── src/
│   ├── gateway.ts      Worker entry point (fetch handler)
│   ├── routes.ts       @backend route definitions (compiler output)
│   ├── middleware.ts    Middleware with filters
│   └── session-do.ts   Durable Object for MVCC sessions
├── sql/
│   ├── init.sql        Database schema (storage + trxs + data table)
│   └── seed.sql        Register table pointer
├── wrangler.toml       Cloudflare Workers configuration
├── package.json
└── tsconfig.json
```

## Setup

### 1. Install

```bash
cd demo
npm install
```

### 2. Database

```bash
# Set your PostgreSQL connection string
export DATABASE_URL="postgresql://user:pass@host:5432/kontract"

# Create tables
npm run db:init

# Seed pointer mappings
npm run db:seed
```

### 3. Secrets

```bash
# PostgreSQL connection
wrangler secret put DATABASE_URL

# 32-byte hex key for raystream encryption
wrangler secret put KONTRACT_SECRET
```

### 4. Local dev

```bash
npm run dev
# → http://localhost:8787
```

### 5. Deploy

```bash
npm run deploy
# or with environment:
wrangler deploy --env production
```

## API

All RPC calls go through `POST /rpc/<functionName>` with a JSON array body.

```bash
# Create a task
curl -X POST http://localhost:8787/rpc/createTask \
  -H 'Content-Type: application/json' \
  -d '["Write README"]'

# List tasks
curl http://localhost:8787/rpc/listTasks

# Toggle done
curl -X POST http://localhost:8787/rpc/toggleTask \
  -H 'Content-Type: application/json' \
  -d '["<task-id>"]'

# Delete (requires admin perm)
curl -X POST http://localhost:8787/rpc/deleteTask \
  -H 'Content-Type: application/json' \
  -d '["<task-id>"]'

# SSE stream
curl -N http://localhost:8787/stream
```

## Gateway URL Configuration

When deploying to production, configure your gateway URL in `wrangler.toml`:

```toml
[env.production]
routes = [
  { pattern = "api.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

Clients connect to `https://api.yourdomain.com/rpc/<fn>` for RPC calls and `https://api.yourdomain.com/stream` for SSE events.

## How It Works

1. **Client** sends `POST /rpc/createTask` with `["Buy milk"]`
2. **Gateway** (`gateway.ts`) looks up the route in the registry
3. **Middleware** chain runs: logger → rate limiter → (admin guard if egroup matches)
4. **Handler** executes the backend function with injected context
5. **Response** is returned as JSON (or encrypted via raystream in production)
