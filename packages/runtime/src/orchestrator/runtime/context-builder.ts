/**
 * ContextBuilder — assembles AgentContext with a shared Blackboard
 * for workflow execution.
 *
 * Responsibilities:
 * - Create one Blackboard per workflow run (single session scope)
 * - Build AgentContext for each step with board, task, history
 * - Record step results/errors on the board for inter-step state sharing
 * - Maintain single-writer: only this module writes step results to board
 */

import type { ChatMessage } from "@obora/adapters";
import type { AgentContext, Task } from "../../cell/agents/roles/index.js";
import { Blackboard } from "./blackboard.js";
import type { Step, Workflow } from "../workflow/index.js";
import type { StepResult } from "./step-executor.js";
import { stepToTask } from "./step-executor.js";
import type { StepErrorMetadata } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Metadata stored in blackboard state.context.workflow for replay/trace */
export interface WorkflowMeta {
  workflowName: string;
  workflowVersion: string;
  featureName: string;
  startedAt: string;
  sessionId: string;
}

/** Result record stored on blackboard for each step */
export interface StepResultRecord {
  success: boolean;
  output: string | null;
  error: string | null;
  errorMeta?: StepErrorMetadata | null;
  diagnosisCode: string | null;
  completedAt: string | null;
  failedAt: string | null;
}

// ---------------------------------------------------------------------------
// Clock abstraction (injectable for testing)
// ---------------------------------------------------------------------------

/** Returns an ISO-8601 timestamp string. Injectable for deterministic tests. */
export type Clock = () => string;

const defaultClock: Clock = () => new Date().toISOString();

/** Module-level clock; override via `setClock()` for testing. */
let activeClock: Clock = defaultClock;
let warnedDirectWriteNoop = false;

/** Override the clock used by record* functions. Pass `null` to reset. */
export function setClock(clock: Clock | null): void {
  activeClock = clock ?? defaultClock;
}

// ---------------------------------------------------------------------------
// Blackboard factory
// ---------------------------------------------------------------------------

/**
 * Create a Blackboard instance scoped to a single workflow run.
 *
 * Initialises `state.context.workflow` with replay-friendly metadata and
 * `state.steps` as an empty container for per-step results.
 */
export function createWorkflowBlackboard(
  sessionId: string,
  workflow: Workflow,
  featureName: string,
): Blackboard {
  const meta: WorkflowMeta = {
    workflowName: workflow.name,
    workflowVersion: workflow.version ?? "1.0",
    featureName,
    startedAt: activeClock(),
    sessionId,
  };

  const board = new Blackboard({
    state: {
      context: {
        workflow: meta as unknown as Record<string, unknown>,
        steps: {},
      },
    },
  });

  // Compatibility shim for agents expecting board.write().
  // The no-op preserves runtime single-writer policy via recordStepResult/recordStepError.
  Object.defineProperty(board as unknown as { write?: (path: string, value: unknown) => void }, "write", {
    value: (path: string, _value: unknown) => {
      if (!warnedDirectWriteNoop && process.env.NODE_ENV !== "test") {
        warnedDirectWriteNoop = true;
        console.warn(
          `[Blackboard] Direct write("${path}") is a no-op. Use recordStepResult/recordStepError.`,
        );
      }
      // no-op: single-writer policy — mutation only via recordStepResult/recordStepError
    },
    configurable: false,
    enumerable: false,
    writable: false,
  });

  return board;
}

// ---------------------------------------------------------------------------
// Context assembly
// ---------------------------------------------------------------------------

/**
 * Build an AgentContext for a single step execution.
 *
 * @param sessionId - Workflow run session ID
 * @param board     - Shared Blackboard instance (workflow-scoped)
 * @param step      - Current workflow step
 * @param history   - Accumulated LLM chat history from prior steps
 */
export function buildAgentContext(
  sessionId: string,
  board: Blackboard | AgentContext["board"],
  step: Step,
  history: ChatMessage[] = [],
): AgentContext {
  const task = stepToTask(step);

  return {
    sessionId,
    board: board as unknown as AgentContext["board"],
    currentTask: task,
    history,
  };
}

// ---------------------------------------------------------------------------
// Step result recording (single-writer on board)
// ---------------------------------------------------------------------------

/**
 * Record a successful step result on the blackboard.
 * Path: `state.context.steps.<stepName>`
 */
export function recordStepResult(
  board: Blackboard | AgentContext["board"],
  stepName: string,
  result: StepResult,
): void {
  const record: StepResultRecord = {
    success: result.success,
    output: result.output ?? null,
    error: null,
    errorMeta: null,
    diagnosisCode: null,
    completedAt: activeClock(),
    failedAt: null,
  };
  (board as Blackboard).recordStepResult(stepName, record);
}

/**
 * Record a failed step result on the blackboard.
 * Path: `state.context.steps.<stepName>`
 */
export function recordStepError(
  board: Blackboard | AgentContext["board"],
  stepName: string,
  result: StepResult,
): void {
  const record: StepResultRecord = {
    success: false,
    output: null,
    error: result.error ?? "Unknown error",
    errorMeta: result.errorMeta ?? null,
    diagnosisCode: result.diagnosisCode ?? null,
    completedAt: null,
    failedAt: activeClock(),
  };
  (board as Blackboard).recordStepError(stepName, {
    message: record.error ?? "Unknown error",
    code: record.diagnosisCode as StepErrorMetadata["code"] | undefined,
    failedAt: record.failedAt ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// Inter-step state query
// ---------------------------------------------------------------------------

/**
 * Read a previous step's result from the blackboard.
 * Returns null if the step has not been recorded yet.
 *
 * Uses a single `board.read({ strict: false })` call for atomicity
 * and efficiency (one traversal instead of exists + read).
 */
export function readStepResult(
  board: Blackboard | AgentContext["board"],
  stepName: string,
): StepResultRecord | null {
  const value = board.read<StepResultRecord | undefined>(
    `state.context.steps.${stepName}`,
    { strict: false },
  );
  return value ?? null;
}

// ---------------------------------------------------------------------------
// History management
// ---------------------------------------------------------------------------

/**
 * Maximum number of chat messages retained in the rolling history window.
 * Prevents unbounded memory growth in long workflows while keeping enough
 * context for downstream steps.
 */
export const MAX_HISTORY_LENGTH = 200;

/**
 * Append a message to the chat history, trimming the oldest entries when
 * the history exceeds `MAX_HISTORY_LENGTH`.
 *
 * **Note:** Mutates the input array in-place for performance. Callers
 * sharing the array reference should be aware of this contract.
 */
export function appendHistory(
  history: ChatMessage[],
  message: ChatMessage,
): void {
  history.push(message);
  if (history.length > MAX_HISTORY_LENGTH) {
    // Remove oldest entries to stay within budget
    const excess = history.length - MAX_HISTORY_LENGTH;
    history.splice(0, excess);
  }
}
