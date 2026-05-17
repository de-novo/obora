import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.e2e.test.ts'],
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/execution/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/**/__tests__/**',
        'src/**/__mocks__/**',
        'src/**/fixtures/**',
        'src/**/types.ts',
        'src/execution/workflow-runner.ts',
      ],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
      },
    },
  },
  resolve: {
    alias: {
      '@obora/runtime': path.resolve(__dirname, '../runtime/src/index.ts'),
      '@obora/adapters': path.resolve(__dirname, '../adapters/src/index.ts'),
      '@obora/adapters/llm': path.resolve(__dirname, '../adapters/src/llm/index.ts'),
      '@obora/adapters/tools': path.resolve(__dirname, '../adapters/src/tools/index.ts'),
      '@obora/adapters/auth': path.resolve(__dirname, '../adapters/src/auth/index.ts'),
    },
  },
});
