import { describe, expect, it, vi } from "vitest";

import { RecoveryEngine } from "../RecoveryEngine";
import type { CellFailure } from "../types";

const createFailure = (attempt = 0): CellFailure => ({
  executionId: "exec-1",
  cellId: "cell-1",
  stepName: "review",
  attempt,
  error: new Error("cell failed"),
});

describe("RecoveryEngine", () => {
  it("runs retry strategy with linear backoff", async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const executeRetry = vi.fn().mockResolvedValue({ ok: true });

    const engine = new RecoveryEngine({
      wait,
      retryExecutor: { executeRetry },
    });

    const result = await engine.handle(createFailure(0), {
      type: "retry",
      mode: "linear",
      maxAttempts: 3,
      initialDelayMs: 100,
      maxDelayMs: 500,
    });

    expect(wait).toHaveBeenCalledWith(100);
    expect(executeRetry).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("recovered");
    expect(result.strategy).toBe("retry");
  });

  it("runs retry strategy with exponential backoff", async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const executeRetry = vi.fn().mockResolvedValue({ ok: true });

    const engine = new RecoveryEngine({ wait, retryExecutor: { executeRetry } });

    await engine.handle(createFailure(1), {
      type: "retry",
      mode: "exponential",
      maxAttempts: 5,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      multiplier: 2,
    });

    expect(wait).toHaveBeenCalledWith(200);
  });

  it("fails retry when max attempts reached", async () => {
    const engine = new RecoveryEngine({
      wait: vi.fn().mockResolvedValue(undefined),
      retryExecutor: { executeRetry: vi.fn() },
    });

    const result = await engine.handle(createFailure(3), {
      type: "retry",
      mode: "linear",
      maxAttempts: 3,
      initialDelayMs: 50,
      maxDelayMs: 100,
    });

    expect(result.status).toBe("failed");
    expect(result.error?.message).toContain("max retry attempts reached");
  });

  it("runs rollback strategy", async () => {
    const restore = vi.fn().mockResolvedValue(undefined);
    const engine = new RecoveryEngine({ snapshotStore: { restore } });

    const result = await engine.handle(createFailure(), {
      type: "rollback",
      snapshotId: "snap-1",
    });

    expect(restore).toHaveBeenCalledWith("snap-1");
    expect(result.status).toBe("recovered");
  });

  it("runs escalate strategy", async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const engine = new RecoveryEngine({ escalationNotifier: { notify } });

    const result = await engine.handle(createFailure(), {
      type: "escalate",
      severity: "high",
      channel: "human-approval",
      summary: "need human check",
    });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("escalated");
  });

  it("runs alternative strategy", async () => {
    const executeAlternative = vi.fn().mockResolvedValue({ used: "fallback-step" });
    const engine = new RecoveryEngine({ alternativeExecutor: { executeAlternative } });

    const result = await engine.handle(createFailure(), {
      type: "alternative",
      stepName: "fallback-review",
      payload: { reason: "tool-timeout" },
    });

    expect(executeAlternative).toHaveBeenCalledWith(
      expect.objectContaining({ stepName: "fallback-review" })
    );
    expect(result.status).toBe("recovered");
    expect(result.strategy).toBe("alternative");
  });
});
