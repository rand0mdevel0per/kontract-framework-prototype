/**
 * FlatBuffers schema generation from TypeScript types.
 * Spec §6.3.5 / §9.3
 */

export const TYPE_MAP: Record<string, string> = {
  string: 'string',
  number: 'double',
  boolean: 'bool',
  bigint: 'int64',
  Date: 'int64',
  Uint8Array: '[ubyte]',
  'string[]': '[string]',
  'number[]': '[double]',
  'boolean[]': '[bool]',
};

/** Annotation overrides: @int8, @int32, @float32 etc. */
export const ANNOTATION_MAP: Record<string, string> = {
  int8: 'int8',
  int16: 'int16',
  int32: 'int32',
  int64: 'int64',
  uint8: 'uint8',
  uint16: 'uint16',
  uint32: 'uint32',
  uint64: 'uint64',
  float32: 'float',
  float64: 'double',
};

export interface FBSField {
  name: string;
  type: string;
  annotation?: string;
}

export interface FBSTable {
  name: string;
  fields: FBSField[];
}

export interface FBSSchema {
  namespace?: string;
  tables: FBSTable[];
  rootType?: string;
}

export function mapTsTypeToFBS(tsType: string, annotation?: string): string {
  if (annotation && ANNOTATION_MAP[annotation]) {
    return ANNOTATION_MAP[annotation];
  }
  if (TYPE_MAP[tsType]) {
    return TYPE_MAP[tsType];
  }
  // Array type: Type[]
  const arrayMatch = tsType.match(/^(.+)\[\]$/);
  if (arrayMatch) {
    const inner = mapTsTypeToFBS(arrayMatch[1], annotation);
    return `[${inner}]`;
  }
  // Nested object → table reference (PascalCase)
  return tsType;
}

export function generateFBSTable(table: FBSTable): string {
  const lines: string[] = [`table ${table.name} {`];
  for (const field of table.fields) {
    const fbsType = mapTsTypeToFBS(field.type, field.annotation);
    lines.push(`  ${field.name}: ${fbsType};`);
  }
  lines.push('}');
  return lines.join('\n');
}

export function generateFBSSchema(schema: FBSSchema): string {
  const parts: string[] = [];

  if (schema.namespace) {
    parts.push(`namespace ${schema.namespace};`);
    parts.push('');
  }

  for (const table of schema.tables) {
    parts.push(generateFBSTable(table));
    parts.push('');
  }

  if (schema.rootType) {
    parts.push(`root_type ${schema.rootType};`);
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Extract FBS fields from a simple interface-like record.
 * For compile-time use: takes { fieldName: tsType } map.
 */
export function fieldsFromRecord(
  record: Record<string, string>,
  annotations?: Record<string, string>
): FBSField[] {
  return Object.entries(record).map(([name, type]) => ({
    name,
    type,
    annotation: annotations?.[name],
  }));
}

/**
 * Generate an RPC service schema for a set of @backend functions.
 */
export function generateRPCSchema(
  functions: Array<{
    name: string;
    params: Array<{ name: string; type: string; annotation?: string }>;
    returnType: string;
  }>,
  namespace?: string
): FBSSchema {
  const tables: FBSTable[] = [];

  for (const fn of functions) {
    // Request table
    tables.push({
      name: `${fn.name}Request`,
      fields: fn.params.map((p) => ({
        name: p.name,
        type: p.type,
        annotation: p.annotation,
      })),
    });

    // Response table
    tables.push({
      name: `${fn.name}Response`,
      fields: [{ name: 'result', type: fn.returnType }],
    });
  }

  return { namespace, tables };
}
