import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/types/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: true,
  external: [],
  treeshake: true,
});
