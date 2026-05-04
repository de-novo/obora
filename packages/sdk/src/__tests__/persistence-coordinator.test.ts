import { describe, expect, it, vi } from "vitest";
import { PersistenceCoordinator } from "../execution/persistence-coordinator.js";
import type { PersistenceManager } from "../persistence/persistence-manager.js";
import type { StorageAdapter } from "@obora/runtime";

describe("PersistenceCoordinator", () => {
  const createMockAdapter = (): StorageAdapter => ({
    saveRun: vi.fn().mockResolvedValue(undefined),
    saveStep: vi.fn().mockResolvedValue(undefined),
    saveAuditEvent: vi.fn().mockResolvedValue(undefined),
    getRun: vi.fn().mockResolvedValue(undefined),
    getRuns: vi.fn().mockResolvedValue([]),
  }) as unknown as StorageAdapter;

  const createMockManager = (adapter: StorageAdapter): PersistenceManager =>
    ({
      getStorageAdapter: vi.fn().mockResolvedValue(adapter),
    }) as unknown as PersistenceManager;

  it("does nothing when persistence is disabled", async () => {
    const manager = createMockManager(createMockAdapter());
    const coordinator = new PersistenceCoordinator({ persistenceManager: manager });

    await coordinator.saveRunOnError(
      "exec-1",
      "wf-1",
      {
        id: "exec-1",
        workflowName: "wf-1",
        status: "failed",
        input: {},
        startedAt: new Date("2024-01-01"),
        stepOrder: [],
        completedSteps: [],
        stepRecords: {},
        outputs: {},
      },
      undefined,
      "ERR",
      false,
      undefined,
      undefined
    );

    expect(manager.getStorageAdapter).not.toHaveBeenCalled();
  });

  it("saves run with error details when persistence is enabled", async () => {
    const adapter = createMockAdapter();
    const manager = createMockManager(adapter);
    const coordinator = new PersistenceCoordinator({ persistenceManager: manager });
    const startedAt = new Date("2024-01-01T00:00:00Z");
    const endedAt = new Date("2024-01-01T00:01:00Z");

    await coordinator.saveRunOnError(
      "exec-1",
      "wf-1",
      {
        id: "exec-1",
        workflowName: "wf-1",
        status: "failed",
        input: { key: "value" },
        startedAt,
        endedAt,
        error: "something broke",
        stepOrder: ["step1"],
        completedSteps: ["step1"],
        stepRecords: {},
        outputs: {},
      },
      { var1: "hello" },
      "SDK_UNKNOWN_ERROR",
      true,
      { enabled: true, adapter: "sqlite", sqlite: { path: ":memory:" } },
      undefined
    );

    expect(manager.getStorageAdapter).toHaveBeenCalledTimes(1);
    expect(adapter.saveRun).toHaveBeenCalledTimes(1);
    const saved = (adapter.saveRun as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saved).toMatchObject({
      id: "exec-1",
      workflowName: "wf-1",
      status: "failed",
      input: { value: { key: "value" } },
      startedAt: startedAt.toISOString(),
      completedAt: endedAt.toISOString(),
      metadata: {
        variables: { var1: "hello" },
        error: "something broke",
        errorCode: "SDK_UNKNOWN_ERROR",
      },
    });
  });

  it("includes repair loop summary when provided", async () => {
    const adapter = createMockAdapter();
    const manager = createMockManager(adapter);
    const coordinator = new PersistenceCoordinator({ persistenceManager: manager });
    const repairSummary = {
      validationFailed: 3,
      validationPassed: 1,
      repairStarted: 3,
      repairCompleted: 1,
      repairNoProgress: 0,
      backEdgeTriggered: 2,
      backEdgeExhausted: 1,
      recentValidationFailures: [],
    };

    await coordinator.saveRunOnError(
      "exec-2",
      "wf-2",
      {
        id: "exec-2",
        workflowName: "wf-2",
        status: "failed",
        input: null,
        startedAt: new Date(),
        stepOrder: [],
        completedSteps: [],
        stepRecords: {},
        outputs: {},
      },
      undefined,
      "POLICY_RESOURCE_EXCEEDED",
      true,
      { enabled: true, adapter: "sqlite", sqlite: { path: ":memory:" } },
      repairSummary
    );

    const saved = (adapter.saveRun as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saved.metadata.repairLoop).toEqual(repairSummary);
  });

  it("logs warning when save fails", async () => {
    const adapter = createMockAdapter();
    (adapter.saveRun as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("disk full"));
    const manager = createMockManager(adapter);
    const warn = vi.fn();
    const coordinator = new PersistenceCoordinator({
      persistenceManager: manager,
      logger: { warn },
    });

    await coordinator.saveRunOnError(
      "exec-3",
      "wf-3",
      {
        id: "exec-3",
        workflowName: "wf-3",
        status: "failed",
        input: null,
        startedAt: new Date(),
        stepOrder: [],
        completedSteps: [],
        stepRecords: {},
        outputs: {},
      },
      undefined,
      "ERR",
      true,
      { enabled: true, adapter: "sqlite", sqlite: { path: ":memory:" } },
      undefined
    );

    expect(warn).toHaveBeenCalledWith("[persistence] Failed to save run on error:", expect.any(Error));
  });
});
