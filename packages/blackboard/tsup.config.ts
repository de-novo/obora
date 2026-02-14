import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'types/index': 'src/types/index.ts',
    'core/index': 'src/core/index.ts',
    'events/index': 'src/events/index.ts',
    'snapshot/index': 'src/snapshot/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: {
    // Override composite to false for DTS generation only.
    // tsconfig.json keeps composite:true for IDE project references and tsc --noEmit.
    // tsup's multi-entry DTS generation conflicts with composite's file-list constraint (TS6307).
    compilerOptions: {
      composite: false,
    },
  },
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'node18',
  outDir: 'dist',
  external: [],
  esbuildOptions(options) {
    options.banner = {
      js: '/* @obora-kit/blackboard - MIT License */',
    };
  },
});
