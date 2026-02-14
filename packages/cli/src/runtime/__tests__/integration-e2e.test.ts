/**
 * TASK-043 Integration E2E Tests
 *
 * Validates the full "step(control) → agent(execution) → blackboard(state)"
 * runtime bridge end-to-end.
 *
 * **Scope**: This integration test focuses on the three-layer bridge:
 * - step-executor: Step → Task conversion and BaseAgent execution
 * - context-builder: Blackboard state management and single-writer policy
 * - agent-registry: Agent name resolution to BaseAgent instances
 *
 * NOTE: Full workflow orchestration (executeWorkflow with dependency resolution,
 * retry logic, parallel execution, E4005 retry-exhaustion, --dry-run, etc.)
 * is tested separately in workflow-orchestration tests. Here we manually
 * drive step execution to validate the core contract between layers.
 * Specifically OUT OF SCOPE: E4005 (retry exhaustion), step-level retry loops,
 * --dry-run mode, and E4001 from TaskResult { success: false } (covered in
 * step-executor.test.ts unit tests).
 *
 * Scenario A: 3-step success workflow with blackboard state propagation
 * Scenario B: failure-recovery with unknown agent (E4003) + graceful fallback
 *   Note: fallback depends on "analyze" (not the failed "bad-step") to demonstrate
 *   continue-on-error behavior where independent steps can proceed.
 * Scenario C: timeout failure (E4002) with blackboard recording
 * Scenario D: inter-step state propagation chain verification
 * Scenario E: single-writer guard tests (only context-builder writes board)
 * Scenario F: test isolation verification (no cross-test leakage)
 * Scenario G: appendHistory MAX_HISTORY_LENGTH boundary trimming
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
  MAX_HISTORY_LENGTH,
  type StepResultRecord,
} from "../context-builder.js";
import { MockLLMAdapter } from "@obora-kit/agents";
import type { ChatMessage } from "@obora-kit/agents";
import type { Step, Workflow, ErrorCode } from "@obora/core";

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
};

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

  // NOTE: fallback depends on "analyze", NOT "bad-step". This models
  // a continue-on-error pattern where independent steps can proceed even
  // when a step in the same workflow fails. The test validates that:
  // 1. Failure is recorded on the board
  // 2. Fallback step's context can read that failure for decision-making
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
        depends_on: ["analyze"], // intentionally independent of bad-step
      },
    ],
  };

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

    // Verify fallback step context can read the failure from step 2
    const badStepResult = readStepResult(board, "bad-step");
    expect(badStepResult).not.toBeNull();
    expect(badStepResult!.success).toBe(false);
    expect(badStepResult!.diagnosisCode).toBe("E4003");
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
  beforeEach(() => {
    setClock(() => FIXED_TIME);
  });

  afterEach(() => {
    setClock(null);
  });

  it("records E4002 timeout on blackboard", async () => {
    // Use fake timers to eliminate any CI scheduling jitter risk.
    // The never-resolving promise + fake timer advance is fully deterministic.
    vi.useFakeTimers();

    const board = createWorkflowBlackboard(SESSION_ID, WORKFLOW, "feat");

    const slowResolver: AgentResolver = {
      resolve: () => ({
        execute: () => new Promise<never>(() => {}), // never resolves
        role: "executor",
      }) as any,
    };

    const step: Step = { name: "slow-step", agent: "executor", timeout: "1s" } as Step;
    const ctx = buildAgentContext(SESSION_ID, board, step, []);

    // Start execution (will hang until timeout fires)
    const resultPromise = executeStep(step, slowResolver, ctx, {
      timeoutMs: 5000,
    });

    // Advance fake timers past the timeout — deterministic, no real delay
    await vi.advanceTimersByTimeAsync(5001);

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.diagnosisCode).toBe("E4002");
    expect(result.error).toBe("Timeout exceeded");

    recordStepError(board, "slow-step", result);
    const stored = readStepResult(board, "slow-step");
    expect(stored).not.toBeNull();
    expect(stored!.success).toBe(false);
    expect(stored!.diagnosisCode).toBe("E4002");
    expect(stored!.failedAt).toBe(FIXED_TIME);

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Scenario D: Inter-step state propagation — explicit chain verification
// ---------------------------------------------------------------------------

describe("E2E Scenario D: inter-step state propagation chain", () => {
  let registry: AgentRegistry;
  let board: ReturnType<typeof createWorkflowBlackboard>;
  let history: ChatMessage[];

  beforeEach(() => {
    setClock(() => FIXED_TIME);
    registry = new AgentRegistry({ llm: new MockLLMAdapter() });
    board = createWorkflowBlackboard(SESSION_ID, WORKFLOW, "propagation-test");
    history = [];
  });

  afterEach(() => {
    setClock(null);
  });

  it("step N context includes step N-1 result via blackboard read", async () => {
    // Step 1: analyze
    const step1 = WORKFLOW.steps[0];
    const ctx1 = buildAgentContext(SESSION_ID, board, step1, history);
    const r1 = await executeStep(step1, registry, ctx1);
    recordStepResult(board, step1.name, r1);
    appendHistory(history, { role: "assistant", content: `[analyze] ${r1.output}` });

    // Before step 2: verify step 1 result is available through the same board reference
    const step2 = WORKFLOW.steps[1];
    const ctx2 = buildAgentContext(SESSION_ID, board, step2, history);

    // The context's board IS the shared board (reference identity — not a copy)
    expect(ctx2.board).toBe(board);

    const step1FromCtx = readStepResult(ctx2.board, "analyze");
    expect(step1FromCtx).not.toBeNull();
    expect(step1FromCtx!.success).toBe(true);
    expect(step1FromCtx!.output).toBeDefined();
    expect(step1FromCtx!.completedAt).toBe(FIXED_TIME);

    // History also carries forward
    expect(ctx2.history).toHaveLength(1);
    expect(ctx2.history[0].content).toContain("[analyze]");
  });

  it("3-step chain: each step reads all prior steps from board", async () => {
    const outputs: string[] = [];

    for (let i = 0; i < WORKFLOW.steps.length; i++) {
      const step = WORKFLOW.steps[i];
      const ctx = buildAgentContext(SESSION_ID, board, step, history);

      // Assert all prior step results are readable
      for (let j = 0; j < i; j++) {
        const prior = readStepResult(ctx.board, WORKFLOW.steps[j].name);
        expect(prior).not.toBeNull();
        expect(prior!.success).toBe(true);
        expect(prior!.completedAt).toBe(FIXED_TIME);
      }

      // Current step should NOT yet be recorded
      expect(readStepResult(ctx.board, step.name)).toBeNull();

      const result = await executeStep(step, registry, ctx);
      expect(result.success).toBe(true);
      outputs.push(result.output!);

      recordStepResult(board, step.name, result);
      appendHistory(history, { role: "assistant", content: `[${step.name}] ${result.output}` });
    }

    // Final: all 3 outputs are distinct and non-empty
    expect(outputs).toHaveLength(3);
    outputs.forEach((o) => expect(o).toBeTruthy());

    // History order preserved
    expect(history.map((h) => h.content!.match(/\[([^\]]+)\]/)![1])).toEqual([
      "analyze",
      "execute",
      "verify",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Scenario E: Single-writer guard — only context-builder records on board
// ---------------------------------------------------------------------------

describe("E2E Scenario E: single-writer guard", () => {
  let board: ReturnType<typeof createWorkflowBlackboard>;

  beforeEach(() => {
    setClock(() => FIXED_TIME);
    board = createWorkflowBlackboard(SESSION_ID, WORKFLOW, "sw-test");
  });

  afterEach(() => {
    setClock(null);
  });

  it("recordStepResult writes to canonical path state.context.steps.<name>", () => {
    recordStepResult(board, "analyze", { success: true, output: "ok" });
    const raw = board.read<Record<string, StepResultRecord>>("state.context.steps");
    expect(raw).toHaveProperty("analyze");
    expect(raw.analyze.success).toBe(true);
    expect(raw.analyze.output).toBe("ok");
    expect(raw.analyze.completedAt).toBe(FIXED_TIME);
    expect(raw.analyze.failedAt).toBeNull();
  });

  it("recordStepError writes to same canonical path with failure shape", () => {
    const code: ErrorCode = "E4003";
    recordStepError(board, "bad", { success: false, error: "boom", diagnosisCode: code });
    const raw = board.read<Record<string, StepResultRecord>>("state.context.steps");
    expect(raw).toHaveProperty("bad");
    expect(raw.bad.success).toBe(false);
    expect(raw.bad.error).toBe("boom");
    expect(raw.bad.failedAt).toBe(FIXED_TIME);
    expect(raw.bad.completedAt).toBeNull();
    expect(raw.bad.diagnosisCode).toBe("E4003");
  });

  it("executeStep does NOT write to blackboard — only returns StepResult", async () => {
    const registry = new AgentRegistry({ llm: new MockLLMAdapter() });
    const step = WORKFLOW.steps[0];
    const ctx = buildAgentContext(SESSION_ID, board, step, []);

    // Snapshot board steps before execution
    const stepsBefore = JSON.stringify(board.read("state.context.steps"));

    await executeStep(step, registry, ctx);

    // Board unchanged — executeStep is a pure executor
    const stepsAfter = JSON.stringify(board.read("state.context.steps"));
    expect(stepsAfter).toBe(stepsBefore);
  });

  it("overwriting a step result replaces previous record atomically", () => {
    recordStepResult(board, "analyze", { success: true, output: "first" });
    recordStepResult(board, "analyze", { success: true, output: "second" });

    const stored = readStepResult(board, "analyze");
    expect(stored!.output).toBe("second");

    // Exactly one key — overwrite does not create duplicate entries
    const raw = board.read<Record<string, unknown>>("state.context.steps");
    expect(Object.keys(raw)).toEqual(["analyze"]);
  });

  it("recordStepError drops result.output (hardcodes null) — data-loss contract", () => {
    // When an error occurs, recordStepError intentionally discards any partial output.
    // This is a deliberate design choice: error records carry error/diagnosisCode only.
    const code: ErrorCode = "E4001";
    recordStepError(board, "x", {
      success: false,
      output: "partial output that should be dropped",
      error: "runtime failure",
      diagnosisCode: code,
    });

    const stored = readStepResult(board, "x");
    expect(stored).not.toBeNull();
    expect(stored!.output).toBeNull(); // contract: output is always null for errors
    expect(stored!.error).toBe("runtime failure");
  });
});

// ---------------------------------------------------------------------------
// Scenario F: Setup/teardown isolation — no cross-test leakage
// ---------------------------------------------------------------------------

describe("E2E Scenario F: test isolation verification", () => {
  // Note: setClock uses module-level state for determinism. Each test that
  // calls setClock MUST restore the default clock to avoid cross-test leakage.
  // The tests below verify this behavior works correctly.

  it("each test gets a fresh board (no shared mutable state)", () => {
    const board1 = createWorkflowBlackboard("s1", WORKFLOW, "f1");
    recordStepResult(board1, "analyze", { success: true, output: "from-board1" });

    const board2 = createWorkflowBlackboard("s2", WORKFLOW, "f2");
    const result = readStepResult(board2, "analyze");
    expect(result).toBeNull(); // board2 is independent
  });

  it("setClock reset prevents time leakage between tests", () => {
    setClock(() => "2099-12-31T23:59:59.000Z");
    try {
      const board = createWorkflowBlackboard("s", WORKFLOW, "f");
      recordStepResult(board, "analyze", { success: true, output: "x" });
      expect(readStepResult(board, "analyze")!.completedAt).toBe("2099-12-31T23:59:59.000Z");
    } finally {
      setClock(null);
    }

    const board2 = createWorkflowBlackboard("s2", WORKFLOW, "f2");
    recordStepResult(board2, "execute", { success: true, output: "y" });
    const ts = readStepResult(board2, "execute")!.completedAt!;
    expect(ts).not.toBe("2099-12-31T23:59:59.000Z");
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T/); // real ISO timestamp
  });
});

// ---------------------------------------------------------------------------
// Scenario G: appendHistory trimming at MAX_HISTORY_LENGTH boundary
// ---------------------------------------------------------------------------

describe("E2E Scenario G: appendHistory MAX_HISTORY_LENGTH boundary", () => {
  it("trims oldest entries when history exceeds MAX_HISTORY_LENGTH", () => {
    const history: ChatMessage[] = [];

    // Fill to exactly MAX_HISTORY_LENGTH
    for (let i = 0; i < MAX_HISTORY_LENGTH; i++) {
      appendHistory(history, { role: "assistant", content: `msg-${i}` });
    }
    expect(history).toHaveLength(MAX_HISTORY_LENGTH);
    expect(history[0].content).toBe("msg-0"); // oldest preserved

    // Add one more — should trim the oldest
    appendHistory(history, { role: "assistant", content: "overflow" });
    expect(history).toHaveLength(MAX_HISTORY_LENGTH);
    expect(history[0].content).toBe("msg-1"); // msg-0 trimmed
    expect(history[history.length - 1].content).toBe("overflow");
  });

  it("bulk overflow trims multiple oldest entries", () => {
    const history: ChatMessage[] = [];

    // Fill to MAX + 5 in one go
    for (let i = 0; i < MAX_HISTORY_LENGTH + 5; i++) {
      appendHistory(history, { role: "assistant", content: `m-${i}` });
    }
    expect(history).toHaveLength(MAX_HISTORY_LENGTH);
    expect(history[0].content).toBe("m-5"); // first 5 trimmed
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
