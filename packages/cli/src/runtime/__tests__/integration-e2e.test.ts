/**
 * TASK-043 Integration E2E Tests
 *
 * Validates the full "step(control) → agent(execution) → blackboard(state)"
 * runtime bridge end-to-end.
 *
 * Scenario A: 3-step success workflow with blackboard state propagation
 * Scenario B: failure-recovery with unknown agent (E4003) + graceful fallback
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AgentRegistry } from "../agent-registry.js";
import {
  executeStep,
  stepToTask,
  type AgentResolver,
} from "../step-executor.js";
import {
  createWorkflowBlackboard,
  buildAgentContext,
  recordStepResult,
  recordStepError,
  readStepResult,
  appendHistory,
  setClock,
} from "../context-builder.js";
import { MockLLMAdapter } from "@obora-kit/agents";
import type { ChatMessage } from "@obora-kit/agents";
import type { Step, Workflow } from "@obora/core";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const WORKFLOW: Workflow = {
  name: "e2e-test-workflow",
  version: "2.0",
  mode: "auto",
  steps: [
    { name: "analyze", agent: "analyst", description: "Analyze requirements" },
    {
      name: "execute",
      agent: "executor",
      description: "Execute implementation",
      depends_on: ["analyze"],
    },
    {
      name: "verify",
      agent: "verifier",
      description: "Verify outputs",
      depends_on: ["execute"],
    },
  ],
} as any;

const SESSION_ID = "e2e-session-001";
const FIXED_TIME = "2026-02-14T09:00:00.000Z";

// ---------------------------------------------------------------------------
// Scenario A: Success — 3-step workflow with blackboard state propagation
// ---------------------------------------------------------------------------

describe("E2E Scenario A: success workflow", () => {
  let registry: AgentRegistry;
  let board: ReturnType<typeof createWorkflowBlackboard>;
  let history: ChatMessage[];

  beforeEach(() => {
    setClock(() => FIXED_TIME);
    registry = new AgentRegistry({ llm: new MockLLMAdapter() });
    board = createWorkflowBlackboard(SESSION_ID, WORKFLOW, "e2e-feature");
    history = [];
  });

  afterEach(() => {
    setClock(null);
  });

  it("step 1 (analyze): executes and records on blackboard", async () => {
    const step: Step = WORKFLOW.steps[0];
    const ctx = buildAgentContext(SESSION_ID, board, step, history);

    const result = await executeStep(step, registry, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();

    // Record on blackboard (single-writer: context-builder does this)
    recordStepResult(board, "analyze", result);

    const stored = readStepResult(board, "analyze");
    expect(stored).not.toBeNull();
    expect(stored!.success).toBe(true);
    expect(stored!.completedAt).toBe(FIXED_TIME);

    // Accumulate history
    appendHistory(history, {
      role: "assistant",
      content: `[analyze] ${result.output}`,
    });
    expect(history).toHaveLength(1);
  });

  it("step 2 (execute): reads step 1 result from blackboard", async () => {
    // Simulate step 1 completed
    recordStepResult(board, "analyze", {
      success: true,
      output: "analysis complete",
    });
    appendHistory(history, {
      role: "assistant",
      content: "[analyze] analysis complete",
    });

    const step: Step = WORKFLOW.steps[1];
    const ctx = buildAgentContext(SESSION_ID, board, step, history);

    // Verify step 1 result is readable before step 2 runs
    const priorResult = readStepResult(board, "analyze");
    expect(priorResult).not.toBeNull();
    expect(priorResult!.output).toBe("analysis complete");

    const result = await executeStep(step, registry, ctx);
    expect(result.success).toBe(true);

    recordStepResult(board, "execute", result);
    appendHistory(history, {
      role: "assistant",
      content: `[execute] ${result.output}`,
    });
    expect(history).toHaveLength(2);
  });

  it("full 3-step workflow: blackboard tracks all steps", async () => {
    const steps = WORKFLOW.steps;

    for (const step of steps) {
      const ctx = buildAgentContext(SESSION_ID, board, step, history);
      const result = await executeStep(step, registry, ctx);

      expect(result.success).toBe(true);
      recordStepResult(board, step.name, result);
      appendHistory(history, {
        role: "assistant",
        content: `[${step.name}] ${result.output}`,
      });
    }

    // Verify all 3 steps recorded on blackboard
    for (const step of steps) {
      const stored = readStepResult(board, step.name);
      expect(stored).not.toBeNull();
      expect(stored!.success).toBe(true);
      expect(stored!.completedAt).toBe(FIXED_TIME);
    }

    // Verify history accumulated correctly
    expect(history).toHaveLength(3);
    expect(history[0].content).toContain("[analyze]");
    expect(history[1].content).toContain("[execute]");
    expect(history[2].content).toContain("[verify]");

    // Verify workflow metadata on board
    const meta = board.read<Record<string, unknown>>("state.context.workflow");
    expect(meta.workflowName).toBe("e2e-test-workflow");
    expect(meta.featureName).toBe("e2e-feature");
    expect(meta.sessionId).toBe(SESSION_ID);
  });
});

// ---------------------------------------------------------------------------
// Scenario B: Failure-recovery — unknown agent + graceful handling
// ---------------------------------------------------------------------------

describe("E2E Scenario B: failure-recovery workflow", () => {
  let registry: AgentRegistry;
  let board: ReturnType<typeof createWorkflowBlackboard>;
  let history: ChatMessage[];

  const FAILURE_WORKFLOW: Workflow = {
    name: "failure-test-workflow",
    version: "1.0",
    mode: "auto",
    steps: [
      { name: "analyze", agent: "analyst", description: "Analyze first" },
      {
        name: "bad-step",
        agent: "unknown-agent",
        description: "This should fail",
        depends_on: ["analyze"],
      },
      {
        name: "fallback",
        agent: "verifier",
        description: "Fallback verification",
        depends_on: ["analyze"],
      },
    ],
  } as any;

  beforeEach(() => {
    setClock(() => FIXED_TIME);
    registry = new AgentRegistry({ llm: new MockLLMAdapter() });
    board = createWorkflowBlackboard(
      SESSION_ID,
      FAILURE_WORKFLOW,
      "failure-feature",
    );
    history = [];
  });

  afterEach(() => {
    setClock(null);
  });

  it("step 1 (analyze): succeeds normally", async () => {
    const step = FAILURE_WORKFLOW.steps[0];
    const ctx = buildAgentContext(SESSION_ID, board, step, history);
    const result = await executeStep(step, registry, ctx);

    expect(result.success).toBe(true);
    recordStepResult(board, step.name, result);
    appendHistory(history, {
      role: "assistant",
      content: `[${step.name}] ${result.output}`,
    });
  });

  it("step 2 (bad-step): fails with E4003 for unknown agent", async () => {
    // Setup: step 1 done
    recordStepResult(board, "analyze", {
      success: true,
      output: "done",
    });

    const step = FAILURE_WORKFLOW.steps[1];
    const ctx = buildAgentContext(SESSION_ID, board, step, history);
    const result = await executeStep(step, registry, ctx);

    expect(result.success).toBe(false);
    expect(result.diagnosisCode).toBe("E4003");
    expect(result.error).toContain("Agent resolution failed");

    // Record failure on blackboard
    recordStepError(board, step.name, result);

    const stored = readStepResult(board, "bad-step");
    expect(stored).not.toBeNull();
    expect(stored!.success).toBe(false);
    expect(stored!.diagnosisCode).toBe("E4003");
    expect(stored!.failedAt).toBe(FIXED_TIME);
  });

  it("step 3 (fallback): succeeds despite step 2 failure", async () => {
    // Setup: step 1 done, step 2 failed
    recordStepResult(board, "analyze", {
      success: true,
      output: "analysis ok",
    });
    recordStepError(board, "bad-step", {
      success: false,
      error: "Agent resolution failed for 'unknown-agent'",
      diagnosisCode: "E4003",
    });

    const step = FAILURE_WORKFLOW.steps[2];
    const ctx = buildAgentContext(SESSION_ID, board, step, history);
    const result = await executeStep(step, registry, ctx);

    expect(result.success).toBe(true);
    recordStepResult(board, step.name, result);
  });

  it("full failure scenario: blackboard shows success/fail/success pattern", async () => {
    const steps = FAILURE_WORKFLOW.steps;

    // Step 1: analyst → success
    const ctx1 = buildAgentContext(SESSION_ID, board, steps[0], history);
    const r1 = await executeStep(steps[0], registry, ctx1);
    expect(r1.success).toBe(true);
    recordStepResult(board, steps[0].name, r1);

    // Step 2: unknown-agent → E4003 failure
    const ctx2 = buildAgentContext(SESSION_ID, board, steps[1], history);
    const r2 = await executeStep(steps[1], registry, ctx2);
    expect(r2.success).toBe(false);
    expect(r2.diagnosisCode).toBe("E4003");
    recordStepError(board, steps[1].name, r2);

    // Step 3: verifier → success (continue-on-error path)
    const ctx3 = buildAgentContext(SESSION_ID, board, steps[2], history);
    const r3 = await executeStep(steps[2], registry, ctx3);
    expect(r3.success).toBe(true);
    recordStepResult(board, steps[2].name, r3);

    // Verify blackboard state: success / fail / success
    const s1 = readStepResult(board, "analyze");
    const s2 = readStepResult(board, "bad-step");
    const s3 = readStepResult(board, "fallback");

    expect(s1!.success).toBe(true);
    expect(s2!.success).toBe(false);
    expect(s2!.diagnosisCode).toBe("E4003");
    expect(s3!.success).toBe(true);

    // Verify workflow metadata preserved
    const meta = board.read<Record<string, unknown>>("state.context.workflow");
    expect(meta.workflowName).toBe("failure-test-workflow");
  });
});

// ---------------------------------------------------------------------------
// Scenario C: Timeout failure (E4002)
// ---------------------------------------------------------------------------

describe("E2E Scenario C: timeout failure with blackboard recording", () => {
  it("records E4002 timeout on blackboard", async () => {
    setClock(() => FIXED_TIME);
    try {
      const registry = new AgentRegistry({ llm: new MockLLMAdapter() });
      const board = createWorkflowBlackboard(SESSION_ID, WORKFLOW, "feat");

      // Create a resolver that returns a slow agent
      const slowResolver: AgentResolver = {
        resolve: () => ({
          execute: () =>
            new Promise((resolve) => setTimeout(resolve, 5000)),
          role: "executor",
        }) as any,
      };

      const step: Step = { name: "slow-step", agent: "executor", timeout: "1s" };
      const ctx = buildAgentContext(SESSION_ID, board, step, []);

      const result = await executeStep(step, slowResolver, ctx, {
        timeoutMs: 50,
      });

      expect(result.success).toBe(false);
      expect(result.diagnosisCode).toBe("E4002");

      recordStepError(board, "slow-step", result);
      const stored = readStepResult(board, "slow-step");
      expect(stored!.success).toBe(false);
      expect(stored!.diagnosisCode).toBe("E4002");
      expect(stored!.error).toBe("Timeout exceeded");
    } finally {
      setClock(null);
    }
  });
});

// ---------------------------------------------------------------------------
// Integration verification: StepExecutor + AgentRegistry + ContextBuilder
// ---------------------------------------------------------------------------

describe("Integration: StepExecutor + AgentRegistry + ContextBuilder", () => {
  it("AgentRegistry satisfies AgentResolver interface used by StepExecutor", () => {
    const registry = new AgentRegistry({ llm: new MockLLMAdapter() });
    // Type check: registry is assignable to AgentResolver
    const resolver: AgentResolver = registry;
    expect(typeof resolver.resolve).toBe("function");
  });

  it("buildAgentContext output is accepted by executeStep", async () => {
    const registry = new AgentRegistry({ llm: new MockLLMAdapter() });
    const board = createWorkflowBlackboard("s", WORKFLOW, "f");
    const step = WORKFLOW.steps[0];
    const ctx = buildAgentContext("s", board, step, []);

    // ctx has the shape AgentContext that executeStep expects
    const result = await executeStep(step, registry, ctx);
    expect(result).toHaveProperty("success");
  });

  it("no stub/fallback paths remain when resolver is active", async () => {
    // When a resolver is provided, executeStep should NOT produce
    // simulation output (which contains "Simulated step execution result")
    const registry = new AgentRegistry({ llm: new MockLLMAdapter() });
    const board = createWorkflowBlackboard("s", WORKFLOW, "f");
    const step = WORKFLOW.steps[0];
    const ctx = buildAgentContext("s", board, step, []);

    const result = await executeStep(step, registry, ctx);
    expect(result.output).not.toContain("Simulated step execution result");
  });
});
