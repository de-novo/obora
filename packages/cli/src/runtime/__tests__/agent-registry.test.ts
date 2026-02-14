/**
 * AgentRegistry unit tests
 */

import { describe, it, expect } from "vitest";
import { AgentRegistry } from "../agent-registry.js";
import { AgentRole, MockLLMAdapter } from "@obora-kit/agents";
import { OboraError } from "@obora/core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRegistry() {
  return new AgentRegistry({ llm: new MockLLMAdapter() });
}

// ---------------------------------------------------------------------------
// resolve — valid roles
// ---------------------------------------------------------------------------

describe("AgentRegistry.resolve — valid roles", () => {
  it.each(["analyst", "executor", "verifier", "director"])(
    "should resolve '%s' to a BaseAgent",
    async (name) => {
      const registry = makeRegistry();
      const agent = await registry.resolve(name);
      expect(agent).toBeDefined();
      expect(agent.role).toBe(name);
    },
  );

  it("should be case-insensitive", async () => {
    const registry = makeRegistry();
    expect((await registry.resolve("Analyst")).role).toBe(AgentRole.ANALYST);
    expect((await registry.resolve("EXECUTOR")).role).toBe(AgentRole.EXECUTOR);
    expect((await registry.resolve("Verifier")).role).toBe(AgentRole.VERIFIER);
    expect((await registry.resolve("DIRECTOR")).role).toBe(AgentRole.DIRECTOR);
  });
});

// ---------------------------------------------------------------------------
// resolve — unknown agent (E4003)
// ---------------------------------------------------------------------------

describe("AgentRegistry.resolve — unknown agent", () => {
  it("should throw OboraError with code E4003 for unknown agent", async () => {
    const registry = makeRegistry();
    await expect(registry.resolve("unknown-agent")).rejects.toThrow(OboraError);
    try {
      await registry.resolve("unknown-agent");
    } catch (e) {
      const err = e as OboraError;
      expect(err.code).toBe("E4003");
      expect(err.message).toContain("unknown-agent");
      expect(err.message).toContain("Available agents");
    }
  });

  it("should throw E4003 for empty string", async () => {
    const registry = makeRegistry();
    await expect(registry.resolve("")).rejects.toThrow(OboraError);
  });

  it("should throw E4003 for planner (not yet supported)", async () => {
    const registry = makeRegistry();
    await expect(registry.resolve("planner")).rejects.toThrow(OboraError);
    try {
      await registry.resolve("planner");
    } catch (e) {
      expect((e as OboraError).code).toBe("E4003");
    }
  });
});

// ---------------------------------------------------------------------------
// has
// ---------------------------------------------------------------------------

describe("AgentRegistry.has", () => {
  it("should return true for valid agent names", () => {
    const registry = makeRegistry();
    expect(registry.has("analyst")).toBe(true);
    expect(registry.has("Executor")).toBe(true);
  });

  it("should return false for unknown agent names", () => {
    const registry = makeRegistry();
    expect(registry.has("unknown")).toBe(false);
    expect(registry.has("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// listAvailable
// ---------------------------------------------------------------------------

describe("AgentRegistry.listAvailable", () => {
  it("should return all 4 supported agent names", () => {
    const registry = makeRegistry();
    const available = registry.listAvailable();
    expect(available).toEqual(["analyst", "executor", "verifier", "director"]);
  });
});

// ---------------------------------------------------------------------------
// Integration with AgentResolver interface
// ---------------------------------------------------------------------------

describe("AgentRegistry as AgentResolver", () => {
  it("should satisfy AgentResolver interface contract", async () => {
    const registry = makeRegistry();
    // AgentResolver requires resolve(agentName: string): BaseAgent
    const agent = await registry.resolve("analyst");
    expect(typeof agent.execute).toBe("function");
  });
});
