import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DefaultPolicyEngine } from "../DefaultPolicyEngine.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));

describe("DefaultPolicyEngine", () => {
  const fixturePath = path.resolve(testDir, "fixtures/test-policy.yaml");

  it("loads YAML policy successfully", async () => {
    const engine = new DefaultPolicyEngine();
    await engine.load(fixturePath);

    expect(engine.version()).toBe("1.0");
  });

  it("enforces tool_call allow/deny", async () => {
    const engine = new DefaultPolicyEngine();
    await engine.load(fixturePath);

    const denied = engine.enforce(
      {
        type: "tool_call",
        name: "shell_exec",
        params: { command: "sudo rm -rf /" },
      },
      {},
    );

    const allowed = engine.enforce(
      {
        type: "tool_call",
        name: "file_write",
        params: { path: "./output/a.txt" },
      },
      {},
    );

    expect(denied.type).toBe("deny");
    expect(allowed).toEqual({ type: "allow" });
  });

  it("throws on invalid YAML", async () => {
    const engine = new DefaultPolicyEngine();
    const invalidPath = path.resolve(testDir, "fixtures/invalid-policy.yaml");

    await expect(engine.load(invalidPath)).rejects.toThrow();
  });

  it("allows everything for empty policy", () => {
    const engine = new DefaultPolicyEngine();
    engine.loadInline({});

    const decision = engine.enforce(
      {
        type: "tool_call",
        name: "any_tool",
      },
      {},
    );

    expect(decision).toEqual({ type: "allow" });
  });

  it("uses enforce context for resource limits", () => {
    const engine = new DefaultPolicyEngine();
    engine.loadInline({
      resources: {
        maxTokens: 10,
      },
    });

    const denied = engine.enforce(
      {
        type: "resource_use",
        name: "token-budget",
      },
      {
        currentTokens: 11,
      },
    );

    expect(denied).toEqual({
      type: "deny",
      reason: "Token limit exceeded",
      rule: "resources.maxTokens",
    });
  });
});
