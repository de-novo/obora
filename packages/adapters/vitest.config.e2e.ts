/**
 * Adapters E2E test config — validates real LLM adapter behavior against zai/glm-4.7.
 *
 * Requires ZAI_API_KEY in the environment.
 *
 * Usage:
 *   pnpm --filter @obora/adapters test:e2e
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.e2e.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 15_000,
  },
});
