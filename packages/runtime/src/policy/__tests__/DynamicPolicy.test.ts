import { describe, expect, it } from "vitest";
import type { AuditEvent } from "../../audit/types.js";
import {
  __internal as dynamicQuotaInternal,
  evaluateDynamicResourceDecision,
  getEffectiveStaticLimit,
  getStaticReason,
  getStaticRulePath,
} from "../DynamicQuotaEvaluator.js";
import { buildDynamicPolicyVars } from "../DynamicPolicyContext.js";
import { __internal as dynamicToolInternal, resolveDynamicToolRule } from "../DynamicToolPolicy.js";
import { DefaultPolicyEngine } from "../DefaultPolicyEngine.js";

function makeAuditEvent(partial: Partial<AuditEvent>): AuditEvent {
  return {
    id: partial.id ?? `evt-${Math.random()}`,
    executionId: partial.executionId ?? "exec-1",
    timestamp: partial.timestamp ?? new Date(),
    type: partial.type ?? "tool_call",
    data: partial.data ?? {},
    metadata: partial.metadata,
    cellId: partial.cellId,
  };
}

describe("Dynamic policy", () => {
  it("builds DynamicPolicyVars from audit and execution context", () => {
    const startedAt = new Date(Date.now() - 1000);
    const vars = buildDynamicPolicyVars({
      executionId: "exec-1",
      workflowName: "wf",
      startedAt,
      stepName: "deploy",
      stepAgent: "devops",
      stepIndex: 2,
      actorId: "cell-1",
      actorRole: "operator",
      state: { env: "prod" },
      completedSteps: ["build", "test"],
      previousResults: { build: { success: true, output: { artifact: "a" } } },
      auditEvents: [
        makeAuditEvent({ type: "error" }),
        makeAuditEvent({ type: "recovery_start" }),
        makeAuditEvent({ type: "tool_call" }),
        makeAuditEvent({ type: "tool_call" }),
        makeAuditEvent({ type: "llm_response", metadata: { tokens: 100, costUsd: 1.2, durationMs: 40 } }),
        makeAuditEvent({ type: "llm_response", metadata: { tokens: 50, costUsd: 0.3, durationMs: 60 } }),
      ],
    });

    expect(vars.execution.id).toBe("exec-1");
    expect(vars.execution.totalTokens).toBe(150);
    expect(vars.execution.totalCost).toBe(1.5);
    expect(vars.execution.totalToolCalls).toBe(2);
    expect(vars.metrics.errorCount).toBe(1);
    expect(vars.metrics.retryCount).toBe(1);
    expect(vars.metrics.avgStepDurationMs).toBe(50);
    expect(vars.metrics.maxStepDurationMs).toBe(60);
    expect(vars.step.name).toBe("deploy");
    expect(vars.actor.id).toBe("cell-1");
  });

  it("activates dynamic quota condition and denies", () => {
    const engine = new DefaultPolicyEngine();
    engine.loadInline({
      resources: {
        maxCostUsd: 100,
        dynamicQuota: {
          limits: [
            {
              field: "cost",
              condition: "execution.totalCost > 5",
              limit: 6,
              action: "deny",
            },
          ],
        },
      },
    });

    const decision = engine.enforce(
      { type: "resource_use", name: "runtime" },
      {
        currentCost: 10,
        dynamicVars: {
          execution: {
            id: "exec-1",
            workflowName: "wf",
            startedAt: new Date(),
            elapsedMs: 100,
            totalTokens: 0,
            totalCost: 10,
            totalToolCalls: 0,
            completedSteps: [],
          },
          step: { name: "deploy", agent: "agent", index: 1 },
          actor: { id: "cell" },
          state: {},
          metrics: { errorCount: 0, retryCount: 0, avgStepDurationMs: 0, maxStepDurationMs: 0 },
          previousResults: {},
        },
      },
    );

    expect(decision).toEqual({
      type: "deny",
      reason: "Cost limit exceeded",
      rule: "resources.dynamic.cost",
    });
  });

  it("denies when dynamic quota condition evaluation fails", () => {
    const engine = new DefaultPolicyEngine();
    engine.loadInline({
      resources: {
        dynamicQuota: {
          limits: [
            {
              field: "cost",
              condition: 'matches(execution.workflowName, "(")',
              limit: 1,
              action: "deny",
            },
          ],
        },
      },
    });

    const decision = engine.enforce(
      { type: "resource_use", name: "runtime" },
      {
        currentCost: 10,
        dynamicVars: {
          execution: {
            id: "exec-1",
            workflowName: "wf",
            startedAt: new Date(),
            elapsedMs: 100,
            totalTokens: 0,
            totalCost: 10,
            totalToolCalls: 0,
            completedSteps: [],
          },
          step: { name: "deploy", agent: "agent", index: 1 },
          actor: { id: "cell" },
          state: {},
          metrics: { errorCount: 0, retryCount: 0, avgStepDurationMs: 0, maxStepDurationMs: 0 },
          previousResults: {},
        },
      },
    );

    expect(decision).toMatchObject({
      type: "deny",
      rule: "dynamic-quota",
    });
    expect((decision as { reason: string }).reason).toContain("dynamic quota condition evaluation failed:");
  });

  it("resolves dynamic tool rules by priority and deny-first tie", () => {
    const engine = new DefaultPolicyEngine();
    engine.loadInline({
      dynamicToolRules: [
        { name: "shell_exec", condition: "execution.totalCost > 5", effect: "allow", priority: 10 },
        { name: "shell_exec", condition: "execution.totalCost > 5", effect: "deny", priority: 10 },
      ],
      tools: [{ name: "shell_exec", effect: "allow" }],
    });

    const decision = engine.enforce(
      { type: "tool_call", name: "shell_exec", params: { command: "rm -rf /" } },
      {
        dynamicVars: {
          execution: {
            id: "exec-1",
            workflowName: "wf",
            startedAt: new Date(),
            elapsedMs: 100,
            totalTokens: 0,
            totalCost: 9,
            totalToolCalls: 0,
            completedSteps: [],
          },
          step: { name: "deploy", agent: "agent", index: 1 },
          actor: { id: "cell" },
          state: {},
          metrics: { errorCount: 0, retryCount: 0, avgStepDurationMs: 0, maxStepDurationMs: 0 },
          previousResults: {},
        },
      },
    );

    expect(decision).toMatchObject({ type: "deny", rule: "dynamicTools.shell_exec" });
  });

  it("denies when dynamic tool rule evaluation fails", () => {
    const engine = new DefaultPolicyEngine();
    engine.loadInline({
      dynamicToolRules: [
        { name: "shell_exec", condition: 'matches(action.name, "(")', effect: "deny", priority: 10 },
      ],
      tools: [{ name: "shell_exec", effect: "allow" }],
    });

    const decision = engine.enforce(
      { type: "tool_call", name: "shell_exec", params: {} },
      {
        dynamicVars: {
          execution: {
            id: "exec-1",
            workflowName: "wf",
            startedAt: new Date(),
            elapsedMs: 100,
            totalTokens: 0,
            totalCost: 0,
            totalToolCalls: 0,
            completedSteps: [],
          },
          step: { name: "deploy", agent: "agent", index: 1 },
          actor: { id: "cell" },
          state: {},
          metrics: { errorCount: 0, retryCount: 0, avgStepDurationMs: 0, maxStepDurationMs: 0 },
          previousResults: {},
        },
      },
    );

    expect(decision).toMatchObject({
      type: "deny",
      rule: "shell_exec",
    });
    expect((decision as { reason: string }).reason).toContain("dynamic tool rule condition evaluation failed:");
  });

  it("evicts old expression cache entries at max size", () => {
    dynamicQuotaInternal.clearExpressionCache();
    dynamicToolInternal.clearExpressionCache();

    const action = { type: "resource_use", name: "runtime" } as const;
    const context = { currentCost: 0 };

    for (let i = 0; i < 1001; i += 1) {
      evaluateDynamicResourceDecision(
        {
          dynamicQuota: {
            limits: [{ field: "cost", condition: `context.currentCost >= ${i}`, limit: 9999, action: "deny" }],
          },
        },
        action,
        context,
      );
    }

    expect(dynamicQuotaInternal.getExpressionCacheSize()).toBe(1000);

    for (let i = 0; i < 1001; i += 1) {
      resolveDynamicToolRule(
        { type: "tool_call", name: "shell_exec", params: {} },
        {},
        [{ name: "shell_exec", condition: `context.currentCost >= ${i}`, effect: "allow" }],
      );
    }

    expect(dynamicToolInternal.getExpressionCacheSize()).toBe(1000);
  });

  it("pins snapshot per execution and keeps enforcement stable after reload", () => {
    const events: unknown[] = [];
    const engine = new DefaultPolicyEngine(undefined, {
      onAuditEvent: (event) => {
        events.push(event);
      },
    });

    engine.loadInline({ version: "v1", tools: [{ name: "shell_exec", effect: "deny" }] });
    const pinned = engine.pinForExecution("exec-1");

    engine.loadInline({ version: "v2", tools: [{ name: "shell_exec", effect: "allow" }] });

    const pinnedDecision = engine.enforce(
      { type: "tool_call", name: "shell_exec", params: { command: "ls" } },
      { executionId: "exec-1" },
    );
    const freshDecision = engine.enforce(
      { type: "tool_call", name: "shell_exec", params: { command: "ls" } },
      { executionId: "exec-2" },
    );

    expect(pinned.version.version).toBe("v1");
    expect(engine.getPinnedSnapshot("exec-1")?.version.version).toBe("v1");
    expect(pinnedDecision.type).toBe("deny");
    expect(freshDecision.type).toBe("allow");
    expect(events).toContainEqual({ type: "policy_snapshot_pinned", executionId: "exec-1", version: "v1" });

    engine.unpinExecution("exec-1");
    expect(engine.getPinnedSnapshot("exec-1")).toBeUndefined();
  });
});

describe("Dynamic policy - P2 補強", () => {
  const baseDynamicVars = {
    execution: {
      id: "exec-1",
      workflowName: "wf",
      startedAt: new Date(),
      elapsedMs: 100,
      totalTokens: 0,
      totalCost: 10,
      totalToolCalls: 0,
      completedSteps: [],
    },
    step: { name: "deploy", agent: "agent", index: 1 },
    actor: { id: "cell" },
    state: {},
    metrics: { errorCount: 0, retryCount: 0, avgStepDurationMs: 0, maxStepDurationMs: 0 },
    previousResults: {},
  };

  it("warn action returns allow with warning metadata (not gate)", () => {
    const engine = new DefaultPolicyEngine();
    engine.loadInline({
      resources: {
        dynamicQuota: {
          limits: [
            {
              field: "cost",
              condition: "execution.totalCost > 5",
              limit: 6,
              action: "warn",
            },
          ],
        },
      },
    });

    const decision = engine.enforce(
      { type: "resource_use", name: "runtime" },
      { currentCost: 10, dynamicVars: baseDynamicVars },
    );

    expect(decision.type).toBe("allow");
    expect((decision as { warning?: unknown }).warning).toMatchObject({
      reason: expect.stringContaining("Cost limit exceeded"),
      rule: "resources.dynamic.cost",
      field: "cost",
      limit: 6,
      current: 10,
    });
  });

  it("gate action still returns gate decision", () => {
    const engine = new DefaultPolicyEngine();
    engine.loadInline({
      resources: {
        dynamicQuota: {
          limits: [
            {
              field: "cost",
              condition: "execution.totalCost > 5",
              limit: 6,
              action: "gate",
            },
          ],
        },
      },
    });

    const decision = engine.enforce(
      { type: "resource_use", name: "runtime" },
      { currentCost: 10, dynamicVars: baseDynamicVars },
    );

    expect(decision.type).toBe("gate");
  });

  it("evaluates every dynamic quota field and returns static metadata mappings", () => {
    const action = { type: "resource_use", name: "runtime" } as const;
    const policy = {
      maxTokens: 10,
      maxCostUsd: 5,
      maxToolCalls: 2,
      timeoutMs: 100,
      dynamicQuota: {
        limits: [
          { field: "tokens" as const, condition: "context.currentTokens > 0", limit: 10, action: "deny" as const },
          { field: "tool_calls" as const, condition: "context.currentToolCalls > 0", limit: 1, action: "warn" as const },
          { field: "duration_ms" as const, condition: "context.currentDurationMs > 0", limit: 50, action: "gate" as const },
        ],
      },
    };
    const policyFor = (index: number) => ({
      ...policy,
      dynamicQuota: { limits: [policy.dynamicQuota.limits[index]!] },
    });

    expect(evaluateDynamicResourceDecision(policyFor(0), action, { currentTokens: 11 })).toMatchObject({
      type: "deny",
      reason: "Token limit exceeded",
      rule: "resources.dynamic.tokens",
    });
    expect(evaluateDynamicResourceDecision(policyFor(1), action, { currentToolCalls: 2 })).toMatchObject({
      type: "allow",
      warning: {
        reason: "Tool call limit exceeded (dynamic)",
        rule: "resources.dynamic.tool_calls",
        field: "tool_calls",
        limit: 1,
        current: 2,
      },
    });
    expect(evaluateDynamicResourceDecision(policyFor(2), action, { currentDurationMs: 51 })).toMatchObject({
      type: "gate",
      gateType: "human-approval",
      config: {
        reason: "Timeout exceeded (dynamic)",
        rule: "resources.dynamic.duration_ms",
        field: "duration_ms",
        current: 51,
      },
    });
    expect(evaluateDynamicResourceDecision(policyFor(0), action, { currentTokens: 0 })).toBeNull();
    expect(
      (["tokens", "cost", "tool_calls", "duration_ms"] as const).map((field) => ({
        field,
        limit: getEffectiveStaticLimit(policy, field),
        rule: getStaticRulePath(field),
        reason: getStaticReason(field),
      })),
    ).toEqual([
      { field: "tokens", limit: 10, rule: "resources.maxTokens", reason: "Token limit exceeded" },
      { field: "cost", limit: 5, rule: "resources.maxCostUsd", reason: "Cost limit exceeded" },
      { field: "tool_calls", limit: 2, rule: "resources.maxToolCalls", reason: "Tool call limit exceeded" },
      { field: "duration_ms", limit: 100, rule: "resources.timeoutMs", reason: "Timeout exceeded" },
    ]);
  });

  it("dynamic tool rule with gate config uses rule.gate fields", () => {
    const engine = new DefaultPolicyEngine();
    engine.loadInline({
      dynamicToolRules: [
        {
          name: "shell_exec",
          condition: "execution.totalCost > 0",
          effect: "gate" as const,
          priority: 10,
          gate: { type: "consensus" as const, timeout: "30s" },
        },
      ],
      tools: [{ name: "shell_exec", effect: "allow" }],
    });

    const decision = engine.enforce(
      { type: "tool_call", name: "shell_exec", params: {} },
      { dynamicVars: baseDynamicVars },
    );

    expect(decision).toMatchObject({
      type: "gate",
      gateType: "consensus",
      config: { timeout: "30s" },
    });
  });

  it("dynamic tool rule with transform config uses rule.transformFn", () => {
    const engine = new DefaultPolicyEngine();
    engine.loadInline({
      dynamicToolRules: [
        {
          name: "shell_exec",
          condition: "execution.totalCost > 0",
          effect: "transform" as const,
          priority: 10,
          transformFn: "sanitize_command",
        },
      ],
      tools: [{ name: "shell_exec", effect: "allow" }],
    });

    const decision = engine.enforce(
      { type: "tool_call", name: "shell_exec", params: { cmd: "ls" } },
      { dynamicVars: baseDynamicVars },
    );

    expect(decision).toMatchObject({
      type: "transform",
      transformFn: "sanitize_command",
    });
  });

  it("compareDynamicRules returns stable order for equal priority and effect", () => {
    const engine = new DefaultPolicyEngine();
    // Two allow rules with same priority - first declared should win
    engine.loadInline({
      dynamicToolRules: [
        { name: "shell_exec", condition: "execution.totalCost >= 0", effect: "allow", priority: 5 },
        { name: "shell_exec", condition: "execution.totalCost >= 0", effect: "deny", priority: 10 },
        { name: "shell_exec", condition: "execution.totalCost >= 0", effect: "allow", priority: 5 },
      ],
      tools: [{ name: "shell_exec", effect: "allow" }],
    });

    // Higher priority deny (10) wins
    const decision = engine.enforce(
      { type: "tool_call", name: "shell_exec", params: {} },
      { dynamicVars: baseDynamicVars },
    );
    expect(decision.type).toBe("deny");
  });

  it("stable tie-break: same priority same effect preserves declaration order", () => {
    // Use transformFn to distinguish otherwise-identical rules
    const result = resolveDynamicToolRule(
      { type: "tool_call", name: "t", params: {} },
      { dynamicVars: baseDynamicVars },
      [
        { name: "t", condition: "execution.totalCost >= 0", effect: "transform" as const, priority: 5, transformFn: "first_declared" },
        { name: "t", condition: "execution.totalCost >= 0", effect: "transform" as const, priority: 5, transformFn: "second_declared" },
      ],
    );

    // The first rule (index 0) should win due to stable tie-break
    expect(result.matchedRule).toBeDefined();
    expect(result.matchedRule!.effect).toBe("transform");
    expect(result.matchedRule!.transformFn).toBe("first_declared");
  });
});

// --- Loader normalization regression tests (M2-12) ---
import { normalizePolicySet } from "../PolicyLoader.js";

describe("PolicyLoader.normalizeDynamicToolRule preserves all fields", () => {
  it("preserves transformFn through normalization", () => {
    const policy = normalizePolicySet({
      dynamicToolRules: [
        { name: "shell_exec", condition: "execution.totalCost > 5", effect: "transform", priority: 10, transformFn: "sanitize_command" },
      ],
    });

    expect(policy.dynamicToolRules).toHaveLength(1);
    expect(policy.dynamicToolRules![0].transformFn).toBe("sanitize_command");
    expect(policy.dynamicToolRules![0].effect).toBe("transform");
    expect(policy.dynamicToolRules![0].priority).toBe(10);
  });

  it("preserves gate.type and gate.timeout through normalization", () => {
    const policy = normalizePolicySet({
      dynamicToolRules: [
        { name: "deploy", condition: "step.name == 'deploy'", effect: "gate", gate: { type: "consensus", timeout: "30s" } },
      ],
    });

    expect(policy.dynamicToolRules).toHaveLength(1);
    expect(policy.dynamicToolRules![0].gate).toEqual({ type: "consensus", timeout: "30s" });
  });

  it("preserves gate without timeout", () => {
    const policy = normalizePolicySet({
      dynamicToolRules: [
        { name: "x", condition: "true", effect: "gate", gate: { type: "human-approval" } },
      ],
    });

    expect(policy.dynamicToolRules![0].gate).toEqual({ type: "human-approval", timeout: undefined });
  });

  it("rejects invalid transformFn type", () => {
    expect(() => normalizePolicySet({
      dynamicToolRules: [
        { name: "x", condition: "true", effect: "transform", transformFn: 123 },
      ],
    })).toThrow("transformFn: expected non-empty string");
  });

  it("rejects invalid gate.type", () => {
    expect(() => normalizePolicySet({
      dynamicToolRules: [
        { name: "x", condition: "true", effect: "gate", gate: { type: "invalid" } },
      ],
    })).toThrow("gate.type");
  });

  it("rejects non-object gate", () => {
    expect(() => normalizePolicySet({
      dynamicToolRules: [
        { name: "x", condition: "true", effect: "gate", gate: "string" },
      ],
    })).toThrow("gate: expected object");
  });

  it("loader-created rules carry fields to runtime enforcement", () => {
    const policy = normalizePolicySet({
      tools: [{ name: "shell_exec", effect: "allow" }],
      dynamicToolRules: [
        { name: "shell_exec", condition: "execution.totalCost > 0", effect: "gate", priority: 10, gate: { type: "consensus", timeout: "30s" } },
      ],
    });

    const engine = new DefaultPolicyEngine();
    engine.loadInline(policy);

    const decision = engine.enforce(
      { type: "tool_call", name: "shell_exec", params: {} },
      { dynamicVars: {
        execution: { id: "e", workflowName: "w", startedAt: new Date(), elapsedMs: 0, totalTokens: 0, totalCost: 10, totalToolCalls: 0, completedSteps: [] },
        step: { name: "s", agent: "a", index: 0 },
        actor: { id: "c" },
        state: {},
        metrics: { errorCount: 0, retryCount: 0, avgStepDurationMs: 0, maxStepDurationMs: 0 },
        previousResults: {},
      }},
    );

    expect(decision).toMatchObject({ type: "gate", gateType: "consensus", config: { timeout: "30s" } });
  });
});

// --- Loader-path transform E2E regression (M2-12 closure) ---
describe("PolicyLoader transform E2E regression", () => {
  it("normalizePolicySet -> loadInline -> enforce preserves transformFn in final decision", () => {
    const policy = normalizePolicySet({
      tools: [{ name: "shell_exec", effect: "allow" }],
      dynamicToolRules: [
        { name: "shell_exec", condition: "execution.totalCost > 0", effect: "transform", priority: 10, transformFn: "sanitize_command" },
      ],
    });

    // Verify normalization kept transformFn
    expect(policy.dynamicToolRules![0].transformFn).toBe("sanitize_command");

    const engine = new DefaultPolicyEngine();
    engine.loadInline(policy);

    const decision = engine.enforce(
      { type: "tool_call", name: "shell_exec", params: { cmd: "rm -rf /" } },
      { dynamicVars: {
        execution: { id: "e", workflowName: "w", startedAt: new Date(), elapsedMs: 0, totalTokens: 0, totalCost: 10, totalToolCalls: 0, completedSteps: [] },
        step: { name: "s", agent: "a", index: 0 },
        actor: { id: "c" },
        state: {},
        metrics: { errorCount: 0, retryCount: 0, avgStepDurationMs: 0, maxStepDurationMs: 0 },
        previousResults: {},
      }},
    );

    expect(decision).toMatchObject({ type: "transform", transformFn: "sanitize_command" });
  });
});
