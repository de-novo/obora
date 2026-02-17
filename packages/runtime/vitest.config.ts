import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/_legacy/workflow/**'],
    environment: 'node',
  },
});
