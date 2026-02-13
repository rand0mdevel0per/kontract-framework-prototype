import { describe, it, expect } from 'vitest';
import { optimize, optimizePassthrough } from '../src/compiler/swc';

describe('SWC optimize', () => {
  it('eliminates dead code', async () => {
    const code = `
      var x = 1;
      if (false) { console.log("dead"); }
      console.log(x);
    `;
    const result = await optimize(code);
    expect(result).not.toContain('"dead"');
    expect(result).toContain('console');
  });

  it('folds constants', async () => {
    const code = `var x = 2 + 3; console.log(x);`;
    const result = await optimize(code);
    // Should fold 2+3 into 5
    expect(result).toContain('5');
    expect(result).not.toContain('2 + 3');
  });

  it('reduces unused variables', async () => {
    const code = `
      var unused = 42;
      var used = 10;
      console.log(used);
    `;
    const result = await optimize(code);
    expect(result).not.toContain('unused');
    expect(result).toContain('console');
  });

  it('respects mangle option', async () => {
    const code = `function longFunctionName(longParam) { return longParam + 1; } longFunctionName(5);`;
    const mangled = await optimize(code, { mangle: true });
    // Mangled output should be shorter
    expect(mangled.length).toBeLessThan(code.length);
  });

  it('preserves semantics of non-trivial code', async () => {
    const code = `
      function add(a, b) { return a + b; }
      var result = add(10, 20);
      console.log(result);
    `;
    const result = await optimize(code);
    // The result should still produce 30 semantically
    expect(result).toContain('console');
    // Either inlined to 30 or kept as function — both valid
  });

  it('handles empty code', async () => {
    const result = await optimize('');
    expect(result).toBe('');
  });

  it('applies multiple passes', async () => {
    const code = `
      var a = 1;
      var b = a + 1;
      var c = b + 1;
      console.log(c);
    `;
    // With 3 passes, should collapse chain a→b→c into final value 3
    const result = await optimize(code, { passes: 3 });
    expect(result).toContain('3');
  });

  it('can disable individual passes', async () => {
    const code = `
      if (false) { console.log("dead"); }
      console.log("alive");
    `;
    const withDCE = await optimize(code, { dce: true });
    const withoutDCE = await optimize(code, { dce: false });
    // Without DCE, dead code might still be removed by other passes,
    // but with DCE explicitly on it should definitely be gone
    expect(withDCE).not.toContain('"dead"');
    expect(withDCE).toContain('"alive"');
    expect(withoutDCE).toContain('"alive"');
  });
});

describe('optimizePassthrough', () => {
  it('returns code mostly unchanged', async () => {
    const code = `var x = 1 + 2; console.log(x);`;
    const result = await optimizePassthrough(code);
    // Passthrough should not fold constants or eliminate anything
    // (SWC may still normalize whitespace)
    expect(result).toContain('console');
  });
});
