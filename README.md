# Kontract

Kontract is a serverless full-stack TypeScript framework that enables end-to-end type-safe application development with minimal database privileges. It runs on Cloudflare Workers, requires access to only two PostgreSQL tables, and provides end-to-end encryption via the raystream protocol.

## Highlights

- **Storage Proxy + MVCC**: read/write with automatic visibility rules, minimal database access
- **@backend compiler**: extract decorator metadata, generate typed RPC stubs and server routes
- **Middleware**: prefix/egroup/endpoints filtering with next() chaining
- **raystream encryption**: ChaCha20-Poly1305 with AES-GCM fallback
- **SSE events**: standardized change event payloads with EventBus subscription
- **Migrations**: schema diff, safe auto-migration, manual migration support
- **Permission system**: 3-bit RWX mask at table and field level
- **HTTP types**: HttpResp, HttpError hierarchy, MessageType/ErrorCode enums

## Quick Start

Create a new Kontract project:

```bash
# Linux / macOS
bash <(curl -fsSL https://raw.githubusercontent.com/rand0mdevel0per/kontract/main/init.sh) my-app

# Windows PowerShell
irm https://raw.githubusercontent.com/rand0mdevel0per/kontract/main/init.ps1 | iex
```

Or manually:

```bash
cd my-app
npm install
wrangler secret put DATABASE_URL
wrangler secret put KONTRACT_SECRET
npm run dev      # http://localhost:8787
npm run deploy   # deploy to Cloudflare Workers
```

### Development (this repo)

```bash
npm install
npm run lint
npm run typecheck
npm run test
```

## Project Layout

```
src/
  runtime/     SessionDO, HttpResp, error classes
  storage/     TableProxy (Storage Proxy + MVCC)
  compiler/    @backend extraction, cache, StorageRegistry
  middleware/  filtering and inlining
  protocol/    raystream encryption, MessageType, ErrorCode
  events/      SSE formatting, EventBus
  security/    permission constants and verification
  cli/         migration helpers
demo/          example Cloudflare Workers app
test/          unit tests (58 tests, 96%+ coverage)
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
| `npm run docs:build` | Build docs site |

## License

MIT
