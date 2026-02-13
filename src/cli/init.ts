import { mkdirSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

export interface InitOptions {
  name: string;
  cwd?: string;
  hyperdrive?: boolean;
  skipInstall?: boolean;
}

export interface InitFile {
  path: string;
  content: string;
}

export function generateProjectFiles(name: string, hyperdrive: boolean): InitFile[] {
  const files: InitFile[] = [];

  files.push({
    path: 'package.json',
    content: JSON.stringify({
      name,
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'wrangler dev',
        deploy: 'kontract deploy',
        'db:init': 'psql $DATABASE_URL -f sql/init.sql',
      },
      dependencies: {
        kontract: 'npm:@rand0mdevel0per/kontract@^0.1.0',
      },
      devDependencies: {
        '@cloudflare/workers-types': '^4.20241230.0',
        typescript: '^5.7.0',
        wrangler: '^3.100.0',
      },
    }, null, 2) + '\n',
  });

  const hyperdriveBinding = hyperdrive
    ? `\n# ── Hyperdrive (PostgreSQL accelerator) ─────────────────\n# Run: kontract deploy --hyperdrive --database-url="postgres://..."\n# to auto-configure, or set manually:\n# [[hyperdrive]]\n# binding = "HYPERDRIVE"\n# id = "<your-hyperdrive-id>"\n`
    : '';

  files.push({
    path: 'wrangler.toml',
    content: `name = "${name}"
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
name = "${name}"
${hyperdriveBinding}`,
  });

  files.push({
    path: 'tsconfig.json',
    content: JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ES2022',
        moduleResolution: 'bundler',
        lib: ['ES2022'],
        types: ['@cloudflare/workers-types'],
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        experimentalDecorators: true,
      },
      include: ['src'],
    }, null, 2) + '\n',
  });

  files.push({
    path: 'sql/init.sql',
    content: `CREATE TABLE IF NOT EXISTS storage (
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
`,
  });

  const envFields = [
    '  DATABASE_URL: string;',
    '  KONTRACT_SECRET: string;',
    '  SESSION_DO: DurableObjectNamespace;',
  ];
  if (hyperdrive) {
    envFields.push('  HYPERDRIVE: Hyperdrive;');
  }

  files.push({
    path: 'src/gateway.ts',
    content: `import { HttpResp } from 'kontract';
import type { AuthConfig } from 'kontract';

export interface Env {
${envFields.join('\n')}
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
    return HttpResp.ok({ status: 'Kontract gateway running' }).toResponse();
  },
};
`,
  });

  return files;
}

export function scaffoldProject(options: InitOptions): string[] {
  const cwd = resolve(options.cwd ?? '.');
  const root = join(cwd, options.name);
  const files = generateProjectFiles(options.name, options.hyperdrive ?? false);
  const created: string[] = [];

  for (const file of files) {
    const fullPath = join(root, file.path);
    const dir = resolve(fullPath, '..');
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, file.content, 'utf-8');
    created.push(file.path);
  }

  return created;
}
