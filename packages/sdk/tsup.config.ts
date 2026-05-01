import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "testing/index": "src/testing/index.ts",
  },
  format: ["esm", "cjs"],
  dts: false,
  clean: true,
  sourcemap: true,
  external: [
    "@obora/adapters",
    "@obora/adapters/auth",
    "@obora/adapters/llm",
    "@obora/adapters/tools",
    "@obora/runtime",
    "@obora/runtime/storage",
    "better-sqlite3",
    "duckdb",
  ],
});
