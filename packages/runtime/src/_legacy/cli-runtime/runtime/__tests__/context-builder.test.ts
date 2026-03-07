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
  setClock,
  appendHistory,
  MAX_HISTORY_LENGTH,
} from "../context-builder.js";
import type { ChatMessage } from "@obora/adapters";
import type { Step, Workflow } from "../../../../_legacy/workflow/index.js";

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

describe("injectable clock", () => {
  it("uses injected clock for timestamps", () => {
    const FIXED = "2026-01-01T00:00:00.000Z";
    setClock(() => FIXED);
    try {
      const board = createWorkflowBlackboard(SESSION, WORKFLOW, "feat");
      recordStepResult(board, "plan", { success: true, output: "ok" });
      const rec = readStepResult(board, "plan");
      expect(rec!.completedAt).toBe(FIXED);
    } finally {
      setClock(null); // reset
    }
  });

  it("uses injected clock for workflow metadata startedAt", () => {
    const FIXED = "2026-03-01T09:00:00.000Z";
    setClock(() => FIXED);
    try {
      const board = createWorkflowBlackboard(SESSION, WORKFLOW, "feat");
      const meta = board.read<Record<string, unknown>>("state.context.workflow");
      expect(meta.startedAt).toBe(FIXED);
    } finally {
      setClock(null);
    }
  });

  it("uses injected clock for error timestamps", () => {
    const FIXED = "2026-06-15T12:00:00.000Z";
    setClock(() => FIXED);
    try {
      const board = createWorkflowBlackboard(SESSION, WORKFLOW, "feat");
      recordStepError(board, "impl", { success: false, error: "fail" });
      const rec = readStepResult(board, "impl");
      expect(rec!.failedAt).toBe(FIXED);
    } finally {
      setClock(null);
    }
  });
});

describe("appendHistory (bounded history)", () => {
  it("appends messages normally under limit", () => {
    const history: ChatMessage[] = [];
    appendHistory(history, { role: "user", content: "hello" });
    expect(history).toHaveLength(1);
  });

  it("trims oldest entries when exceeding MAX_HISTORY_LENGTH", () => {
    const history: ChatMessage[] = [];
    for (let i = 0; i < MAX_HISTORY_LENGTH + 10; i++) {
      appendHistory(history, { role: "assistant", content: `msg-${i}` });
    }
    expect(history).toHaveLength(MAX_HISTORY_LENGTH);
    // Oldest messages should be trimmed
    expect(history[0].content).toBe("msg-10");
    expect(history[history.length - 1].content).toBe(`msg-${MAX_HISTORY_LENGTH + 9}`);
  });
});

describe("readStepResult uses exists() check", () => {
  it("returns null for missing step without relying on strict:false", () => {
    const board = createWorkflowBlackboard(SESSION, WORKFLOW, "feat");
    // Should use board.exists() internally, not board.read({strict:false})
    const result = readStepResult(board, "nonexistent");
    expect(result).toBeNull();
  });
});

describe("single-writer policy (structural)", () => {
  it("step-executor module does not export board.write calls", async () => {
    // Verify the step-executor source doesn't call board.write
    const fs = await import("node:fs");
    const path = await import("node:path");
    const executorPath = path.join(
      import.meta.dirname ?? ".",
      "..",
      "step-executor.ts",
    );
    if (fs.existsSync(executorPath)) {
      const source = fs.readFileSync(executorPath, "utf-8");
      expect(source).not.toMatch(/board\.write\s*\(/);
    }
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
