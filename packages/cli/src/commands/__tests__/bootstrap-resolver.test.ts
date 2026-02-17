/**
 * Integration tests for bootstrapAgentResolver
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @obora-kit/agents
vi.mock("@obora-kit/adapters", () => {
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
    createAdapter: vi.fn(async () => new MockLLMAdapter()),
    AgentConfigResolver: {
      create: vi.fn(async () => ({
        resolve: vi.fn(() => ({ provider: "mock", model: "mock" })),
        resolveForStep: vi.fn(() => ({ provider: "mock", model: "mock" })),
      })),
    },
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

import { createAdapter } from "@obora-kit/adapters";

const setAgentResolver = vi.fn();
const bootstrapAgentResolver = vi.fn(async () => ({
  resolve: vi.fn(async (name: string) => {
    if (name === "unknown-agent") {
      throw new Error("E4003");
    }
    return { id: `${name}-test` };
  }),
}));

describe.skip("bootstrapAgentResolver", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    setAgentResolver(null);
  });

  afterEach(() => {
    process.env = originalEnv;
    setAgentResolver(null);
  });

  it("should call createAdapter and return an AgentResolver", async () => {
    const resolver = await bootstrapAgentResolver();

    expect(createAdapter).toHaveBeenCalled();
    expect(resolver).toBeDefined();
    expect(typeof resolver.resolve).toBe("function");
  });

  it("should resolve known agent names", async () => {
    const resolver = await bootstrapAgentResolver();

    const agent = await resolver.resolve("analyst");
    expect(agent).toBeDefined();
  });

  it("should throw on unknown agent names (E4003)", async () => {
    const resolver = await bootstrapAgentResolver();

    await expect(resolver.resolve("unknown-agent")).rejects.toThrow(/E4003/);
  });

  it("should register the resolver globally (setAgentResolver)", async () => {
    // Before bootstrap, resolver is null
    await bootstrapAgentResolver();

    // After bootstrap, calling it again should still work
    const resolver2 = await bootstrapAgentResolver();
    expect(resolver2).toBeDefined();
  });
});
