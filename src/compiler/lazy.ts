export interface LazyRouteEntry {
  name: string;
  modulePath: string;
  meta: Record<string, unknown>;
}

export function generateLazyRoutes(entries: LazyRouteEntry[]): string {
  const lines: string[] = [
    'const __kontract_routes = new Map();',
    'const __kontract_loaders = new Map();',
    '',
  ];

  for (const entry of entries) {
    lines.push(
      `__kontract_loaders.set('${entry.name}', () => import('${entry.modulePath}').then(m => m.${entry.name}));`
    );
  }

  lines.push('');
  lines.push(`async function __kontract_resolve(name) {`);
  lines.push(`  if (__kontract_routes.has(name)) return __kontract_routes.get(name);`);
  lines.push(`  const loader = __kontract_loaders.get(name);`);
  lines.push(`  if (!loader) return undefined;`);
  lines.push(`  const handler = await loader();`);
  lines.push(`  __kontract_routes.set(name, handler);`);
  lines.push(`  return handler;`);
  lines.push(`}`);

  return lines.join('\n');
}
