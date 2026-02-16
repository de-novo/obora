import { describe, expect, it } from "vitest";
import { GateRule, ResourceRule, SandboxRule, ToolRule } from "../rules/index.js";
import type { PolicySet } from "../types.js";

const policySet: PolicySet = {
  tools: [
    {
      name: "shell_exec",
      effect: "deny",
      when: { matches: ["rm -rf"] },
    },
    {
      name: "file_write",
      effect: "transform",
      transform: { fn: "sanitizeFileWrite" },
    },
    {
      name: "dangerous_tool",
      effect: "gate",
      gate: { type: "human-approval", timeout: "5m" },
    },
  ],
  sandbox: {
    root: "./output",
    denyOutsideRoot: true,
    denyPatterns: ["secrets"],
  },
  resources: {
    timeoutMs: 100,
    maxTokens: 10,
    maxCostUsd: 1,
    maxToolCalls: 2,
  },
  gates: [
    {
      step: "deploy",
      type: "consensus",
      required: true,
      timeout: "10m",
      fallback: "escalate",
    },
  ],
};

describe("policy rules", () => {
  it("ToolRule handles deny/transform/gate", () => {
    const rule = new ToolRule();

    const denied = rule.evaluate(
      { type: "tool_call", name: "shell_exec", params: { command: "rm -rf ./tmp" } },
      {},
      policySet,
    );

    const transformed = rule.evaluate(
      { type: "tool_call", name: "file_write", params: { path: "./output/a.txt" } },
      {},
      policySet,
    );

    const gated = rule.evaluate(
      { type: "tool_call", name: "dangerous_tool", params: { payload: "x" } },
      {},
      policySet,
    );

    expect(denied).toEqual({
      type: "deny",
      reason: "Tool call denied for shell_exec",
      rule: "tools.shell_exec",
    });
    expect(transformed).toEqual({
      type: "transform",
      original: { path: "./output/a.txt" },
      transformed: {
        params: { path: "./output/a.txt" },
        transform: "sanitizeFileWrite",
      },
      rule: "tools.file_write",
      transformFn: "sanitizeFileWrite",
    });
    expect(gated).toEqual({
      type: "gate",
      gateType: "human-approval",
      config: {
        tool: "dangerous_tool",
        timeout: "5m",
        rule: "tools.dangerous_tool",
      },
    });
  });

  it("SandboxRule denies out-of-root and denied patterns", () => {
    const rule = new SandboxRule();

    const outside = rule.evaluate(
      { type: "file_access", name: "file_read", params: { path: "../outside.txt" } },
      {},
      policySet,
    );
    const blockedPattern = rule.evaluate(
      { type: "file_access", name: "file_read", params: { path: "./output/secrets/token.txt" } },
      {},
      policySet,
    );

    expect(outside?.type).toBe("deny");
    expect(outside).toMatchObject({ rule: "sandbox.denyOutsideRoot" });
    expect(blockedPattern).toEqual({
      type: "deny",
      reason: "File path blocked by sandbox pattern: secrets",
      rule: "sandbox.denyPatterns",
    });
  });

  it("ResourceRule enforces all resource ceilings", () => {
    const rule = new ResourceRule();

    expect(
      rule.evaluate({ type: "resource_use", name: "runtime" }, { currentDurationMs: 101 }, policySet),
    ).toEqual({ type: "deny", reason: "Timeout exceeded", rule: "resources.timeoutMs" });

    expect(rule.evaluate({ type: "resource_use", name: "runtime" }, { currentTokens: 11 }, policySet)).toEqual({
      type: "deny",
      reason: "Token limit exceeded",
      rule: "resources.maxTokens",
    });

    expect(rule.evaluate({ type: "resource_use", name: "runtime" }, { currentCost: 1.1 }, policySet)).toEqual({
      type: "deny",
      reason: "Cost limit exceeded",
      rule: "resources.maxCostUsd",
    });

    expect(rule.evaluate({ type: "resource_use", name: "runtime" }, { currentToolCalls: 3 }, policySet)).toEqual({
      type: "deny",
      reason: "Tool call limit exceeded",
      rule: "resources.maxToolCalls",
    });
  });

  it("GateRule requires gate on matched step", () => {
    const rule = new GateRule();

    const decision = rule.evaluate({ type: "step_start", name: "deploy" }, {}, policySet);

    expect(decision).toEqual({
      type: "gate",
      gateType: "consensus",
      config: {
        step: "deploy",
        timeout: "10m",
        fallback: "escalate",
      },
    });
  });
});
