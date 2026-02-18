import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: false,
  external: ['@obora-kit/adapters', 'better-sqlite3', 'duckdb'],
  clean: true,
  sourcemap: true,
});
