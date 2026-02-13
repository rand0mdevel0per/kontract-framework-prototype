# Kontract — one-command project init (Windows PowerShell)
# Usage: irm https://raw.githubusercontent.com/rand0mdevel0per/kontract/main/init.ps1 | iex
#   or:  .\init.ps1 -Name my-kontract-app

param(
  [string]$Name = "my-kontract-app"
)

$ErrorActionPreference = "Stop"

Write-Host "Creating Kontract project: $Name"
New-Item -ItemType Directory -Force -Path "$Name/src", "$Name/sql" | Out-Null

# ── package.json ─────────────────────────────────────────
@"
{
  "name": "$Name",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "db:init": "psql `$env:DATABASE_URL -f sql/init.sql",
    "db:seed": "psql `$env:DATABASE_URL -f sql/seed.sql"
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
"@ | Set-Content "$Name/package.json" -Encoding UTF8

# ── wrangler.toml ────────────────────────────────────────
@"
name = "$Name"
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
name = "$Name"
# routes = [
#   { pattern = "api.example.com/*", zone_name = "example.com" }
# ]
"@ | Set-Content "$Name/wrangler.toml" -Encoding UTF8

# ── tsconfig.json ────────────────────────────────────────
@'
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
'@ | Set-Content "$Name/tsconfig.json" -Encoding UTF8

# ── SQL init ─────────────────────────────────────────────
@'
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
'@ | Set-Content "$Name/sql/init.sql" -Encoding UTF8

# ── Gateway entry point ──────────────────────────────────
@'
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
'@ | Set-Content "$Name/src/gateway.ts" -Encoding UTF8

# ── Install ──────────────────────────────────────────────
Push-Location $Name
npm install
Pop-Location

Write-Host ""
Write-Host "Done! Next steps:"
Write-Host "  cd $Name"
Write-Host "  wrangler secret put DATABASE_URL"
Write-Host "  wrangler secret put KONTRACT_SECRET"
Write-Host "  npm run dev"
