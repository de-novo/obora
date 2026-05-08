import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "storage/index": "src/storage/index.ts",
  },
  format: ["esm", "cjs"],
  dts: false,
  external: ["@obora/adapters", "better-sqlite3", "duckdb"],
  noExternal: ["@earendil-works/pi-agent-core", "@earendil-works/pi-ai"],
  clean: true,
  sourcemap: true,
});
