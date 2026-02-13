#!/usr/bin/env node
import { deploy } from './deploy.js';
import { scaffoldProject } from './init.js';
import { createMigration } from './migrate.js';
import { execSync } from 'child_process';

const args = process.argv.slice(2);
const command = args[0];

function flag(name: string): boolean {
  return args.includes(`--${name}`);
}

function param(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  return undefined;
}

function printHelp(): void {
  console.log(`kontract — Serverless TypeScript framework CLI

Usage:
  kontract init <name> [--hyperdrive]     Create a new project
  kontract deploy [options]               Build and deploy to Cloudflare
  kontract migrate create <name>          Create a new migration file

Deploy options:
  --env <name>          Target environment (production, staging)
  --hyperdrive          Set up Cloudflare Hyperdrive for PostgreSQL
  --database-url <url>  PostgreSQL connection string (for Hyperdrive setup)
  --skip-checks         Skip pre-flight validation

General:
  --help                Show this help
  --version             Show version`);
}

async function main(): Promise<void> {
  if (flag('help') || !command) {
    printHelp();
    return;
  }

  if (flag('version')) {
    try {
      const pkg = await import('../../package.json', { with: { type: 'json' } });
      console.log(pkg.default.version);
    } catch {
      console.log('0.1.0');
    }
    return;
  }

  if (command === 'init') {
    const name = args[1];
    if (!name) {
      console.error('Usage: kontract init <project-name>');
      process.exit(1);
    }
    const created = scaffoldProject({
      name,
      hyperdrive: flag('hyperdrive'),
    });
    console.log(`Created ${name}/`);
    for (const f of created) {
      console.log(`  ${f}`);
    }
    if (!flag('skip-install')) {
      console.log('\nInstalling dependencies...');
      execSync('npm install', { cwd: name, stdio: 'inherit' });
    }
    console.log(`\nDone! Next steps:
  cd ${name}
  wrangler secret put DATABASE_URL
  wrangler secret put KONTRACT_SECRET
  npm run dev`);
    return;
  }

  if (command === 'deploy') {
    await deploy({
      env: param('env'),
      hyperdrive: flag('hyperdrive'),
      databaseUrl: param('database-url'),
      skipChecks: flag('skip-checks'),
    });
    return;
  }

  if (command === 'migrate') {
    const sub = args[1];
    if (sub === 'create') {
      const name = args[2];
      if (!name) {
        console.error('Usage: kontract migrate create <migration-name>');
        process.exit(1);
      }
      const result = createMigration('.', name);
      console.log(`Created migration v${result.version}: ${result.path}`);
      return;
    }
    console.error('Usage: kontract migrate create <name>');
    process.exit(1);
  }

  console.error(`Unknown command: ${command}`);
  console.error('Run `kontract --help` for usage.');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
