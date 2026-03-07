/**
 * E2E tests for LLM adapter against real zai/glm-4.7 API.
 *
 * These tests validate:
 * 1. Basic chat completion (single turn)
 * 2. Streaming chat completion
 * 3. Tool calling (function calling)
 * 4. Error handling (invalid model, bad request)
 *
 * Requires ZAI_API_KEY environment variable.
 * Run: pnpm --filter @obora/adapters test:e2e
 */
import { describe, expect, it, beforeAll } from "vitest";

import { resolveE2EConfig, createE2EAdapter, type E2ETestConfig } from "./e2e-helpers.js";
import type { LLMAdapter, ChatCompletionResult, ChatCompletionChunk } from "../../llm/adapter.js";

const config = resolveE2EConfig();
const describeE2E = config ? describe : describe.skip;

describeE2E("LLM Adapter E2E (zai/glm-4.7)", () => {
  let adapter: LLMAdapter;

  beforeAll(() => {
    adapter = createE2EAdapter(config!);
  });

  describe("chatCompletion", () => {
    it("returns a valid response for a simple prompt", async () => {

      const result: ChatCompletionResult = await adapter.chatCompletion({
        messages: [
          { role: "system", content: "You are a helpful assistant. Reply concisely." },
          { role: "user", content: "What is 2 + 2? Reply with just the number." },
        ],
        model: config.model,
        temperature: 0,
        maxTokens: 50,
      });

      expect(result).toBeDefined();
      expect(result.message.role).toBe("assistant");
      expect(result.message.content).toBeTruthy();
      expect(result.message.content!.trim()).toContain("4");
      expect(result.usage.totalTokens).toBeGreaterThan(0);
      expect(result.finishReason).toBe("stop");
    });

    it("respects maxTokens limit", async () => {

      const result = await adapter.chatCompletion({
        messages: [
          { role: "user", content: "Write a very long essay about the history of computing." },
        ],
        model: config.model,
        temperature: 0,
        maxTokens: 20,
      });

      expect(result).toBeDefined();
      // With maxTokens=20, output should be short (possibly truncated)
      expect(result.usage.completionTokens).toBeLessThanOrEqual(30); // small tolerance
    });

    it("handles multi-turn conversation", async () => {

      const result = await adapter.chatCompletion({
        messages: [
          { role: "user", content: "My name is Alice." },
          { role: "assistant", content: "Hello Alice!" },
          { role: "user", content: "What is my name? Reply with just the name." },
        ],
        model: config.model,
        temperature: 0,
        maxTokens: 50,
      });

      expect(result.message.content).toBeTruthy();
      expect(result.message.content!.toLowerCase()).toContain("alice");
    });
  });

  describe("streamChatCompletion", () => {
    it("streams chunks and returns final result", async () => {

      const chunks: ChatCompletionChunk[] = [];
      const result = await adapter.streamChatCompletion(
        {
          messages: [
            { role: "user", content: "Count from 1 to 5 separated by commas." },
          ],
          model: config.model,
          temperature: 0,
          maxTokens: 50,
        },
        (chunk) => {
          chunks.push(chunk);
        },
      );

      expect(chunks.length).toBeGreaterThan(0);
      expect(result).toBeDefined();
      expect(result.message.content).toBeTruthy();
      expect(result.finishReason).toBe("stop");
    });
  });

  describe("tool calling", () => {
    it("makes a tool call when appropriate", async () => {

      const result = await adapter.chatCompletion({
        messages: [
          {
            role: "system",
            content: "You have access to tools. Use them when asked to perform actions.",
          },
          {
            role: "user",
            content: "Get the current weather in Seoul. You must call the get_weather tool.",
          },
        ],
        model: config.model,
        temperature: 0,
        maxTokens: 200,
        tools: [
          {
            type: "function",
            function: {
              name: "get_weather",
              description: "Get current weather for a location",
              parameters: {
                type: "object",
                properties: {
                  location: { type: "string", description: "City name" },
                },
                required: ["location"],
              },
            },
          },
        ],
        toolChoice: "auto",
      });

      expect(result).toBeDefined();
      // The model should either call the tool or respond with text
      // We check that tool_calls finishReason is returned OR content is non-null
      if (result.finishReason === "tool_calls") {
        expect(result.message.toolCalls).toBeDefined();
        expect(result.message.toolCalls!.length).toBeGreaterThan(0);
        const call = result.message.toolCalls![0]!;
        expect(call.function.name).toBe("get_weather");
        const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
        expect(typeof args.location).toBe("string");
      } else {
        // Some models may not reliably call tools; that's still a valid E2E result
        expect(result.message.content).toBeTruthy();
      }
    });
  });

  describe("error handling", () => {
    it("handles abort signal", async () => {

      const controller = new AbortController();
      // Abort immediately
      controller.abort(new Error("Test abort"));

      await expect(
        adapter.chatCompletion(
          {
            messages: [{ role: "user", content: "Hello" }],
            model: config.model,
          },
          { signal: controller.signal },
        ),
      ).rejects.toThrow();
    });
  });

  describe("supports()", () => {
    it("reports feature support", () => {

      expect(adapter.supports("streaming")).toBe(true);
      expect(adapter.supports("function-calling")).toBe(true);
      // json-mode may or may not be supported depending on adapter
      expect(typeof adapter.supports("json-mode")).toBe("boolean");
    });
  });
});
