import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/coverage/**',
        '**/*.test.ts',
        '**/__tests__/**',
        '**/*.config.ts',
      ],
      statements: 70,
      branches: 70,
      functions: 70,
      lines: 70,
    },
  },
  resolve: {
    alias: {
      '@obora/cli': path.resolve(__dirname, './src'),
      '@obora/sdk': path.resolve(__dirname, '../sdk/src/index.ts'),
      '@obora/runtime': path.resolve(__dirname, '../runtime/src/index.ts'),
      '@obora/adapters': path.resolve(__dirname, '../adapters/src/index.ts'),
      '@obora/adapters/llm': path.resolve(__dirname, '../adapters/src/llm/index.ts'),
      '@obora/adapters/tools': path.resolve(__dirname, '../adapters/src/tools/index.ts'),
      '@obora/adapters/auth': path.resolve(__dirname, '../adapters/src/auth/index.ts'),
      '@obora/core': path.resolve(__dirname, '../core/src'),
      '@obora/database': path.resolve(__dirname, '../database/src'),
    },
  },
});
