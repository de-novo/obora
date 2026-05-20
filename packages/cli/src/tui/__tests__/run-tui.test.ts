import { afterEach, describe, expect, it, vi } from "vitest";

import { RunTuiController } from "../run-tui.js";

const originalStdoutIsTTY = process.stdout.isTTY;

function setStdoutTTY(value: boolean): void {
  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    value,
  });
}

describe("RunTuiController", () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: originalStdoutIsTTY,
    });
    vi.restoreAllMocks();
  });

  it("tracks workflow, stream, usage, and completion state", async () => {
    setStdoutTTY(false);
    const controller = new RunTuiController("feature-a", "workflow-a", 2);

    await controller.start();
    controller.renderEvent({
      type: "workflow-start",
      featureName: "feature-b",
      workflowName: "workflow-b",
      totalSteps: 3,
    });
    controller.renderEvent({
      type: "step-start",
      stepName: "draft",
      stepIndex: 1,
      totalSteps: 3,
      agentName: "writer",
      modelName: "model-a",
      thinkingLevel: "medium",
    });
    controller.renderEvent({ type: "stream", chunk: "hello" });
    controller.renderEvent({ type: "usage", promptTokens: 1, completionTokens: 2, totalTokens: 3 });
    controller.renderEvent({ type: "step-complete", stepName: "draft" });
    controller.renderEvent({ type: "workflow-complete", failedSteps: 0 });

    expect(controller.snapshot()).toEqual(
      expect.objectContaining({
        featureName: "feature-b",
        workflowName: "workflow-b",
        stepName: "draft",
        stepIndex: 2,
        totalSteps: 3,
        agentName: "writer",
        modelName: "model-a",
        thinkingLevel: "medium",
        streamedMarkdown: "hello",
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
        status: "completed",
      })
    );

    await controller.stop();
  });

  it("records failed and aborted states", async () => {
    setStdoutTTY(false);
    const controller = new RunTuiController("feature-a", "workflow-a", 1);

    await controller.start();
    controller.renderEvent({ type: "step-failed", stepName: "draft", error: "boom" });
    expect(controller.snapshot()).toEqual(
      expect.objectContaining({ status: "failed", lastError: "boom" })
    );

    controller.renderEvent({ type: "workflow-complete", failedSteps: 1 });
    expect(controller.snapshot().status).toBe("failed");

    controller.renderEvent({ type: "workflow-abort", reason: "user requested" });
    expect(controller.snapshot()).toEqual(
      expect.objectContaining({ status: "aborted", lastError: "user requested" })
    );

    await controller.stop();
  });

  it("renders text dashboard in TTY mode and handles SIGINT", async () => {
    setStdoutTTY(true);
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const controller = new RunTuiController("feature-a", "workflow-a", 0);

    await controller.start();
    process.emit("SIGINT");

    expect(controller.isAbortRequested()).toBe(true);
    expect(controller.snapshot().status).toBe("aborted");
    const output = write.mock.calls.map((args) => String(args[0])).join("");
    expect(output).toContain("obora run dashboard");
    expect(output).toContain("@earendil-works/pi-tui differential rendering");

    await controller.stop();
  });
});
