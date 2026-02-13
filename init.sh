#!/usr/bin/env bash
# Kontract — one-command project init (Linux/macOS)
# Usage: curl -fsSL https://raw.githubusercontent.com/rand0mdevel0per/kontract/main/init.sh | bash
#   or:  bash init.sh <project-name>

set -euo pipefail

NAME="${1:-my-kontract-app}"

echo "Creating Kontract project: $NAME"
mkdir -p "$NAME/src" "$NAME/sql"

# ── package.json ─────────────────────────────────────────
cat > "$NAME/package.json" <<'PKGJSON'
{
  "name": "PLACEHOLDER",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "db:init": "psql $DATABASE_URL -f sql/init.sql",
    "db:seed": "psql $DATABASE_URL -f sql/seed.sql"
  },
  "dependencies": {
    "kontract": "^0.1.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20241230.0",
    "typescript": "^5.7.0",
    "wrangler": "^3.100.0"
  }
}
PKGJSON
sed -i "s/PLACEHOLDER/$NAME/" "$NAME/package.json"

# ── wrangler.toml ────────────────────────────────────────
cat > "$NAME/wrangler.toml" <<TOML
name = "$NAME"
main = "src/gateway.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[durable_objects]
bindings = [
  { name = "SESSION_DO", class_name = "KontractSessionDO" },
]

[[migrations]]
tag = "v1"
new_classes = ["KontractSessionDO"]

# Set secrets via:
#   wrangler secret put DATABASE_URL
#   wrangler secret put KONTRACT_SECRET

[env.production]
name = "$NAME"
# routes = [
#   { pattern = "api.example.com/*", zone_name = "example.com" }
# ]
TOML

# ── tsconfig.json ────────────────────────────────────────
cat > "$NAME/tsconfig.json" <<'TSC'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "experimentalDecorators": true
  },
  "include": ["src"]
}
TSC

# ── SQL init ─────────────────────────────────────────────
cat > "$NAME/sql/init.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS storage (
  id          TEXT PRIMARY KEY,
  ptr         TEXT NOT NULL,
  owner       TEXT NOT NULL,
  permissions INT  NOT NULL DEFAULT 7
);

CREATE TABLE IF NOT EXISTS trxs (
  sid         TEXT    PRIMARY KEY,
  owner       TEXT    NOT NULL,
  create_txid BIGINT  NOT NULL
);
SQL

# ── Gateway entry point ──────────────────────────────────
cat > "$NAME/src/gateway.ts" <<'TS'
import { HttpResp, HttpError, NotFoundError, formatSSE } from 'kontract';
import type { Context } from 'kontract';

export interface Env {
  DATABASE_URL: string;
  KONTRACT_SECRET: string;
  SESSION_DO: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // Add your @backend routes here
    return new Response(JSON.stringify({ status: 'Kontract gateway running' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
TS

# ── Install ──────────────────────────────────────────────
cd "$NAME"
npm install

echo ""
echo "Done! Next steps:"
echo "  cd $NAME"
echo "  wrangler secret put DATABASE_URL"
echo "  wrangler secret put KONTRACT_SECRET"
echo "  npm run dev"
