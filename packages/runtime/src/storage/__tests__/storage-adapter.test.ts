/**
 * M6-01: StorageAdapter contract tests
 *
 * Tests run against both InMemoryStorageAdapter and SQLiteStorageAdapter
 * to verify the interface contract is correctly implemented.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { StorageAdapter, RunRecord, StepRecord, ArtifactRecord, CostRecord, StructuredAuditEvent } from "../types.js";
import { InMemoryStorageAdapter } from "../inmemory-adapter.js";
import { SQLiteStorageAdapter } from "../sqlite-adapter.js";

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: randomUUID(),
    workflowName: "test-workflow",
    status: "running",
    input: { task: "test" },
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeStep(runId: string, overrides: Partial<StepRecord> = {}): StepRecord {
  return {
    id: randomUUID(),
    runId,
    stepName: "step-1",
    status: "running",
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeArtifact(runId: string, overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: randomUUID(),
    runId,
    stepName: "step-1",
    name: "output.json",
    mimeType: "application/json",
    sizeBytes: 1024,
    storageRef: "/data/artifacts/test",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeCost(runId: string, overrides: Partial<CostRecord> = {}): CostRecord {
  return {
    id: randomUUID(),
    runId,
    stepName: "step-1",
    model: "gpt-4o",
    promptTokens: 120,
    completionTokens: 80,
    totalTokens: 200,
    costUsd: 0.0012,
    latencyMs: 345,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeAuditEvent(runId: string, overrides: Partial<StructuredAuditEvent> = {}): StructuredAuditEvent {
  return {
    id: randomUUID(),
    runId,
    stepName: "step-1",
    timestamp: new Date().toISOString(),
    category: "execution",
    action: "step_start",
    actor: "system",
    detail: { ok: true },
    ...overrides,
  };
}

function runContractTests(name: string, factory: () => { adapter: StorageAdapter; cleanup?: () => void }) {
  describe(`StorageAdapter contract: ${name}`, () => {
    let adapter: StorageAdapter;
    let cleanup: (() => void) | undefined;

    beforeEach(() => {
      const result = factory();
      adapter = result.adapter;
      cleanup = result.cleanup;
    });

    afterEach(() => {
      cleanup?.();
    });

    // ── Run tests ──

    it("saveRun + getRun round-trip", async () => {
      const run = makeRun();
      await adapter.saveRun(run);
      const loaded = await adapter.getRun(run.id);
      expect(loaded).toEqual(run);
    });

    it("getRun returns null for unknown id", async () => {
      const loaded = await adapter.getRun("nonexistent");
      expect(loaded).toBeNull();
    });

    it("saveRun upserts on conflict", async () => {
      const run = makeRun();
      await adapter.saveRun(run);
      const updated = { ...run, status: "completed" as const, completedAt: new Date().toISOString() };
      await adapter.saveRun(updated);
      const loaded = await adapter.getRun(run.id);
      expect(loaded?.status).toBe("completed");
      expect(loaded?.completedAt).toBe(updated.completedAt);
    });

    it("listRuns returns all runs", async () => {
      const r1 = makeRun({ startedAt: "2026-01-01T00:00:00Z" });
      const r2 = makeRun({ startedAt: "2026-01-02T00:00:00Z" });
      await adapter.saveRun(r1);
      await adapter.saveRun(r2);
      const list = await adapter.listRuns({});
      expect(list).toHaveLength(2);
      // Descending order
      expect(list[0]!.id).toBe(r2.id);
    });

    it("listRuns filters by status", async () => {
      await adapter.saveRun(makeRun({ status: "running" }));
      await adapter.saveRun(makeRun({ status: "completed" }));
      const list = await adapter.listRuns({ status: "completed" });
      expect(list).toHaveLength(1);
      expect(list[0]!.status).toBe("completed");
    });

    it("saveRun supports aborted status", async () => {
      const run = makeRun({ status: "aborted", completedAt: new Date().toISOString() });
      await adapter.saveRun(run);
      const loaded = await adapter.getRun(run.id);
      expect(loaded?.status).toBe("aborted");
      expect(loaded?.completedAt).toBe(run.completedAt);
    });

    it("listRuns filters by workflowName", async () => {
      await adapter.saveRun(makeRun({ workflowName: "wf-a" }));
      await adapter.saveRun(makeRun({ workflowName: "wf-b" }));
      const list = await adapter.listRuns({ workflowName: "wf-a" });
      expect(list).toHaveLength(1);
    });

    it("listRuns supports limit and offset", async () => {
      for (let i = 0; i < 5; i++) {
        await adapter.saveRun(makeRun({ startedAt: `2026-01-0${i + 1}T00:00:00Z` }));
      }
      const page = await adapter.listRuns({ limit: 2, offset: 1 });
      expect(page).toHaveLength(2);
    });

    it("listRuns filters by date range", async () => {
      await adapter.saveRun(makeRun({ startedAt: "2026-01-01T00:00:00Z" }));
      await adapter.saveRun(makeRun({ startedAt: "2026-02-01T00:00:00Z" }));
      await adapter.saveRun(makeRun({ startedAt: "2026-03-01T00:00:00Z" }));
      const list = await adapter.listRuns({ from: "2026-01-15T00:00:00Z", to: "2026-02-15T00:00:00Z" });
      expect(list).toHaveLength(1);
    });

    // ── Step tests ──

    it("saveStep + getSteps round-trip", async () => {
      const run = makeRun();
      await adapter.saveRun(run);
      const step = makeStep(run.id);
      await adapter.saveStep(step);
      const steps = await adapter.getSteps(run.id);
      expect(steps).toHaveLength(1);
      expect(steps[0]).toEqual(step);
    });

    it("saveStep upserts on conflict", async () => {
      const run = makeRun();
      await adapter.saveRun(run);
      const step = makeStep(run.id);
      await adapter.saveStep(step);
      const updated = { ...step, status: "completed" as const, completedAt: new Date().toISOString(), durationMs: 500 };
      await adapter.saveStep(updated);
      const steps = await adapter.getSteps(run.id);
      expect(steps).toHaveLength(1);
      expect(steps[0]!.status).toBe("completed");
      expect(steps[0]!.durationMs).toBe(500);
    });

    it("getSteps returns empty for unknown runId", async () => {
      const steps = await adapter.getSteps("nonexistent");
      expect(steps).toEqual([]);
    });

    it("saveStep preserves error field", async () => {
      const run = makeRun();
      await adapter.saveRun(run);
      const step = makeStep(run.id, {
        status: "failed",
        error: { code: "ERR_TIMEOUT", message: "Step timed out", stack: "at line 1" },
      });
      await adapter.saveStep(step);
      const steps = await adapter.getSteps(run.id);
      expect(steps[0]!.error).toEqual({ code: "ERR_TIMEOUT", message: "Step timed out", stack: "at line 1" });
    });

    // ── Artifact tests ──

    it("saveArtifact + getArtifacts round-trip", async () => {
      const run = makeRun();
      await adapter.saveRun(run);
      const artifact = makeArtifact(run.id);
      const saved = await adapter.saveArtifact(artifact);
      expect(saved.id).toBe(artifact.id);
      const artifacts = await adapter.getArtifacts(run.id);
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0]!.name).toBe("output.json");
    });

    it("getArtifacts filters by stepName", async () => {
      const run = makeRun();
      await adapter.saveRun(run);
      await adapter.saveArtifact(makeArtifact(run.id, { stepName: "step-1" }));
      await adapter.saveArtifact(makeArtifact(run.id, { stepName: "step-2" }));
      const filtered = await adapter.getArtifacts(run.id, "step-1");
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.stepName).toBe("step-1");
    });

    it("deleteArtifact performs soft-delete", async () => {
      const run = makeRun();
      await adapter.saveRun(run);
      const artifact = makeArtifact(run.id);
      await adapter.saveArtifact(artifact);

      await adapter.deleteArtifact(artifact.id);

      // Should not appear in getArtifacts
      const artifacts = await adapter.getArtifacts(run.id);
      expect(artifacts).toHaveLength(0);
    });

    it("getArtifacts returns empty for unknown runId", async () => {
      const artifacts = await adapter.getArtifacts("nonexistent");
      expect(artifacts).toEqual([]);
    });

    // ── Run with metadata ──

    it("preserves metadata in run record", async () => {
      const run = makeRun({ metadata: { userId: "user-123", tags: ["experiment-1"] } });
      await adapter.saveRun(run);
      const loaded = await adapter.getRun(run.id);
      expect(loaded?.metadata).toEqual({ userId: "user-123", tags: ["experiment-1"] });
    });

    it("handles run without metadata", async () => {
      const run = makeRun();
      delete run.metadata;
      await adapter.saveRun(run);
      const loaded = await adapter.getRun(run.id);
      expect(loaded?.metadata).toBeUndefined();
    });

    // ── Cost tests ──

    it("saveCost + getCosts round-trip", async () => {
      const run = makeRun();
      await adapter.saveRun(run);
      const cost = makeCost(run.id);
      await adapter.saveCost(cost);

      const costs = await adapter.getCosts(run.id);
      expect(costs).toHaveLength(1);
      expect(costs[0]).toEqual(cost);
    });

    it("getCosts filters by stepName", async () => {
      const run = makeRun();
      await adapter.saveRun(run);
      await adapter.saveCost(makeCost(run.id, { stepName: "step-a" }));
      await adapter.saveCost(makeCost(run.id, { stepName: "step-b" }));

      const costs = await adapter.getCosts(run.id, "step-a");
      expect(costs).toHaveLength(1);
      expect(costs[0]?.stepName).toBe("step-a");
    });

    it("getRunCostSummary aggregates by step/model", async () => {
      const run = makeRun();
      await adapter.saveRun(run);
      await adapter.saveCost(makeCost(run.id, { stepName: "draft", model: "gpt-4o", totalTokens: 100, costUsd: 0.1 }));
      await adapter.saveCost(makeCost(run.id, { stepName: "draft", model: "gpt-4o", totalTokens: 50, costUsd: 0.05 }));
      await adapter.saveCost(makeCost(run.id, { stepName: "review", model: "claude-sonnet-4", totalTokens: 30, costUsd: 0.02 }));

      const summary = await adapter.getRunCostSummary(run.id);
      expect(summary.totalTokens).toBe(180);
      expect(summary.totalCostUsd).toBeCloseTo(0.17);
      expect(summary.byStep.find((s) => s.stepName === "draft")?.tokens).toBe(150);
      expect(summary.byModel.find((m) => m.model === "gpt-4o")?.costUsd).toBeCloseTo(0.15);
    });

    it("saveAuditEvent + getAuditTimeline round-trip", async () => {
      const run = makeRun();
      await adapter.saveRun(run);
      const e1 = makeAuditEvent(run.id, { timestamp: "2026-02-18T01:00:00.000Z", stepName: "a" });
      const e2 = makeAuditEvent(run.id, { timestamp: "2026-02-18T01:00:01.000Z", stepName: "b", category: "consensus" });
      await adapter.saveAuditEvent(e2);
      await adapter.saveAuditEvent(e1);

      const timeline = await adapter.getAuditTimeline(run.id);
      expect(timeline).toHaveLength(2);
      expect(timeline[0]?.id).toBe(e1.id);
      expect(timeline[1]?.id).toBe(e2.id);
    });

    it("getAuditTimeline filters by stepName", async () => {
      const run = makeRun();
      await adapter.saveRun(run);
      await adapter.saveAuditEvent(makeAuditEvent(run.id, { stepName: "alpha" }));
      await adapter.saveAuditEvent(makeAuditEvent(run.id, { stepName: "beta" }));

      const timeline = await adapter.getAuditTimeline(run.id, "alpha");
      expect(timeline).toHaveLength(1);
      expect(timeline[0]?.stepName).toBe("alpha");
    });
  });
}

// ── Run contract tests for both adapters ──

runContractTests("InMemoryStorageAdapter", () => ({
  adapter: new InMemoryStorageAdapter(),
}));

runContractTests("SQLiteStorageAdapter", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "obora-test-"));
  const dbPath = join(tmpDir, "test.db");
  const adapter = new SQLiteStorageAdapter({ path: dbPath });
  return {
    adapter,
    cleanup: () => {
      (adapter as SQLiteStorageAdapter).close();
      rmSync(tmpDir, { recursive: true, force: true });
    },
  };
});
