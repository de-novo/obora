import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.config.ts',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/__tests__/**',
        'src/client/App.tsx',
        'src/client/main.tsx',
        'src/client/pages/**/*.tsx',
      ],
    },
  },
  resolve: {
    alias: {
      '@obora/runtime': path.resolve(__dirname, '../runtime/src/index.ts'),
    },
  },
});
