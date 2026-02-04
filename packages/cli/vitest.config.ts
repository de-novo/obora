import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
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
      '@obora/core': path.resolve(__dirname, '../core/src'),
      '@obora/database': path.resolve(__dirname, '../database/src'),
    },
  },
});
