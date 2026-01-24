import { defineConfig, mergeConfig, type UserConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Base vitest configuration for React projects
 */
export const baseConfig = defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/e2e/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/types/**",
        "**/__mocks__/**",
        "**/__fixtures__/**",
      ],
    },
  },
});

/**
 * Create a vitest config by merging with base config
 *
 * @example
 * ```ts
 * // vitest.config.ts
 * import { createConfig } from "@workspace/testing";
 *
 * export default createConfig({
 *   test: {
 *     setupFiles: ["./vitest.setup.ts"],
 *   },
 *   resolve: {
 *     alias: { "@": "./src" },
 *   },
 * });
 * ```
 */
export function createConfig(overrides: UserConfig = {}) {
  return mergeConfig(baseConfig, overrides);
}

/**
 * Create a vitest config for library packages (no React)
 */
export function createLibraryConfig(overrides: UserConfig = {}) {
  return mergeConfig(
    defineConfig({
      test: {
        environment: "node",
        globals: true,
        include: ["**/*.{test,spec}.ts"],
        exclude: ["**/node_modules/**", "**/dist/**"],
        coverage: {
          provider: "v8",
          reporter: ["text", "json", "html"],
          exclude: ["node_modules/", "**/*.d.ts", "**/*.config.*"],
        },
      },
    }),
    overrides
  );
}
