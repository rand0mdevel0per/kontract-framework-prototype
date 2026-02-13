import { describe, it, expect } from 'vitest';
import {
  TYPE_MAP,
  ANNOTATION_MAP,
  mapTsTypeToFBS,
  generateFBSTable,
  generateFBSSchema,
  fieldsFromRecord,
  generateRPCSchema,
} from '../src/compiler/flatbuffers';

describe('mapTsTypeToFBS', () => {
  it('maps basic TS types', () => {
    expect(mapTsTypeToFBS('string')).toBe('string');
    expect(mapTsTypeToFBS('number')).toBe('double');
    expect(mapTsTypeToFBS('boolean')).toBe('bool');
    expect(mapTsTypeToFBS('bigint')).toBe('int64');
    expect(mapTsTypeToFBS('Date')).toBe('int64');
    expect(mapTsTypeToFBS('Uint8Array')).toBe('[ubyte]');
  });

  it('maps array types from TYPE_MAP', () => {
    expect(mapTsTypeToFBS('string[]')).toBe('[string]');
    expect(mapTsTypeToFBS('number[]')).toBe('[double]');
    expect(mapTsTypeToFBS('boolean[]')).toBe('[bool]');
  });

  it('maps generic array types via regex', () => {
    expect(mapTsTypeToFBS('bigint[]')).toBe('[int64]');
    expect(mapTsTypeToFBS('Date[]')).toBe('[int64]');
  });

  it('respects annotation overrides', () => {
    expect(mapTsTypeToFBS('number', 'int32')).toBe('int32');
    expect(mapTsTypeToFBS('number', 'float32')).toBe('float');
    expect(mapTsTypeToFBS('number', 'uint64')).toBe('uint64');
    expect(mapTsTypeToFBS('number', 'int8')).toBe('int8');
  });

  it('passes through unknown types as table references', () => {
    expect(mapTsTypeToFBS('UserProfile')).toBe('UserProfile');
    expect(mapTsTypeToFBS('Address')).toBe('Address');
  });

  it('handles nested array of table references', () => {
    expect(mapTsTypeToFBS('UserProfile[]')).toBe('[UserProfile]');
  });
});

describe('generateFBSTable', () => {
  it('generates correct table syntax', () => {
    const result = generateFBSTable({
      name: 'User',
      fields: [
        { name: 'id', type: 'string' },
        { name: 'age', type: 'number', annotation: 'int32' },
        { name: 'active', type: 'boolean' },
      ],
    });
    expect(result).toBe(
      'table User {\n  id: string;\n  age: int32;\n  active: bool;\n}',
    );
  });

  it('handles empty fields', () => {
    const result = generateFBSTable({ name: 'Empty', fields: [] });
    expect(result).toBe('table Empty {\n}');
  });
});

describe('generateFBSSchema', () => {
  it('generates schema with namespace and root_type', () => {
    const result = generateFBSSchema({
      namespace: 'MyApp',
      tables: [
        { name: 'User', fields: [{ name: 'id', type: 'string' }] },
      ],
      rootType: 'User',
    });
    expect(result).toContain('namespace MyApp;');
    expect(result).toContain('table User {');
    expect(result).toContain('root_type User;');
  });

  it('generates schema without namespace or root_type', () => {
    const result = generateFBSSchema({
      tables: [
        { name: 'Item', fields: [{ name: 'name', type: 'string' }] },
      ],
    });
    expect(result).not.toContain('namespace');
    expect(result).not.toContain('root_type');
    expect(result).toContain('table Item {');
  });

  it('generates multiple tables', () => {
    const result = generateFBSSchema({
      tables: [
        { name: 'A', fields: [{ name: 'x', type: 'number' }] },
        { name: 'B', fields: [{ name: 'y', type: 'string' }] },
      ],
    });
    expect(result).toContain('table A {');
    expect(result).toContain('table B {');
  });
});

describe('fieldsFromRecord', () => {
  it('converts record to FBSField array', () => {
    const fields = fieldsFromRecord({ name: 'string', age: 'number' });
    expect(fields).toEqual([
      { name: 'name', type: 'string', annotation: undefined },
      { name: 'age', type: 'number', annotation: undefined },
    ]);
  });

  it('applies annotations', () => {
    const fields = fieldsFromRecord(
      { score: 'number' },
      { score: 'float32' },
    );
    expect(fields[0].annotation).toBe('float32');
  });
});

describe('generateRPCSchema', () => {
  it('generates request and response tables for each function', () => {
    const schema = generateRPCSchema([
      {
        name: 'getUser',
        params: [{ name: 'id', type: 'string' }],
        returnType: 'string',
      },
      {
        name: 'createUser',
        params: [
          { name: 'name', type: 'string' },
          { name: 'age', type: 'number', annotation: 'int32' },
        ],
        returnType: 'boolean',
      },
    ], 'RPC');

    expect(schema.namespace).toBe('RPC');
    expect(schema.tables).toHaveLength(4);
    expect(schema.tables[0].name).toBe('getUserRequest');
    expect(schema.tables[1].name).toBe('getUserResponse');
    expect(schema.tables[2].name).toBe('createUserRequest');
    expect(schema.tables[3].name).toBe('createUserResponse');
    expect(schema.tables[2].fields).toHaveLength(2);
    expect(schema.tables[2].fields[1].annotation).toBe('int32');
    expect(schema.tables[3].fields[0]).toEqual({ name: 'result', type: 'boolean' });
  });

  it('works without namespace', () => {
    const schema = generateRPCSchema([
      { name: 'ping', params: [], returnType: 'string' },
    ]);
    expect(schema.namespace).toBeUndefined();
    expect(schema.tables).toHaveLength(2);
  });
});

describe('TYPE_MAP and ANNOTATION_MAP', () => {
  it('TYPE_MAP covers all standard types', () => {
    expect(Object.keys(TYPE_MAP).length).toBeGreaterThanOrEqual(9);
  });

  it('ANNOTATION_MAP covers integer and float types', () => {
    const keys = Object.keys(ANNOTATION_MAP);
    expect(keys).toContain('int8');
    expect(keys).toContain('int16');
    expect(keys).toContain('int32');
    expect(keys).toContain('int64');
    expect(keys).toContain('uint8');
    expect(keys).toContain('float32');
    expect(keys).toContain('float64');
  });
});
