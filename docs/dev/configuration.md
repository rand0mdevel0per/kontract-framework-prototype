# Configuration

Konstract focuses on explicit build scripts and minimal runtime assumptions. Configuration is primarily defined through code and package scripts.

## Runtime Context Model

The runtime expects a context object that carries session and permission details used by Storage Proxy and MVCC rules.

Expected fields:

- sid: session identifier
- owner: tenant or account identifier
- currentTxid: current transaction id
- perm: permission bitmask

Example:

```ts
const ctx = {
  sid: 'session-1',
  owner: 'tenant-1',
  currentTxid: 10n,
  perm: 0b111
};
```

## Storage Table Requirements

The Storage Proxy resolves physical table names via a storage registry table. At runtime, these are expected:

- storage table contains ptr records (logical table name + owner → ptr)
- transactions table stores tx metadata for MVCC checks

Minimum fields used by the runtime:

- storage.ptr
- transactions.txid

## Permissions

Permissions use a bitmask to guard storage operations. A typical pattern is:

- 0b001: read
- 0b010: write
- 0b100: admin

Use perm in the session context and @backend meta to align authorization.

## Environment Matrix

| Environment | Node.js | npm | Database | Notes |
| --- | --- | --- | --- | --- |
| Local development | 20+ | 9+ | PostgreSQL compatible | Use docs:dev for preview |
| CI | 20+ | 9+ | PostgreSQL compatible | Lint, typecheck, test with coverage |
| Cloudflare Pages | 20+ | 9+ | Not required | Build only, no runtime DB |
| Production runtime | 20+ | 9+ | PostgreSQL compatible | Ensure storage/transactions tables exist |

## Configuration Checklist

- ctx includes sid, owner, currentTxid, perm
- storage registry is populated for each logical table
- transactions table exists and records txid
- permissions align between session and @backend meta

## Scripts

| Script | Purpose |
| --- | --- |
| npm run lint | ESLint checks for TypeScript source |
| npm run typecheck | TypeScript type checks |
| npm run test | Vitest with coverage |
| npm run docs:dev | VitePress dev server |
| npm run docs:build | Build docs site |
| npm run docs:preview | Preview built docs |

## VitePress

The docs site is configured in docs/.vitepress/config.ts and built into docs/.vitepress/dist.

Cloudflare Pages settings:

- Build command: npm run docs:build
- Output directory: docs/.vitepress/dist

Wrangler CLI deploy:

```bash
npm run docs:build
npx wrangler pages deploy docs/.vitepress/dist --project-name konstract
```
