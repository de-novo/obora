import { describe, expect, it } from "vitest";
import { Blackboard, type StepRuntimeRecord } from "../blackboard.js";

function createStepRecord(overrides: Partial<StepRuntimeRecord> = {}): StepRuntimeRecord {
  return {
    success: true,
    output: "ok",
    error: null,
    diagnosisCode: null,
    completedAt: "2026-05-07T00:00:00.000Z",
    failedAt: null,
    ...overrides,
  };
}

describe("runtime blackboard", () => {
  it("checks path existence without throwing for missing paths", () => {
    const board = new Blackboard({
      state: {
        context: {
          workflow: { id: "wf-1" },
          steps: {
            analyze: createStepRecord(),
          },
        },
      },
    });

    expect(board.exists("state.context.workflow.id")).toBe(true);
    expect(board.exists("state.context.steps.analyze.output")).toBe(true);
    expect(board.exists("state.context.steps.review")).toBe(false);
  });

  it("keeps event-emitter shape as inert chainable methods", () => {
    const board = new Blackboard();
    const listener = () => {};

    expect(board.on("change", listener)).toBe(board);
    expect(board.once("change", listener)).toBe(board);
    expect(board.off("change", listener)).toBe(board);
    expect(board.removeAllListeners("change")).toBe(board);
    expect(board.listenerCount("change")).toBe(0);
    expect(board.emit("change", { path: "state.context" })).toBe(false);
  });

  it("returns an immutable cloned snapshot of runtime state", () => {
    const board = new Blackboard();
    board.recordStepResult("analyze", createStepRecord());

    const snapshot = board.getSnapshot();
    const mutableSnapshot = snapshot as {
      state: {
        context: {
          steps: Record<string, StepRuntimeRecord>;
        };
      };
    };

    expect(snapshot.state.context.steps.analyze?.output).toBe("ok");
    expect(() => {
      mutableSnapshot.state.context.steps.analyze = createStepRecord({ output: "changed" });
    }).toThrow(TypeError);
    expect(board.read<StepRuntimeRecord>("state.context.steps.analyze").output).toBe("ok");
  });
});
