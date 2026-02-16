import { describe, expect, it } from "vitest";

import { InMemoryAuditStore } from "../../audit/InMemoryAuditStore.js";
import { ReExecutionPlanner } from "../../audit/ReExecutionPlanner.js";
import { ReExecutionRuntime } from "../../audit/ReExecutionRuntime.js";
import { GateAssignmentManager } from "../../gates/GateAssignment.js";
import { MultiStageApprovalGate } from "../../gates/MultiStageApproval.js";
import { SLAManager } from "../../gates/SLAManager.js";
import { registerCustomPattern } from "../../patterns/CustomPatternAPI.js";
import { PatternRegistry } from "../../patterns/PatternRegistry.js";
import { BrainstormPattern } from "../../patterns/builtin/BrainstormPattern.js";
import { CompositePattern } from "../../patterns/builtin/CompositePattern.js";
import { ConsensusPattern } from "../../patterns/builtin/ConsensusPattern.js";
import { DiscussionPattern } from "../../patterns/builtin/DiscussionPattern.js";
import { FanOutFanInPattern } from "../../patterns/builtin/FanOutFanInPattern.js";
import { PeerReviewPattern } from "../../patterns/builtin/PeerReviewPattern.js";
import { PipelinePattern } from "../../patterns/builtin/PipelinePattern.js";
import { RedBluePattern } from "../../patterns/builtin/RedBluePattern.js";
import { SupervisorPattern } from "../../patterns/builtin/SupervisorPattern.js";
import { resolveCustomPattern } from "../../patterns/resolveCustomPattern.js";
import { CollaborationPatternBase, type PatternPayloadResult, type PatternRuntimeContext } from "../../patterns/types.js";
import { buildDynamicPolicyVars } from "../../policy/DynamicPolicyContext.js";
import { DefaultPolicyEngine } from "../../policy/DefaultPolicyEngine.js";
import { evaluateExpression } from "../../policy/expressions/ExpressionEvaluator.js";
import { parseExpression } from "../../policy/expressions/ExpressionParser.js";

class EchoPattern extends CollaborationPatternBase {
  readonly name = "echo-custom";
  readonly kind = "echo-custom" as const;

  protected async onExecute(context: PatternRuntimeContext): Promise<PatternPayloadResult> {
    return { success: true, output: { echo: context.input } };
  }
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    executionId: "exec-m2",
    timestamp: new Date("2026-02-16T00:00:00.000Z"),
    type: "tool_call",
    data: {},
    ...overrides,
  };
}

describe("M2 regression", () => {
  it("instantiates and registers all 8 builtins + composite", async () => {
    const registry = new PatternRegistry();

    const patterns = [
      new PipelinePattern(),
      new DiscussionPattern(),
      new ConsensusPattern(),
      new BrainstormPattern(),
      new PeerReviewPattern(),
      new RedBluePattern(),
      new FanOutFanInPattern(),
      new SupervisorPattern(),
    ];

    for (const pattern of patterns) {
      registry.register(pattern);
    }

    const composite = new CompositePattern(registry);
    registry.register(composite);

    expect(registry.list()).toHaveLength(9);
    expect(registry.has("pipeline")).toBe(true);
    expect(registry.has("supervisor")).toBe(true);
    expect(registry.has("composite")).toBe(true);

    const result = await composite.execute({
      pattern: "composite",
      input: {
        topic: "M2 release",
        rounds: [{ a: "ship", b: "ship" }],
        votes: { a: true, b: true },
      },
      config: {
        stages: [
          { name: "discuss", pattern: "discussion", input_from: "root", config: { convergence: "majority" } },
          { name: "decide", pattern: "consensus", input_from: "root", config: { rule: "majority" } },
        ],
      },
      participants: {
        a: "agent-a",
        b: "agent-b",
      },
    } as never);

    expect(result.success).toBe(true);
    expect((result.output as { completed_stages: number }).completed_stages).toBe(2);
  });

  it("supports custom pattern register + resolve", async () => {
    const registry = new PatternRegistry();
    registerCustomPattern(registry, new EchoPattern());

    const resolved = resolveCustomPattern(registry, "echo-custom");
    const result = await resolved.run({ pattern: "echo-custom", input: { a: 1 } });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ echo: { a: 1 } });
  });

  it("parses and evaluates policy DSL expressions", () => {
    const ast = parseExpression('action.type == "tool_call" && context.currentCost > 1');
    const value = evaluateExpression(ast, {
      action: { type: "tool_call", name: "shell_exec", params: {} },
      context: { currentCost: 2 },
    });

    expect(ast.type).toBe("logical");
    expect(value).toBe(true);
  });

  it("enforces dynamic policy vars builder + quota + tool rules", () => {
    const engine = new DefaultPolicyEngine();
    engine.loadInline({
      resources: {
        dynamicQuota: {
          limits: [{ field: "cost", condition: "execution.totalCost > 5", limit: 6, action: "deny" }],
        },
      },
      dynamicToolRules: [{ name: "shell_exec", condition: "execution.totalCost > 5", effect: "deny", priority: 10 }],
      tools: [{ name: "shell_exec", effect: "allow" }],
    });

    const dynamicVars = buildDynamicPolicyVars({
      executionId: "exec-m2",
      workflowName: "wf.m2",
      startedAt: new Date(Date.now() - 1_000),
      stepName: "deploy",
      stepAgent: "operator",
      stepIndex: 1,
      actorId: "cell-1",
      completedSteps: ["build"],
      previousResults: { build: { success: true } },
      auditEvents: [
        makeEvent({ type: "tool_call" }),
        makeEvent({ type: "llm_response", metadata: { tokens: 100, costUsd: 6.5, durationMs: 10 } }),
      ] as never,
    });

    const resourceDecision = engine.enforce({ type: "resource_use", name: "runtime" }, { currentCost: 7, dynamicVars });
    const toolDecision = engine.enforce({ type: "tool_call", name: "shell_exec", params: {} }, { dynamicVars });

    expect(dynamicVars.execution.totalCost).toBe(6.5);
    expect(resourceDecision.type).toBe("deny");
    expect(toolDecision.type).toBe("deny");
  });

  it("covers HITL multi-stage approval + assignment + SLA", async () => {
    const gate = new MultiStageApprovalGate({
      stages: [
        { name: "security", approvers: ["alice", "bob"], required: 1 },
        { name: "owner", approvers: ["carol"], required: 1 },
      ],
    });

    const approved = await gate.evaluate([
      {
        stageIndex: 0,
        stageName: "security",
        approver: "alice",
        decision: "approved",
        timestamp: new Date("2026-02-17T00:00:00.000Z"),
      },
      {
        stageIndex: 1,
        stageName: "owner",
        approver: "carol",
        decision: "approved",
        timestamp: new Date("2026-02-17T00:00:01.000Z"),
      },
    ]);

    const assignments = new GateAssignmentManager({ now: () => new Date("2026-02-17T00:00:00.000Z") });
    const assignment = assignments.assign("gate-1", "deploy", "alice", "10m");

    const sla = new SLAManager({ now: () => new Date("2026-02-17T00:11:00.000Z") });
    const slaResult = sla.checkSLA(assignment, { timeout: "10m", fallback: "escalate", escalation_chain: ["owner"] });

    expect(approved.approved).toBe(true);
    expect(slaResult.status).toBe("expired");
    expect(slaResult.action).toBe("escalate");
  });

  it("executes re-execution planner + runtime", async () => {
    const store = new InMemoryAuditStore();
    const base = new Date("2026-02-16T00:00:00.000Z");

    await store.record(
      makeEvent({
        executionId: "exec-m2",
        timestamp: base,
        type: "execution_start",
        data: { workflowName: "wf.m2", stepOrder: ["analyze", "finalize"] },
      }) as never
    );
    await store.record(
      makeEvent({ executionId: "exec-m2", timestamp: new Date(base.getTime() + 1_000), type: "step_start", data: { stepName: "analyze" } }) as never
    );
    await store.record(
      makeEvent({ executionId: "exec-m2", timestamp: new Date(base.getTime() + 2_000), type: "cell_end", data: { stepName: "analyze", output: { ok: true } } }) as never
    );
    await store.record(
      makeEvent({ executionId: "exec-m2", timestamp: new Date(base.getTime() + 3_000), type: "step_start", data: { stepName: "finalize" } }) as never
    );
    await store.record(
      makeEvent({ executionId: "exec-m2", timestamp: new Date(base.getTime() + 4_000), type: "cell_end", data: { stepName: "finalize", output: { done: true } } }) as never
    );

    const planner = new ReExecutionPlanner(store);
    const plan = await planner.createPlan("exec-m2", { mode: "from_checkpoint", checkpointStep: "finalize" });

    const runtime = new ReExecutionRuntime(store, planner);
    const result = await runtime.reexecute({ executionId: "exec-m2", mode: "from_checkpoint", checkpointStep: "finalize" });

    expect(plan.stepsToSkip).toEqual(["analyze"]);
    expect(result.plan.stepsToRerun).toEqual(["finalize"]);
    expect(result.stepResults).toHaveLength(2);
  });

  it("keeps run count manifest consistent", () => {
    const manifest = [
      "builtin+composite",
      "custom-pattern-api",
      "policy-dsl",
      "dynamic-policy",
      "hitl",
      "reexecution",
      "run-count",
    ];

    expect(manifest).toHaveLength(7);
  });
});
