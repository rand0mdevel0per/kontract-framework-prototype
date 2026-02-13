import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
      exclude: ['src/cli/bin.ts'],
      thresholds: {
        lines: 90,
        statements: 90,
        branches: 85,
        functions: 90
      }
    }
  }
});
