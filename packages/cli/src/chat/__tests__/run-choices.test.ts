import type { WorkflowRunSummary } from "@obora/sdk";
import { describe, expect, it } from "vitest";

import {
  chatRunChoiceFromDetail,
  runChoiceSummary,
  toChatRunChoice,
} from "../run-choices.js";

const runSummary: WorkflowRunSummary = {
  executionId: "exec-choice",
  workflowName: "choice-workflow",
  status: "completed",
  message: "Workflow completed.",
  inputPreview: "choice task",
  startedAt: "2026-05-25T00:00:00.000Z",
  endedAt: "2026-05-25T00:00:01.000Z",
  durationMs: 1000,
  totalStepCount: 1,
  completedStepCount: 1,
  stepOrder: ["step"],
  outputs: { step: "ok" },
  steps: [
    {
      name: "step",
      status: "completed",
      output: "ok",
      startedAt: "2026-05-25T00:00:00.000Z",
      endedAt: "2026-05-25T00:00:01.000Z",
    },
  ],
};

describe("chat run choices", () => {
  it("normalizes legacy summary-only choices with optional source session", () => {
    expect(runChoiceSummary(runSummary)).toBe(runSummary);
    expect(toChatRunChoice(runSummary)).toEqual({
      runSummary,
      source: "session",
    });
    expect(toChatRunChoice(runSummary, "session-a")).toEqual({
      runSummary,
      sessionId: "session-a",
      source: "session",
    });
  });

  it("keeps structured choices and creates persisted choices from details", () => {
    const choice = chatRunChoiceFromDetail({
      sessionId: "history-session",
      messageId: "assistant:run",
      runSummary,
    });

    expect(runChoiceSummary(choice)).toBe(runSummary);
    expect(toChatRunChoice(choice, "ignored-session")).toBe(choice);
    expect(choice).toEqual({
      runSummary,
      sessionId: "history-session",
      messageId: "assistant:run",
      source: "persisted",
    });
  });
});
