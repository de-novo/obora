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
  dts: true,
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
