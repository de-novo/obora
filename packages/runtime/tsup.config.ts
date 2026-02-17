import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: false,
  external: ['@obora-kit/adapters', '@obora/core'],
  clean: true,
  sourcemap: true,
});
