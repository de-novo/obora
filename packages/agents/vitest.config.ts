import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/__tests__/**/*.ts"],
    exclude: [
      "node_modules",
      "dist",
      "**/src/__tests__/helpers/**",
      "**/src/__tests__/setup.ts",
      "**/src/__tests__/index.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**", "src/**/index.ts", "src/**/types.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
