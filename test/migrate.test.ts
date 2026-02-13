import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import {
  diffSchemas,
  generateSQLAddField,
  readLockFile,
  writeLockFile,
  createEmptyLockFile,
  createMigration,
  applyMigration,
  generateMigrationTemplate,
} from '../src/cli/migrate';

const TMP = join(import.meta.dirname, '__tmp_migrate_test__');

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('migrate - diffSchemas', () => {
  it('detects safe add_field changes', () => {
    const oldS = { id: { type: 'string', primkey: true } };
    const newS = { id: { type: 'string', primkey: true }, email: { type: 'string' } };
    const d = diffSchemas(oldS, newS);
    expect(d.safe).toBe(true);
    expect(d.changes[0].field).toBe('email');
  });

  it('rejects dangerous type change', () => {
    const oldS = { age: { type: 'number' } };
    const newS = { age: { type: 'string' } };
    const d = diffSchemas(oldS, newS);
    expect(d.safe).toBe(false);
  });

  it('generates SQL for add_field', () => {
    const sql = generateSQLAddField('tbl_users_abc', 'email', 'string');
    expect(sql).toContain('ALTER TABLE tbl_users_abc');
  });

  it('maps boolean and unknown types', () => {
    const sqlBool = generateSQLAddField('tbl_users_abc', 'active', 'boolean');
    expect(sqlBool).toContain('BOOLEAN');
    const sqlUnknown = generateSQLAddField('tbl_users_abc', 'meta', 'json');
    expect(sqlUnknown).toContain('TEXT');
  });

  it('detects field removal as unsafe', () => {
    const oldS = { id: { type: 'string' }, email: { type: 'string' } };
    const newS = { id: { type: 'string' } };
    const d = diffSchemas(oldS, newS);
    expect(d.safe).toBe(false);
  });
});

describe('migrate - lock file', () => {
  it('readLockFile returns null when file missing', () => {
    expect(readLockFile(TMP)).toBeNull();
  });

  it('writeLockFile and readLockFile round-trip', () => {
    const lock = createEmptyLockFile();
    lock.version = 3;
    writeLockFile(TMP, lock);
    const read = readLockFile(TMP);
    expect(read).not.toBeNull();
    expect(read!.version).toBe(3);
  });

  it('createEmptyLockFile has zero version', () => {
    const lock = createEmptyLockFile();
    expect(lock.version).toBe(0);
    expect(lock.migrations).toEqual([]);
    expect(lock.tables).toEqual({});
  });
});

describe('migrate - migration creation', () => {
  it('generateMigrationTemplate includes version and name', () => {
    const tmpl = generateMigrationTemplate('add_email', 5);
    expect(tmpl).toContain('version: 5');
    expect(tmpl).toContain('add_email');
    expect(tmpl).toContain('up:');
    expect(tmpl).toContain('down:');
  });

  it('createMigration creates file with correct version', () => {
    const result = createMigration(TMP, 'init_users');
    expect(result.version).toBe(1);
    expect(existsSync(result.path)).toBe(true);
    const content = readFileSync(result.path, 'utf-8');
    expect(content).toContain('version: 1');
    expect(content).toContain('init_users');
  });

  it('createMigration increments version from lock file', () => {
    const lock = createEmptyLockFile();
    lock.version = 3;
    writeLockFile(TMP, lock);
    const result = createMigration(TMP, 'next_step');
    expect(result.version).toBe(4);
  });
});

describe('migrate - applyMigration', () => {
  it('updates lock version and appends migration', () => {
    const lock = createEmptyLockFile();
    const migration = {
      version: 1,
      changes: [{ type: 'add_field', table: 'users', field: 'email', fieldType: 'string' }],
      sql: 'ALTER TABLE tbl_users ADD COLUMN email TEXT;',
    };
    const updated = applyMigration(lock, migration);
    expect(updated.version).toBe(1);
    expect(updated.migrations).toHaveLength(1);
    expect(updated.migrations[0].timestamp).toBeDefined();
  });
});
