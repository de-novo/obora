/**
 * AgentRegistry unit tests
 */

import { describe, it, expect } from "vitest";
import { AgentRegistry } from "../../cell/AgentRegistry.js";
import { MockLLMAdapter } from "../../../../adapters/src/llm/mock-adapter";
import { OboraError } from "../../_legacy/workflow/index.js";

function makeRegistry() {
  return new AgentRegistry({ llm: new MockLLMAdapter() });
}

describe("AgentRegistry.resolve — valid roles", () => {
  it.each([
    "analyst",
    "executor",
    "verifier",
    "director",
    "architect",
    "developer",
    "reviewer",
    "planner",
  ])("should resolve '%s' to a BaseAgent", async (name) => {
    const registry = makeRegistry();
    const agent = await registry.resolve(name);
    expect(agent).toBeDefined();
  });

  it("should map TASK-053/054 aliases to runtime roles", async () => {
    const registry = makeRegistry();
    expect((await registry.resolve("architect")).role).toBe("analyst");
    expect((await registry.resolve("developer")).role).toBe("executor");
    expect((await registry.resolve("reviewer")).role).toBe("verifier");
    expect((await registry.resolve("planner")).role).toBe("director");
  });

  it("should be case-insensitive", async () => {
    const registry = makeRegistry();
    expect((await registry.resolve("Architect")).role).toBe("analyst");
    expect((await registry.resolve("DEVELOPER")).role).toBe("executor");
    expect((await registry.resolve("Reviewer")).role).toBe("verifier");
    expect((await registry.resolve("PLANNER")).role).toBe("director");
  });
});

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
});

describe("AgentRegistry.has", () => {
  it("should return true for valid agent names", () => {
    const registry = makeRegistry();
    expect(registry.has("analyst")).toBe(true);
    expect(registry.has("architect")).toBe(true);
    expect(registry.has("Planner")).toBe(true);
  });

  it("should return false for unknown agent names", () => {
    const registry = makeRegistry();
    expect(registry.has("unknown")).toBe(false);
    expect(registry.has("")).toBe(false);
  });
});

describe("AgentRegistry.listAvailable", () => {
  it("should include both legacy and TASK-053/054 names", () => {
    const registry = makeRegistry();
    const available = registry.listAvailable();
    expect(available).toEqual([
      "analyst",
      "executor",
      "verifier",
      "director",
      "architect",
      "developer",
      "reviewer",
      "planner",
    ]);
  });
});

describe("AgentRegistry as AgentResolver", () => {
  it("should satisfy AgentResolver interface contract", async () => {
    const registry = makeRegistry();
    const agent = await registry.resolve("architect");
    expect(typeof agent.execute).toBe("function");
  });
});
