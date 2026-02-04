import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/graph/**/*.ts',
        'src/parser/**/*.ts',
        'src/resolver/**/*.ts',
        'src/validator/**/*.ts',
        'src/errors/**/*.ts',
      ],
      exclude: ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'],
    },
    globals: true,
    testTimeout: 10000,
  },
});
