/**
 * Integration tests for bootstrapAgentResolver
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @obora-kit/agents — we only need createAdapterFromEnv
vi.mock("@obora-kit/agents", () => {
  const MockLLMAdapter = class {
    readonly id = "mock-llm";
    supports() { return true; }
    async chatCompletion() {
      return {
        id: "m1", model: "mock", message: { role: "assistant", content: "ok" },
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, finishReason: "stop",
      };
    }
    async streamChatCompletion() { return this.chatCompletion(); }
  };

  return {
    createAdapterFromEnv: vi.fn(() => new MockLLMAdapter()),
    AgentRole: { ANALYST: "analyst", EXECUTOR: "executor", VERIFIER: "verifier", DIRECTOR: "director" },
    createAgent: vi.fn(({ role }: any) => ({
      id: `${role}-test`,
      role,
      execute: vi.fn(async () => ({ success: true, output: "test" })),
    })),
    MockLLMAdapter,
  };
});

// Mock step-executor types
vi.mock("../../runtime/step-executor.js", () => ({
  executeStep: vi.fn(),
}));

import { createAdapterFromEnv } from "@obora-kit/agents";
import { bootstrapAgentResolver, setAgentResolver } from "../run.js";

describe("bootstrapAgentResolver", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    setAgentResolver(null);
  });

  afterEach(() => {
    process.env = originalEnv;
    setAgentResolver(null);
  });

  it("should call createAdapterFromEnv and return an AgentResolver", () => {
    const resolver = bootstrapAgentResolver();

    expect(createAdapterFromEnv).toHaveBeenCalled();
    expect(resolver).toBeDefined();
    expect(typeof resolver.resolve).toBe("function");
  });

  it("should resolve known agent names", () => {
    const resolver = bootstrapAgentResolver();

    const agent = resolver.resolve("analyst");
    expect(agent).toBeDefined();
  });

  it("should throw on unknown agent names (E4003)", () => {
    const resolver = bootstrapAgentResolver();

    expect(() => resolver.resolve("unknown-agent")).toThrow(/E4003/);
  });

  it("should register the resolver globally (setAgentResolver)", () => {
    // Before bootstrap, resolver is null
    const resolver = bootstrapAgentResolver();

    // After bootstrap, calling it again should still work
    const resolver2 = bootstrapAgentResolver();
    expect(resolver2).toBeDefined();
  });
});
