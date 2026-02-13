import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { checkPrerequisites, hasHyperdriveBinding } from '../src/cli/deploy';
import { generateProjectFiles, scaffoldProject } from '../src/cli/init';

const TMP = join(import.meta.dirname, '__tmp_cli_test__');

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('deploy - checkPrerequisites', () => {
  it('fails when wrangler.toml is missing', () => {
    writeFileSync(join(TMP, 'package.json'), '{}');
    const result = checkPrerequisites(TMP);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('wrangler.toml'))).toBe(true);
  });

  it('fails when package.json is missing', () => {
    writeFileSync(join(TMP, 'wrangler.toml'), 'name = "test"');
    const result = checkPrerequisites(TMP);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('package.json'))).toBe(true);
  });

  it('warns when kontract is not in dependencies', () => {
    writeFileSync(join(TMP, 'wrangler.toml'), 'name = "test"');
    writeFileSync(join(TMP, 'package.json'), '{"dependencies":{}}');
    const result = checkPrerequisites(TMP);
    expect(result.warnings.some((w) => w.includes('kontract'))).toBe(true);
  });

  it('passes with valid project structure', () => {
    writeFileSync(join(TMP, 'wrangler.toml'), 'name = "test"');
    writeFileSync(join(TMP, 'package.json'), '{"dependencies":{"@rand0mdevel0per/kontract":"^0.1.0"}}');
    const result = checkPrerequisites(TMP);
    expect(result.errors.filter((e) => !e.includes('wrangler not found'))).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe('deploy - hasHyperdriveBinding', () => {
  it('detects hyperdrive binding', () => {
    expect(hasHyperdriveBinding('[[hyperdrive]]\nbinding = "HYPERDRIVE"')).toBe(true);
  });

  it('returns false when absent', () => {
    expect(hasHyperdriveBinding('name = "test"')).toBe(false);
  });
});

describe('init - generateProjectFiles', () => {
  it('generates all required files', () => {
    const files = generateProjectFiles('my-app', false);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('package.json');
    expect(paths).toContain('wrangler.toml');
    expect(paths).toContain('tsconfig.json');
    expect(paths).toContain('sql/init.sql');
    expect(paths).toContain('src/gateway.ts');
  });

  it('uses project name in package.json', () => {
    const files = generateProjectFiles('cool-project', false);
    const pkg = JSON.parse(files.find((f) => f.path === 'package.json')!.content);
    expect(pkg.name).toBe('cool-project');
  });

  it('uses project name in wrangler.toml', () => {
    const files = generateProjectFiles('cool-project', false);
    const toml = files.find((f) => f.path === 'wrangler.toml')!.content;
    expect(toml).toContain('name = "cool-project"');
  });

  it('includes kontract deploy script', () => {
    const files = generateProjectFiles('my-app', false);
    const pkg = JSON.parse(files.find((f) => f.path === 'package.json')!.content);
    expect(pkg.scripts.deploy).toBe('kontract deploy');
  });

  it('includes Hyperdrive in Env when enabled', () => {
    const files = generateProjectFiles('my-app', true);
    const gateway = files.find((f) => f.path === 'src/gateway.ts')!.content;
    expect(gateway).toContain('HYPERDRIVE: Hyperdrive');
  });

  it('excludes Hyperdrive from Env when disabled', () => {
    const files = generateProjectFiles('my-app', false);
    const gateway = files.find((f) => f.path === 'src/gateway.ts')!.content;
    expect(gateway).not.toContain('HYPERDRIVE');
  });

  it('adds Hyperdrive comment to wrangler.toml when enabled', () => {
    const files = generateProjectFiles('my-app', true);
    const toml = files.find((f) => f.path === 'wrangler.toml')!.content;
    expect(toml).toContain('Hyperdrive');
    expect(toml).toContain('kontract deploy --hyperdrive');
  });

  it('includes SQL schema for both tables', () => {
    const files = generateProjectFiles('my-app', false);
    const sql = files.find((f) => f.path === 'sql/init.sql')!.content;
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS storage');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS trxs');
  });
});

describe('init - scaffoldProject', () => {
  it('creates all files on disk', () => {
    const created = scaffoldProject({ name: 'test-proj', cwd: TMP, skipInstall: true });
    expect(created.length).toBe(5);
    for (const f of created) {
      expect(existsSync(join(TMP, 'test-proj', f))).toBe(true);
    }
  });

  it('writes valid JSON for package.json', () => {
    scaffoldProject({ name: 'test-proj', cwd: TMP, skipInstall: true });
    const raw = readFileSync(join(TMP, 'test-proj', 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    expect(pkg.name).toBe('test-proj');
    expect(pkg.dependencies.kontract).toBeDefined();
  });
});
