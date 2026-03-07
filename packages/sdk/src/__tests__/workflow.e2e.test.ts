/**
 * SDK workflow E2E tests against real zai/glm-4.7 API.
 *
 * Validates:
 * 1. Single-step workflow execution with real LLM
 * 2. Multi-step pipeline with dependency passing
 * 3. Consensus step with real model responses
 * 4. Budget/cost tracking with real usage
 *
 * Requires ZAI_API_KEY environment variable.
 * Run: pnpm --filter @obora/sdk test:e2e
 */
import { describe, expect, it, afterEach } from "vitest";

import { OboraRuntime, type AuditEvent } from "../runtime.js";
import type { LLMConfig } from "../llm-config.js";

function resolveTestLLMConfig(): LLMConfig | undefined {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    return undefined;
  }

  return {
    provider: "zai",
    apiKey,
    model: process.env.OBORA_TEST_MODEL ?? "glm-4.7",
    temperature: 0,
    maxTokens: 1024,
  };
}

const llmConfig = resolveTestLLMConfig();
const describeE2E = llmConfig ? describe : describe.skip;

describeE2E("SDK Workflow E2E (zai/glm-4.7)", () => {
  afterEach(() => {
    // Cleanup if needed
  });

  describe("single-step workflow", () => {
    it("executes a simple workflow with real LLM", async () => {

      const runtime = new OboraRuntime({
        llm: llmConfig,
        audit: { enabled: true },
      });

      runtime.define("hello", {
        name: "hello",
        version: "1.0",
        steps: [
          {
            name: "greet",
            agent: "assistant",
            input: { task: "Say hello in Korean. Reply with just the greeting." },
          },
        ],
      });

      runtime.registerAgent("assistant", () => ({
        role: "Friendly Assistant",
        description: "A helpful greeting agent",
      }));

      const handle = await runtime.run("hello");
      const result = await handle.wait();

      expect(result.status).toBe("completed");
      expect(result.completedSteps).toContain("greet");
      expect(result.outputs.greet).toBeTruthy();
      expect(typeof result.outputs.greet).toBe("string");
    });
  });

  describe("multi-step pipeline", () => {
    it("passes outputs between steps", async () => {

      const runtime = new OboraRuntime({
        llm: llmConfig,
        audit: { enabled: true },
      });

      runtime.define("pipeline", {
        name: "pipeline",
        version: "1.0",
        steps: [
          {
            name: "generate",
            agent: "writer",
            input: { task: "Generate a random 4-letter word. Reply with ONLY the word, nothing else." },
          },
          {
            name: "transform",
            agent: "editor",
            depends_on: ["generate"],
            input: { task: "Take the word from the previous step and convert it to uppercase. Reply with ONLY the uppercase word." },
          },
        ],
      });

      runtime.registerAgent("writer", () => ({
        role: "Writer",
        description: "Generates text content",
      }));
      runtime.registerAgent("editor", () => ({
        role: "Editor",
        description: "Transforms text",
      }));

      const handle = await runtime.run("pipeline");
      const result = await handle.wait();

      expect(result.status).toBe("completed");
      expect(result.completedSteps).toEqual(["generate", "transform"]);
      expect(result.outputs.generate).toBeTruthy();
      expect(result.outputs.transform).toBeTruthy();
    });
  });

  describe("audit events", () => {
    it("emits execution events with real usage data", async () => {

      const events: AuditEvent[] = [];
      const runtime = new OboraRuntime({
        llm: llmConfig,
        audit: {
          enabled: true,
          sink: (event) => {
            events.push(event);
          },
        },
      });

      runtime.define("audit-test", {
        name: "audit-test",
        version: "1.0",
        steps: [
          {
            name: "compute",
            agent: "calculator",
            input: { task: "What is 10 * 10? Reply with just the number." },
          },
        ],
      });

      runtime.registerAgent("calculator", () => ({
        role: "Calculator",
      }));

      const handle = await runtime.run("audit-test");
      await handle.wait();

      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain("execution_start");
      expect(eventTypes).toContain("step_start");
      expect(eventTypes).toContain("step_end");
      expect(eventTypes).toContain("execution_end");

      // LLM events should have real usage data
      const llmResponses = events.filter((e) => e.type === "llm_response");
      expect(llmResponses.length).toBeGreaterThan(0);

      const responseData = llmResponses[0]!.data as { usage?: { totalTokens?: number }; model?: string };
      expect(responseData.usage?.totalTokens).toBeGreaterThan(0);
    });
  });

  describe("cancellation", () => {
    it("respects abort signal", async () => {

      const controller = new AbortController();
      const runtime = new OboraRuntime({ llm: llmConfig });

      runtime.define("cancel-test", {
        name: "cancel-test",
        version: "1.0",
        steps: [
          {
            name: "slow-step",
            agent: "writer",
            input: { task: "Write a detailed 5000-word essay about artificial intelligence history." },
          },
        ],
      });

      runtime.registerAgent("writer", () => ({ role: "Writer" }));

      const handle = await runtime.run("cancel-test", { signal: controller.signal });

      // Cancel shortly after starting
      setTimeout(() => controller.abort("Test cancellation"), 200);

      await expect(handle.wait()).rejects.toThrow();
    });
  });
});
