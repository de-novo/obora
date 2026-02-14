import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: {
    external: ['@obora-kit/blackboard'],
  },
  clean: true,
  external: ['@obora-kit/blackboard'],
});
