import { describe, expect, it, vi } from "vitest";

import { InMemoryAuditStore } from "../../audit/InMemoryAuditStore.js";
import { RecoveryEngine } from "../RecoveryEngine";
import type { CellFailure, RecoveryStrategy } from "../types";

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

  it("records recovery_start and recovery_end into AuditTrail", async () => {
    const auditTrail = new InMemoryAuditStore();
    const executeRetry = vi.fn().mockResolvedValue({ ok: true });

    const engine = new RecoveryEngine({
      auditTrail,
      wait: vi.fn().mockResolvedValue(undefined),
      retryExecutor: { executeRetry },
    });

    await engine.handle(createFailure(), {
      type: "retry",
      mode: "linear",
      maxAttempts: 3,
      initialDelayMs: 10,
      maxDelayMs: 50,
    });

    const events = await auditTrail.query({ executionId: "exec-1" });
    expect(events.map((event) => event.type)).toContain("recovery_start");
    expect(events.map((event) => event.type)).toContain("recovery_end");
  });

  it("blocks recovery when consensus gate is not passed", async () => {
    const executeRetry = vi.fn().mockResolvedValue({ ok: true });
    const engine = new RecoveryEngine({
      wait: vi.fn().mockResolvedValue(undefined),
      retryExecutor: { executeRetry },
      consensusGate: {
        evaluate: () => ({ status: "fail" }),
      },
    });

    const result = await engine.handle(
      createFailure(),
      {
        type: "retry",
        mode: "linear",
        maxAttempts: 3,
        initialDelayMs: 10,
        maxDelayMs: 50,
      },
      { consensusSessionId: "consensus-1" }
    );

    expect(result.status).toBe("failed");
    expect(result.error?.message).toContain("recovery blocked by consensus status: fail");
    expect(executeRetry).not.toHaveBeenCalled();
  });

  it("covers missing dependencies, plugin failures, consensus pass, and unsupported strategies", async () => {
    await expect(
      new RecoveryEngine().handle(createFailure(), {
        type: "retry",
        mode: "linear",
        maxAttempts: 3,
        initialDelayMs: 10,
        maxDelayMs: 50,
      })
    ).resolves.toMatchObject({
      status: "failed",
      error: expect.objectContaining({ message: "retryExecutor is required for retry strategy" }),
    });

    await expect(
      new RecoveryEngine().handle(createFailure(), { type: "rollback", snapshotId: "snap-1" })
    ).resolves.toMatchObject({
      status: "failed",
      error: expect.objectContaining({ message: "snapshotStore is required for rollback strategy" }),
    });

    await expect(
      new RecoveryEngine().handle(createFailure(), {
        type: "escalate",
        severity: "high",
        channel: "human-approval",
        summary: "needs review",
      })
    ).resolves.toMatchObject({
      status: "failed",
      error: expect.objectContaining({ message: "escalationNotifier is required for escalate strategy" }),
    });

    await expect(
      new RecoveryEngine().handle(createFailure(), {
        type: "alternative",
        stepName: "fallback",
      })
    ).resolves.toMatchObject({
      status: "failed",
      error: expect.objectContaining({ message: "alternativeExecutor is required for alternative strategy" }),
    });

    await expect(
      new RecoveryEngine().handle(createFailure(), { type: "custom" } as unknown as RecoveryStrategy)
    ).resolves.toMatchObject({
      status: "failed",
      error: expect.objectContaining({ message: "unsupported recovery strategy: custom" }),
    });

    const retryFailure = new RecoveryEngine({
      wait: vi.fn().mockResolvedValue(undefined),
      retryExecutor: { executeRetry: vi.fn().mockRejectedValue("retry failed") },
    });
    await expect(
      retryFailure.handle(createFailure(), {
        type: "retry",
        mode: "linear",
        maxAttempts: 3,
        initialDelayMs: 10,
        maxDelayMs: 50,
      })
    ).resolves.toMatchObject({
      status: "failed",
      error: expect.objectContaining({ message: "retry failed" }),
    });

    const rollbackFailure = new RecoveryEngine({
      snapshotStore: { restore: vi.fn().mockRejectedValue("restore failed") },
    });
    await expect(
      rollbackFailure.handle(createFailure(), { type: "rollback", snapshotId: "snap-1" })
    ).resolves.toMatchObject({
      status: "failed",
      error: expect.objectContaining({ message: "restore failed" }),
    });

    const rollbackErrorFailure = new RecoveryEngine({
      snapshotStore: { restore: vi.fn().mockRejectedValue(new Error("restore error")) },
    });
    await expect(
      rollbackErrorFailure.handle(createFailure(), { type: "rollback", snapshotId: "snap-1" })
    ).resolves.toMatchObject({
      status: "failed",
      error: expect.objectContaining({ message: "restore error" }),
    });

    const passGateEngine = new RecoveryEngine({
      wait: vi.fn().mockResolvedValue(undefined),
      retryExecutor: { executeRetry: vi.fn().mockResolvedValue(undefined) },
      consensusGate: {
        evaluate: () => ({ status: "pass" }),
      },
    });
    await expect(
      passGateEngine.handle(
        createFailure(),
        {
          type: "retry",
          mode: "linear",
          maxAttempts: 3,
          initialDelayMs: 10,
          maxDelayMs: 50,
        },
        { consensusSessionId: "consensus-pass" }
      )
    ).resolves.toMatchObject({ status: "recovered" });
  });
});
