import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "llm/index": "src/llm/index.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: "node18",
  outDir: "dist",
  external: ["@obora-kit/blackboard"],
});
