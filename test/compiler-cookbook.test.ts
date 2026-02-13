import { describe, it, expect } from 'vitest';
import {
  extractDocComment,
  extractParamTypes,
  extractReturnType,
  generateCookbook,
  cookbookToVitepress,
} from '../src/compiler/cookbook';

const SAMPLE_SOURCE = `
/// # Create User
/// Creates a new user account.
/// Supports **markdown** formatting.
@backend({ egroup: 'api-v1', perm: 7 })
export async function createUser(name: string, age?: number): Promise<User> {
  return db.insert({ name, age });
}

/**
 * Get a user by their ID.
 * Returns null if not found.
 */
@backend({ egroup: 'api-v1', perm: 4 })
export async function getUser(id: string): Promise<User | null> {
  return db.get(id);
}

@backend()
export async function listUsers(): Promise<User[]> {
  return db.list();
}
`;

describe('extractDocComment', () => {
  it('extracts /// doc comments', () => {
    const doc = extractDocComment(SAMPLE_SOURCE, 'createUser');
    expect(doc).toContain('# Create User');
    expect(doc).toContain('Creates a new user account.');
    expect(doc).toContain('**markdown**');
  });

  it('extracts /** */ JSDoc comments', () => {
    const doc = extractDocComment(SAMPLE_SOURCE, 'getUser');
    expect(doc).toContain('Get a user by their ID.');
    expect(doc).toContain('Returns null if not found.');
  });

  it('returns empty string for functions with no doc comments', () => {
    const doc = extractDocComment(SAMPLE_SOURCE, 'listUsers');
    expect(doc).toBe('');
  });

  it('returns empty string for nonexistent function', () => {
    const doc = extractDocComment(SAMPLE_SOURCE, 'noSuchFn');
    expect(doc).toBe('');
  });
});

describe('extractParamTypes', () => {
  it('extracts param types with optional marker', () => {
    const params = extractParamTypes(SAMPLE_SOURCE, 'createUser');
    expect(params).toEqual([
      { name: 'name', type: 'string', optional: false },
      { name: 'age', type: 'number', optional: true },
    ]);
  });

  it('extracts single param', () => {
    const params = extractParamTypes(SAMPLE_SOURCE, 'getUser');
    expect(params).toEqual([
      { name: 'id', type: 'string', optional: false },
    ]);
  });

  it('returns empty array for no-param function', () => {
    const params = extractParamTypes(SAMPLE_SOURCE, 'listUsers');
    expect(params).toEqual([]);
  });
});

describe('extractReturnType', () => {
  it('extracts Promise return type', () => {
    expect(extractReturnType(SAMPLE_SOURCE, 'createUser')).toBe('Promise<User>');
  });

  it('extracts union return type', () => {
    expect(extractReturnType(SAMPLE_SOURCE, 'getUser')).toBe('Promise<User | null>');
  });

  it('extracts array return type', () => {
    expect(extractReturnType(SAMPLE_SOURCE, 'listUsers')).toBe('Promise<User[]>');
  });

  it('returns void for nonexistent function', () => {
    expect(extractReturnType(SAMPLE_SOURCE, 'noSuchFn')).toBe('void');
  });
});

describe('generateCookbook', () => {
  it('generates CookbookOutput from multiple sources', () => {
    const cookbook = generateCookbook([
      {
        path: 'src/api/users.ts',
        content: SAMPLE_SOURCE,
        routes: [
          { name: 'createUser', meta: { egroup: 'api-v1', perm: 7 } },
          { name: 'getUser', meta: { egroup: 'api-v1', perm: 4 } },
        ],
      },
    ]);
    expect(cookbook.entries).toHaveLength(2);
    expect(cookbook.entries[0].name).toBe('createUser');
    expect(cookbook.entries[0].description).toContain('# Create User');
    expect(cookbook.entries[0].params).toHaveLength(2);
    expect(cookbook.entries[0].returnType).toBe('Promise<User>');
    expect(cookbook.entries[0].sourcePath).toBe('src/api/users.ts');
    expect(cookbook.entries[1].name).toBe('getUser');
    expect(cookbook.generatedAt).toBeTruthy();
  });
});

describe('cookbookToVitepress', () => {
  it('generates correct .md structure', () => {
    const cookbook = generateCookbook([
      {
        path: 'src/api/users.ts',
        content: SAMPLE_SOURCE,
        routes: [
          { name: 'createUser', meta: { egroup: 'api-v1', perm: 7 } },
          { name: 'getUser', meta: { egroup: 'api-v1', perm: 4 } },
        ],
      },
    ]);
    const pages = cookbookToVitepress(cookbook);
    expect(pages.has('index.md')).toBe(true);
    expect(pages.has('createUser.md')).toBe(true);
    expect(pages.has('getUser.md')).toBe(true);

    const index = pages.get('index.md')!;
    expect(index).toContain('# API Reference');
    expect(index).toContain('[createUser](./createUser.md)');

    const createUserPage = pages.get('createUser.md')!;
    expect(createUserPage).toContain('# createUser');
    expect(createUserPage).toContain('## Parameters');
    expect(createUserPage).toContain('| name | `string` | Yes |');
    expect(createUserPage).toContain('| age | `number` | No |');
    expect(createUserPage).toContain('`Promise<User>`');
    expect(createUserPage).toContain('**Group**: `api-v1`');
    expect(createUserPage).toContain('RWX');
  });
});
