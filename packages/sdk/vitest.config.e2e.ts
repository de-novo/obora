/**
 * SDK E2E test config — runs real LLM tests against zai/glm-4.7.
 *
 * These tests hit the actual API and validate end-to-end workflow execution.
 * Requires ZAI_API_KEY in the environment.
 *
 * Usage:
 *   pnpm --filter @obora/sdk test:e2e
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.e2e.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 30_000,
  },
});
