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

  it("enforces tool/sandbox/resource/gate rules in order", async () => {
    const engine = new DefaultPolicyEngine();
    await engine.load(fixturePath);

    const toolDenied = engine.enforce(
      {
        type: "tool_call",
        name: "shell_exec",
        params: { command: "sudo rm -rf /" },
      },
      {},
    );

    const sandboxDenied = engine.enforce(
      {
        type: "file_access",
        name: "file_read",
        params: { path: "../secrets.txt" },
      },
      {},
    );

    const resourceDenied = engine.enforce(
      {
        type: "resource_use",
        name: "budget",
      },
      {
        currentTokens: 100001,
      },
    );

    const gateDecision = engine.enforce(
      {
        type: "step_start",
        name: "deploy",
      },
      {},
    );

    expect(toolDenied.type).toBe("deny");
    expect(sandboxDenied).toMatchObject({ type: "deny", rule: "sandbox.denyOutsideRoot" });
    expect(resourceDenied).toEqual({
      type: "deny",
      reason: "Token limit exceeded",
      rule: "resources.maxTokens",
    });
    expect(gateDecision).toEqual({
      type: "gate",
      gateType: "human-approval",
      config: {
        step: "deploy",
        timeout: "24h",
        fallback: "escalate",
      },
    });
  });

  it("supports transform and gate tool effects", () => {
    const engine = new DefaultPolicyEngine();
    engine.loadInline({
      tools: [
        { name: "file_write", effect: "transform", transform: { fn: "sanitizeWrite" } },
        { name: "release", effect: "gate", gate: { type: "consensus", timeout: "30m" } },
      ],
    });

    const transformed = engine.enforce({ type: "tool_call", name: "file_write", params: { content: "x" } }, {});
    const gated = engine.enforce({ type: "tool_call", name: "release", params: {} }, {});

    expect(transformed).toEqual({
      type: "transform",
      original: { content: "x" },
      transformed: {
        params: { content: "x" },
        transform: "sanitizeWrite",
      },
      rule: "tools.file_write",
      transformFn: "sanitizeWrite",
    });
    expect(gated).toEqual({
      type: "gate",
      gateType: "consensus",
      config: {
        tool: "release",
        timeout: "30m",
        rule: "tools.release",
      },
    });
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
});
