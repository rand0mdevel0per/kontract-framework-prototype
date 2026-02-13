import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

export type Schema = Record<string, { type: string; primkey?: boolean; perm?: number }>;
export interface LockFile {
  version: number;
  tables: Record<string, { ptr: string; schema: Schema; hash: string }>;
  migrations: Array<{ version: number; timestamp?: string; changes: Array<{ type: string; table: string; field?: string; fieldType?: string }>; sql: string }>;
}

export function diffSchemas(oldS: Schema, newS: Schema): { safe: boolean; changes: Array<{ type: string; field: string }> } {
  const changes: Array<{ type: string; field: string }> = [];
  for (const k of Object.keys(newS)) {
    if (!oldS[k]) changes.push({ type: 'add_field', field: k });
    else if (oldS[k].type !== newS[k].type) return { safe: false, changes: [] };
  }
  for (const k of Object.keys(oldS)) {
    if (!newS[k]) return { safe: false, changes: [] };
  }
  return { safe: true, changes };
}

export function generateSQLAddField(ptr: string, field: string, fieldType: string): string {
  return `ALTER TABLE ${ptr} ADD COLUMN ${field} ${mapType(fieldType)};`;
}

function mapType(t: string): string {
  switch (t) {
    case 'string': return 'TEXT';
    case 'number': return 'DOUBLE PRECISION';
    case 'boolean': return 'BOOLEAN';
    default: return 'TEXT';
  }
}

// ── Lock file I/O ────────────────────────────────────────

const LOCK_FILENAME = 'kontract.lock.json';

export function readLockFile(cwd: string): LockFile | null {
  const p = resolve(cwd, LOCK_FILENAME);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf-8')) as LockFile;
}

export function writeLockFile(cwd: string, lock: LockFile): void {
  const p = resolve(cwd, LOCK_FILENAME);
  writeFileSync(p, JSON.stringify(lock, null, 2) + '\n', 'utf-8');
}

export function createEmptyLockFile(): LockFile {
  return { version: 0, tables: {}, migrations: [] };
}

// ── Migration file generation ────────────────────────────

export function generateMigrationTemplate(name: string, version: number): string {
  return `// Migration ${version}: ${name}
// Generated at ${new Date().toISOString()}

export default {
  version: ${version},

  up: async (db) => {
    // await db.exec('ALTER TABLE ...');
    // await db.updateSchema('tableName', { field: { type: 'string' } });
  },

  down: async (db) => {
    // Reverse the changes made in up()
  },
};
`;
}

export function createMigration(cwd: string, name: string): { path: string; version: number } {
  const lock = readLockFile(cwd) ?? createEmptyLockFile();
  const version = lock.version + 1;
  const dir = join(cwd, 'migrations');
  mkdirSync(dir, { recursive: true });
  const filename = `${String(version).padStart(4, '0')}_${name}.ts`;
  const filepath = join(dir, filename);
  writeFileSync(filepath, generateMigrationTemplate(name, version), 'utf-8');
  return { path: filepath, version };
}

export function applyMigration(lock: LockFile, migration: { version: number; changes: Array<{ type: string; table: string; field?: string; fieldType?: string }>; sql: string }): LockFile {
  return {
    ...lock,
    version: migration.version,
    migrations: [...lock.migrations, { ...migration, timestamp: new Date().toISOString() }],
  };
}

