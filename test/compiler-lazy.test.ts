import { describe, it, expect } from 'vitest';
import { generateLazyRoutes } from '../src/compiler/lazy';

describe('generateLazyRoutes', () => {
  it('emits correct loader code', () => {
    const code = generateLazyRoutes([
      { name: 'createUser', modulePath: './api/users.js', meta: { egroup: 'api-v1' } },
      { name: 'getUser', modulePath: './api/users.js', meta: { egroup: 'api-v1' } },
    ]);
    expect(code).toContain('__kontract_loaders.set');
    expect(code).toContain("import('./api/users.js').then(m => m.createUser)");
    expect(code).toContain("import('./api/users.js').then(m => m.getUser)");
    expect(code).toContain('__kontract_resolve');
  });

  it('includes route cache logic', () => {
    const code = generateLazyRoutes([
      { name: 'doStuff', modulePath: './stuff.js', meta: {} },
    ]);
    expect(code).toContain('__kontract_routes.has(name)');
    expect(code).toContain('__kontract_routes.set(name, handler)');
    expect(code).toContain('__kontract_routes.get(name)');
  });

  it('handles empty entries', () => {
    const code = generateLazyRoutes([]);
    expect(code).toContain('__kontract_routes');
    expect(code).toContain('__kontract_resolve');
    expect(code).not.toContain('__kontract_loaders.set');
  });
});
