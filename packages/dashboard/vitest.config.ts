import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@obora/runtime': path.resolve(__dirname, '../runtime/src/index.ts'),
    },
  },
});
