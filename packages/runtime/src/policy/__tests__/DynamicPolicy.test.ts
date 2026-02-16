import { describe, expect, it } from "vitest";
import type { AuditEvent } from "../../audit/types.js";
import { __internal as dynamicQuotaInternal, evaluateDynamicResourceDecision } from "../DynamicQuotaEvaluator.js";
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
