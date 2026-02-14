/**
 * AgentRegistry unit tests
 */

import { describe, it, expect, vi } from "vitest";
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
    (name) => {
      const registry = makeRegistry();
      const agent = registry.resolve(name);
      expect(agent).toBeDefined();
      expect(agent.role).toBe(name);
    },
  );

  it("should be case-insensitive", () => {
    const registry = makeRegistry();
    expect(registry.resolve("Analyst").role).toBe(AgentRole.ANALYST);
    expect(registry.resolve("EXECUTOR").role).toBe(AgentRole.EXECUTOR);
    expect(registry.resolve("Verifier").role).toBe(AgentRole.VERIFIER);
    expect(registry.resolve("DIRECTOR").role).toBe(AgentRole.DIRECTOR);
  });
});

// ---------------------------------------------------------------------------
// resolve — unknown agent (E4003)
// ---------------------------------------------------------------------------

describe("AgentRegistry.resolve — unknown agent", () => {
  it("should throw OboraError with code E4003 for unknown agent", () => {
    const registry = makeRegistry();
    expect(() => registry.resolve("unknown-agent")).toThrow(OboraError);
    try {
      registry.resolve("unknown-agent");
    } catch (e) {
      const err = e as OboraError;
      expect(err.code).toBe("E4003");
      expect(err.message).toContain("unknown-agent");
      expect(err.message).toContain("Available agents");
    }
  });

  it("should throw E4003 for empty string", () => {
    const registry = makeRegistry();
    expect(() => registry.resolve("")).toThrow(OboraError);
  });

  it("should throw E4003 for planner (not yet supported)", () => {
    const registry = makeRegistry();
    expect(() => registry.resolve("planner")).toThrow(OboraError);
    try {
      registry.resolve("planner");
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
  it("should satisfy AgentResolver interface contract", () => {
    const registry = makeRegistry();
    // AgentResolver requires resolve(agentName: string): BaseAgent
    const agent = registry.resolve("analyst");
    expect(typeof agent.execute).toBe("function");
  });
});
