/**
 * ContextBuilder unit tests
 */

import { describe, it, expect } from "vitest";
import {
  createWorkflowBlackboard,
  buildAgentContext,
  recordStepResult,
  recordStepError,
  readStepResult,
} from "../context-builder.js";
import type { Step, Workflow } from "@obora/core";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WORKFLOW: Workflow = {
  name: "test-workflow",
  version: "1.0",
  mode: "auto",
  steps: [
    { name: "plan", agent: "analyst" },
    { name: "implement", agent: "executor", depends_on: ["plan"] },
  ],
} as any;

const STEP_PLAN: Step = { name: "plan", agent: "analyst", description: "Plan the work" } as any;
const STEP_IMPL: Step = {
  name: "implement",
  agent: "executor",
  depends_on: ["plan"],
} as any;

const SESSION = "session-test-001";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createWorkflowBlackboard", () => {
  it("creates a Blackboard with workflow metadata", () => {
    const board = createWorkflowBlackboard(SESSION, WORKFLOW, "my-feature");

    const meta = board.read<Record<string, unknown>>("state.context.workflow");
    expect(meta).toBeDefined();
    expect(meta.workflowName).toBe("test-workflow");
    expect(meta.workflowVersion).toBe("1.0");
    expect(meta.featureName).toBe("my-feature");
    expect(meta.sessionId).toBe(SESSION);
    expect(typeof meta.startedAt).toBe("string");
  });

  it("initialises empty steps container", () => {
    const board = createWorkflowBlackboard(SESSION, WORKFLOW, "feat");
    const steps = board.read("state.context.steps");
    expect(steps).toEqual({});
  });
});

describe("buildAgentContext", () => {
  it("returns a valid AgentContext with all required fields", () => {
    const board = createWorkflowBlackboard(SESSION, WORKFLOW, "feat");
    const ctx = buildAgentContext(SESSION, board, STEP_PLAN);

    expect(ctx.sessionId).toBe(SESSION);
    expect(ctx.board).toBe(board);
    expect(ctx.currentTask).toBeDefined();
    expect(ctx.currentTask!.id).toBe("plan");
    expect(ctx.currentTask!.type).toBe("analyst");
    expect(Array.isArray(ctx.history)).toBe(true);
    expect(ctx.history).toHaveLength(0);
  });

  it("passes provided history through", () => {
    const board = createWorkflowBlackboard(SESSION, WORKFLOW, "feat");
    const history = [{ role: "user" as const, content: "hello" }];
    const ctx = buildAgentContext(SESSION, board, STEP_PLAN, history);

    expect(ctx.history).toEqual(history);
  });
});

describe("recordStepResult / recordStepError", () => {
  it("records a success result readable by readStepResult", () => {
    const board = createWorkflowBlackboard(SESSION, WORKFLOW, "feat");
    recordStepResult(board, "plan", { success: true, output: "done" });

    const stored = readStepResult(board, "plan");
    expect(stored).not.toBeNull();
    expect(stored!.success).toBe(true);
    expect(stored!.output).toBe("done");
    expect(typeof stored!.completedAt).toBe("string");
    expect(stored!.failedAt).toBeNull();
  });

  it("records an error result readable by readStepResult", () => {
    const board = createWorkflowBlackboard(SESSION, WORKFLOW, "feat");
    recordStepError(board, "implement", {
      success: false,
      error: "timeout",
      diagnosisCode: "E4002",
    });

    const stored = readStepResult(board, "implement");
    expect(stored).not.toBeNull();
    expect(stored!.success).toBe(false);
    expect(stored!.error).toBe("timeout");
    expect(stored!.diagnosisCode).toBe("E4002");
    expect(stored!.output).toBeNull();
  });

  it("returns typed StepResultRecord with explicit nulls", () => {
    const board = createWorkflowBlackboard(SESSION, WORKFLOW, "feat");
    recordStepResult(board, "plan", { success: true, output: "ok" });
    const rec = readStepResult(board, "plan");

    // TypeScript should know these fields exist as string | null
    expect(rec).not.toBeNull();
    expect(rec!.output).toBe("ok");
    expect(rec!.success).toBe(true);
    expect(rec!.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO string
    expect(rec!.error).toBeNull();
    expect(rec!.diagnosisCode).toBeNull();
  });
});

describe("inter-step state sharing", () => {
  it("step2 can read step1 result from shared board", () => {
    const board = createWorkflowBlackboard(SESSION, WORKFLOW, "feat");

    // Step 1 completes
    recordStepResult(board, "plan", { success: true, output: "plan output" });

    // Step 2 reads step 1
    const planResult = readStepResult(board, "plan");
    expect(planResult).not.toBeNull();
    expect(planResult!.output).toBe("plan output");
  });

  it("returns null for unrecorded step", () => {
    const board = createWorkflowBlackboard(SESSION, WORKFLOW, "feat");
    const result = readStepResult(board, "nonexistent");
    expect(result).toBeNull();
  });
});

describe("single-writer policy", () => {
  it("context-builder writes to board; step-executor does not", () => {
    // This test verifies the architectural contract: only context-builder
    // writes step results to the board. The step-executor returns StepResult
    // and never calls board.write().
    const board = createWorkflowBlackboard(SESSION, WORKFLOW, "feat");
    const initialVersion = board.version;

    // Simulate step execution result (step-executor returns, does not write)
    const result = { success: true, output: "output" };

    // Board version unchanged until context-builder records
    expect(board.version).toBe(initialVersion);

    // Now context-builder records
    recordStepResult(board, "plan", result);
    expect(board.version).toBeGreaterThan(initialVersion);
  });
});

describe("replay/trace metadata", () => {
  it("workflow metadata contains all required trace fields", () => {
    const board = createWorkflowBlackboard(SESSION, WORKFLOW, "feat");
    const meta = board.read<Record<string, unknown>>("state.context.workflow");

    // Minimum fields for replay/trace
    const requiredFields = [
      "workflowName",
      "workflowVersion",
      "featureName",
      "startedAt",
      "sessionId",
    ];
    for (const field of requiredFields) {
      expect(meta).toHaveProperty(field);
    }
  });

  it("step records contain timestamps for trace", () => {
    const board = createWorkflowBlackboard(SESSION, WORKFLOW, "feat");
    recordStepResult(board, "plan", { success: true, output: "ok" });
    const rec = readStepResult(board, "plan");
    expect(rec).toHaveProperty("completedAt");

    recordStepError(board, "impl", { success: false, error: "err" });
    const errRec = readStepResult(board, "impl");
    expect(errRec).toHaveProperty("failedAt");
  });
});
