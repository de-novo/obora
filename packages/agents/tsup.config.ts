import { defineConfig } from "tsup";

const entry = {
  index: "src/index.ts",
  "llm/index": "src/llm/index.ts",
  "roles/index": "src/roles/index.ts",
  "prompts/index": "src/prompts/index.ts",
  "tools/index": "src/tools/index.ts",
};

export default defineConfig({
  entry,
  format: ["esm"],
  dts: {
    entry,
    compilerOptions: {
      composite: false,
    },
  },
  tsconfig: "./tsconfig.json",
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  minify: false,
  external: ["@obora-kit/blackboard"],
});
