export interface PermContext {
  sid: string;
  owner: string;
  perm: number;
}

export function verifyAccess(ctx: PermContext, requiredPerm: number, owner?: string): void {
  if (owner && owner !== ctx.owner) {
    throw new Error('Forbidden');
  }
  if ((ctx.perm & requiredPerm) !== requiredPerm) {
    throw new Error('Insufficient permissions');
  }
}

export function checkTablePermission(perms: number, operation: 'read' | 'write' | 'delete'): void {
  const required = operation === 'read' ? 0b100 : operation === 'write' ? 0b010 : 0b001;
  if (!(perms & required)) {
    throw new Error(`Cannot ${operation}`);
  }
}

export function checkFieldPermissions(data: Record<string, unknown>, fieldPerms: Record<string, number>, mask: number): void {
  for (const [field, value] of Object.entries(data)) {
    if (value !== undefined) {
      const required = fieldPerms[field] ?? 0b110;
      const writeRequired = (required & 0b010) === 0b010;
      if (writeRequired && (mask & 0b010) !== 0b010) {
        throw new Error(field);
      }
    }
  }
}
