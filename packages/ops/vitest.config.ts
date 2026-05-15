import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["src/client/test-setup.ts"],
    coverage: {
      provider: "v8",
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.config.ts",
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/client/main.tsx",
      ],
    },
  },
});
