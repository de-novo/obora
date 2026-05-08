import { defineConfig } from "tsup";

const entry = {
  index: "src/index.ts",
  "llm/index": "src/llm/index.ts",
  "tools/index": "src/tools/index.ts",
  "auth/index": "src/auth/index.ts",
  "testing/index": "src/testing/index.ts",
};

export default defineConfig({
  entry,
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  noExternal: ["@earendil-works/pi-agent-core", "@earendil-works/pi-ai"],
});
