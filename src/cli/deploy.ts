import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

export interface DeployOptions {
  cwd?: string;
  env?: string;
  skipChecks?: boolean;
  hyperdrive?: boolean;
  databaseUrl?: string;
}

export interface DeployCheckResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function checkPrerequisites(cwd: string): DeployCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const wranglerToml = resolve(cwd, 'wrangler.toml');
  if (!existsSync(wranglerToml)) {
    errors.push('wrangler.toml not found. Run `kontract init` first.');
  }

  const pkgJson = resolve(cwd, 'package.json');
  if (!existsSync(pkgJson)) {
    errors.push('package.json not found.');
  } else {
    const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8'));
    if (!pkg.dependencies?.kontract && !pkg.dependencies?.['@rand0mdevel0per/kontract'] &&
        !pkg.devDependencies?.kontract && !pkg.devDependencies?.['@rand0mdevel0per/kontract']) {
      warnings.push('kontract is not listed in dependencies.');
    }
  }

  try {
    execSync('npx wrangler --version', { cwd, stdio: 'pipe' });
  } catch {
    errors.push('wrangler not found. Install with: npm i -D wrangler');
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function readWranglerToml(cwd: string): string {
  return readFileSync(resolve(cwd, 'wrangler.toml'), 'utf-8');
}

export function hasHyperdriveBinding(tomlContent: string): boolean {
  return /\[\[hyperdrive\]\]/i.test(tomlContent);
}

export async function deploy(options: DeployOptions = {}): Promise<void> {
  const cwd = resolve(options.cwd ?? '.');

  if (!options.skipChecks) {
    const check = checkPrerequisites(cwd);
    for (const w of check.warnings) {
      console.warn(`⚠ ${w}`);
    }
    if (!check.ok) {
      for (const e of check.errors) {
        console.error(`✗ ${e}`);
      }
      process.exit(1);
    }
  }

  // Hyperdrive setup
  if (options.hyperdrive) {
    const toml = readWranglerToml(cwd);
    if (!hasHyperdriveBinding(toml)) {
      if (!options.databaseUrl) {
        console.error('✗ --database-url required for Hyperdrive setup.');
        process.exit(1);
      }
      console.log('Setting up Hyperdrive...');
      try {
        const result = execSync(
          `npx wrangler hyperdrive create kontract-db --connection-string="${options.databaseUrl}"`,
          { cwd, stdio: 'pipe', encoding: 'utf-8' }
        );
        const idMatch = result.match(/id:\s*"?([a-f0-9-]+)"?/i);
        if (idMatch) {
          const { appendFileSync } = await import('fs');
          appendFileSync(
            resolve(cwd, 'wrangler.toml'),
            `\n\n[[hyperdrive]]\nbinding = "HYPERDRIVE"\nid = "${idMatch[1]}"\n`
          );
          console.log(`✓ Hyperdrive created: ${idMatch[1]}`);
        }
      } catch (e) {
        console.error(`✗ Hyperdrive setup failed: ${(e as Error).message}`);
        process.exit(1);
      }
    } else {
      console.log('✓ Hyperdrive already configured.');
    }
  }

  // Build
  const pkgJson = resolve(cwd, 'package.json');
  if (existsSync(pkgJson)) {
    const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8'));
    if (pkg.scripts?.build) {
      console.log('Building...');
      execSync('npm run build', { cwd, stdio: 'inherit' });
    }
  }

  // Deploy
  const envFlag = options.env ? ` --env ${options.env}` : '';
  console.log('Deploying...');
  execSync(`npx wrangler deploy${envFlag}`, { cwd, stdio: 'inherit' });
  console.log('✓ Deployed.');
}
