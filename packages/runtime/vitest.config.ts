import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
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
    },
  },
  resolve: {
    alias: {
      '@obora/adapters': path.resolve(__dirname, '../adapters/src/index.ts'),
      '@obora/adapters/llm': path.resolve(__dirname, '../adapters/src/llm/index.ts'),
      '@obora/adapters/tools': path.resolve(__dirname, '../adapters/src/tools/index.ts'),
      '@obora/adapters/auth': path.resolve(__dirname, '../adapters/src/auth/index.ts'),
    },
  },
});
