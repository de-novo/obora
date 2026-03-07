/**
 * Root-level E2E / integration test configuration.
 *
 * Runs tests tagged with `.e2e.test.ts` across all packages using a real
 * LLM provider (default: zai/glm-4.7) instead of MockLLMAdapter.
 *
 * Usage:
 *   pnpm test:e2e                  # uses ZAI_API_KEY from env
 *   OBORA_TEST_MODEL=glm-5 pnpm test:e2e   # override model
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.e2e.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 30_000,
    env: {
      OBORA_LLM_PROVIDER: "zai",
      OBORA_TEST_MODEL: process.env.OBORA_TEST_MODEL ?? "glm-4.7",
      NODE_ENV: "test",
    },
    pool: "forks",
    poolOptions: {
      forks: {
        maxForks: 2,
      },
    },
  },
});
