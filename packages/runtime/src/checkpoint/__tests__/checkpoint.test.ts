/**
 * M6-02: Checkpoint & Resume tests
 *
 * - CheckpointManager save/restore
 * - Policy drift detection
 * - Step restoration policies
 * - CheckpointFactoryRegistry
 * - StorageAdapter checkpoint methods (InMemory + SQLite)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { CheckpointManager, PolicyDriftError } from "../CheckpointManager.js";
import { CheckpointFactoryRegistry, CheckpointFactoryNotFoundError } from "../CheckpointFactoryRegistry.js";
import { computePolicyHash } from "../policy-hash.js";
import { InMemoryStorageAdapter } from "../../storage/inmemory-adapter.js";
import { SQLiteStorageAdapter } from "../../storage/sqlite-adapter.js";
import type { StorageAdapter, StepRecord, CheckpointRecord, CheckpointableFactory } from "../../storage/types.js";

function makeStep(runId: string, stepName: string, status: StepRecord["status"], output?: Record<string, unknown>): StepRecord {
  return {
    id: randomUUID(),
    runId,
    stepName,
    status,
    startedAt: new Date().toISOString(),
    completedAt: status === "completed" ? new Date().toISOString() : undefined,
    output,
  };
}

// ── Policy Hash ──

describe("computePolicyHash", () => {
  it("produces consistent hash for same input", () => {
    const config = { resources: { maxCostPerRun: 10 }, policies: { consensus: "majority" } };
    const h1 = computePolicyHash(config);
    const h2 = computePolicyHash(config);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA-256 hex
  });

  it("produces different hash for different input", () => {
    const h1 = computePolicyHash({ resources: { maxCostPerRun: 10 } });
    const h2 = computePolicyHash({ resources: { maxCostPerRun: 20 } });
    expect(h1).not.toBe(h2);
  });

  it("is key-order independent", () => {
    const h1 = computePolicyHash({ resources: { a: 1, b: 2 }, policies: { x: "y" } });
    const h2 = computePolicyHash({ policies: { x: "y" }, resources: { b: 2, a: 1 } });
    expect(h1).toBe(h2);
  });
});

// ── CheckpointFactoryRegistry ──

describe("CheckpointFactoryRegistry", () => {
  it("registers and retrieves factory", () => {
    const registry = new CheckpointFactoryRegistry();
    const factory: CheckpointableFactory<{ value: string }> = {
      fromCheckpoint: (snap) => ({ value: snap.value as string }),
    };
    registry.register("MyState", factory);
    expect(registry.has("MyState")).toBe(true);
    const restored = registry.get<{ value: string }>("MyState").fromCheckpoint({ value: "hello", schemaVersion: 1 });
    expect(restored.value).toBe("hello");
  });

  it("throws CheckpointFactoryNotFoundError for missing type", () => {
    const registry = new CheckpointFactoryRegistry();
    expect(() => registry.get("Missing")).toThrow(CheckpointFactoryNotFoundError);
  });
});

// ── CheckpointManager ──

function runCheckpointManagerTests(name: string, createAdapter: () => { adapter: StorageAdapter; cleanup?: () => void }) {
  describe(`CheckpointManager (${name})`, () => {
    let adapter: StorageAdapter;
    let cleanup: (() => void) | undefined;
    let mgr: CheckpointManager;

    beforeEach(() => {
      const result = createAdapter();
      adapter = result.adapter;
      cleanup = result.cleanup;
      mgr = new CheckpointManager(adapter);
    });

    afterEach(() => {
      cleanup?.();
    });

    it("saves and retrieves checkpoint", async () => {
      const runId = randomUUID();
      await adapter.saveRun({
        id: runId,
        workflowName: "test",
        status: "running",
        input: {},
        startedAt: new Date().toISOString(),
      });

      const cp = await mgr.saveCheckpoint(
        runId,
        "step-2",
        ["step-1", "step-2"],
        { outputs: { step1: "done" } },
        { resources: { max: 10 } },
      );

      const latest = await mgr.getLatestCheckpoint(runId);
      expect(latest).not.toBeNull();
      expect(latest!.runId).toBe(runId);
      expect(latest!.stepName).toBe("step-2");
      expect(latest!.completedSteps).toEqual(["step-1", "step-2"]);
      expect(latest!.stateSnapshot).toEqual({ outputs: { step1: "done" } });
      expect(latest!.policyHash).toHaveLength(64);
    });

    it("returns latest checkpoint when multiple exist", async () => {
      const runId = randomUUID();
      await adapter.saveRun({
        id: runId,
        workflowName: "test",
        status: "running",
        input: {},
        startedAt: new Date().toISOString(),
      });

      await mgr.saveCheckpoint(runId, "step-1", ["step-1"], {}, {});
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      await mgr.saveCheckpoint(runId, "step-2", ["step-1", "step-2"], {}, {});

      const latest = await mgr.getLatestCheckpoint(runId);
      expect(latest!.stepName).toBe("step-2");
    });

    it("returns null for non-existent run", async () => {
      const result = await mgr.getLatestCheckpoint("nonexistent");
      expect(result).toBeNull();
    });

    it("detects policy drift", async () => {
      const runId = randomUUID();
      await adapter.saveRun({
        id: runId,
        workflowName: "test",
        status: "running",
        input: {},
        startedAt: new Date().toISOString(),
      });

      const cp = await mgr.saveCheckpoint(
        runId, "step-1", ["step-1"], {},
        { resources: { maxCostPerRun: 10 } },
      );

      const drift = mgr.detectDrift(cp, { resources: { maxCostPerRun: 20 } });
      expect(drift.drifted).toBe(true);
      expect(drift.oldHash).not.toBe(drift.newHash);
    });

    it("no drift when config is same", async () => {
      const runId = randomUUID();
      await adapter.saveRun({
        id: runId,
        workflowName: "test",
        status: "running",
        input: {},
        startedAt: new Date().toISOString(),
      });

      const policyConfig = { resources: { maxCostPerRun: 10 } };
      const cp = await mgr.saveCheckpoint(runId, "step-1", ["step-1"], {}, policyConfig);

      const drift = mgr.detectDrift(cp, policyConfig);
      expect(drift.drifted).toBe(false);
    });
  });
}

runCheckpointManagerTests("InMemory", () => ({
  adapter: new InMemoryStorageAdapter(),
}));

runCheckpointManagerTests("SQLite", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "obora-cp-test-"));
  const adapter = new SQLiteStorageAdapter({ path: join(tmpDir, "test.db") });
  return {
    adapter,
    cleanup: () => {
      (adapter as SQLiteStorageAdapter).close();
      rmSync(tmpDir, { recursive: true, force: true });
    },
  };
});

// ── Step Restoration Policies ──

describe("CheckpointManager.resolveStepPolicies", () => {
  const mgr = new CheckpointManager(new InMemoryStorageAdapter());
  const runId = randomUUID();
  const allSteps = ["step-1", "step-2", "step-3", "step-4", "step-5"];

  it("restores completed, reruns failed, skips skipped", () => {
    const steps: StepRecord[] = [
      makeStep(runId, "step-1", "completed", { result: "ok" }),
      makeStep(runId, "step-2", "completed", { result: "ok" }),
      makeStep(runId, "step-3", "failed"),
      makeStep(runId, "step-4", "running"),
      makeStep(runId, "step-5", "skipped"),
    ];

    const policies = mgr.resolveStepPolicies(steps, ["step-1", "step-2"], allSteps);

    expect(policies[0]).toEqual({ stepName: "step-1", action: "restore", output: { result: "ok" } });
    expect(policies[1]).toEqual({ stepName: "step-2", action: "restore", output: { result: "ok" } });
    expect(policies[2]).toEqual({ stepName: "step-3", action: "rerun" });
    expect(policies[3]).toEqual({ stepName: "step-4", action: "rerun" });
    expect(policies[4]).toEqual({ stepName: "step-5", action: "skip" });
  });

  it("throws on invalid fromStep", () => {
    const steps: StepRecord[] = [
      makeStep(runId, "step-1", "completed", { result: "ok" }),
    ];

    expect(() =>
      mgr.resolveStepPolicies(steps, ["step-1"], allSteps, { fromStep: "nonexistent" }),
    ).toThrow("Invalid fromStep: 'nonexistent'");
  });

  it("supports fromStep override", () => {
    const steps: StepRecord[] = [
      makeStep(runId, "step-1", "completed", { result: "ok" }),
      makeStep(runId, "step-2", "completed", { result: "ok" }),
      makeStep(runId, "step-3", "completed", { result: "ok" }),
    ];

    const policies = mgr.resolveStepPolicies(
      steps,
      ["step-1", "step-2", "step-3"],
      allSteps,
      { fromStep: "step-2" },
    );

    expect(policies[0].action).toBe("restore"); // step-1 before fromStep
    expect(policies[1].action).toBe("rerun");   // step-2 = fromStep
    expect(policies[2].action).toBe("rerun");   // step-3 after fromStep
    expect(policies[3].action).toBe("rerun");   // step-4 after fromStep
    expect(policies[4].action).toBe("rerun");   // step-5 after fromStep
  });
});

// ── Resume Integration Test (5-step pipeline, step 3 fail → resume → complete) ──

describe("Resume integration (5-step pipeline)", () => {
  it("resumes from step 3 failure and completes", async () => {
    // We test via CheckpointManager + InMemoryStorageAdapter directly
    const adapter = new InMemoryStorageAdapter();
    const mgr = new CheckpointManager(adapter);
    const runId = randomUUID();
    const policyConfig = { resources: { maxCostPerRun: 10 } };

    // Simulate initial run that failed at step 3
    await adapter.saveRun({
      id: runId,
      workflowName: "test-pipeline",
      status: "failed",
      input: { task: "test" },
      startedAt: new Date().toISOString(),
    });

    const completedSteps = ["step-1", "step-2"];
    const stateSnapshot = {
      "step-1": { output: "result-1" },
      "step-2": { output: "result-2" },
    };

    // Save steps
    for (const name of ["step-1", "step-2"]) {
      await adapter.saveStep(makeStep(runId, name, "completed", { output: `result-${name}` }));
    }
    await adapter.saveStep(makeStep(runId, "step-3", "failed"));

    // Save checkpoint at failure point
    await mgr.saveCheckpoint(runId, "step-3", completedSteps, stateSnapshot, policyConfig);

    // Resume: load checkpoint and resolve step policies
    const checkpoint = await mgr.getLatestCheckpoint(runId);
    expect(checkpoint).not.toBeNull();

    const drift = mgr.detectDrift(checkpoint!, policyConfig);
    expect(drift.drifted).toBe(false);

    const allStepNames = ["step-1", "step-2", "step-3", "step-4", "step-5"];
    const policies = mgr.resolveStepPolicies(
      await adapter.getSteps(runId),
      checkpoint!.completedSteps,
      allStepNames,
    );

    expect(policies[0].action).toBe("restore"); // step-1
    expect(policies[1].action).toBe("restore"); // step-2
    expect(policies[2].action).toBe("rerun");   // step-3 (failed)
    expect(policies[3].action).toBe("rerun");   // step-4 (not yet run)
    expect(policies[4].action).toBe("rerun");   // step-5 (not yet run)

    const restored = policies.filter((p) => p.action === "restore");
    const rerun = policies.filter((p) => p.action === "rerun");
    expect(restored).toHaveLength(2);
    expect(rerun).toHaveLength(3);
  });
});
