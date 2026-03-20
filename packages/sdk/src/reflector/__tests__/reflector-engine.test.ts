import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { ReflectorEngine } from "../reflector-engine.js";
import { KnowledgeStore } from "../knowledge-store.js";
import type { AnalyzerContext } from "../analyzer.js";
import type { ReflectorRule } from "../rule-engine.js";
import { BlackboardManager } from "../../blackboard/blackboard-manager.js";
import type { FailureEntry } from "../../blackboard/blackboard-manager.js";
import type { ValidationResult } from "../../validation-repair.js";

function makeFailure(
  stepName: string,
  summary: string,
  failedChecks: Array<{ name: string; message: string }> = [],
  attempt = 1,
  signature?: string,
): FailureEntry {
  const validation: ValidationResult = {
    passed: false,
    summary,
    failedChecks: failedChecks.map((c) => ({
      name: c.name,
      message: c.message,
      severity: "error" as const,
    })),
    signature,
  };
  return { stepName, attempt, validation, timestamp: new Date() };
}

function makeContext(
  failures: FailureEntry[],
  stepName = "build",
  attempt = 1,
): AnalyzerContext {
  return { failures, stepName, attempt, knowledgeBase: [] };
}

// ── ReflectorEngine ──────────────────────────────────────────────────

describe("ReflectorEngine", () => {
  it("constructs with defaults (no arguments)", () => {
    const engine = new ReflectorEngine();
    expect(engine).toBeDefined();
  });

  it("analyzes empty failures gracefully", () => {
    const engine = new ReflectorEngine();
    const output = engine.analyze(makeContext([]));
    expect(output.hints).toBe("");
    expect(output.insights).toHaveLength(0);
    expect(output.actions).toHaveLength(0);
    expect(output.knowledgeUsed).toHaveLength(0);
  });

  it("produces hints from keyword analysis", () => {
    const engine = new ReflectorEngine();
    const failures = [
      makeFailure("build", "backup timing issues", [
        { name: "impl: backup", message: "backup stores current data" },
      ]),
      makeFailure("build", "backup logic broken", [
        { name: "impl: restore", message: "backup creation logic broken" },
      ]),
      makeFailure("build", "backup creation bugs", [
        { name: "impl: backup recovery", message: "data integrity" },
      ]),
    ];
    const output = engine.analyze(makeContext(failures));
    expect(output.hints).toContain("backup");
    expect(output.insights.length).toBeGreaterThan(0);
  });

  it("produces hints with trend detection", () => {
    const engine = new ReflectorEngine();
    const failures = [
      makeFailure("build", "f", [{ name: "b1", message: "m" }]),
      makeFailure("build", "f", [
        { name: "b1", message: "m" },
        { name: "b2", message: "m" },
      ]),
      makeFailure("build", "f", [
        { name: "b1", message: "m" },
        { name: "b2", message: "m" },
        { name: "b3", message: "m" },
      ]),
    ];
    const output = engine.analyze(makeContext(failures));
    expect(output.hints).toContain("WORSENING TREND");
  });

  it("includes escalation message for >= 3 failures", () => {
    const engine = new ReflectorEngine();
    const failures = [
      makeFailure("build", "error 1"),
      makeFailure("build", "error 2"),
      makeFailure("build", "error 3"),
    ];
    const output = engine.analyze(makeContext(failures));
    expect(output.hints).toContain("fundamentally different approach");
  });

  // ── Backward compatibility ─────────────────────────────────────────

  describe("analyzeFailures (backward compatible)", () => {
    it("returns undefined for empty failures", () => {
      const engine = new ReflectorEngine();
      expect(engine.analyzeFailures([])).toBeUndefined();
    });

    it("returns undefined when no relevant failures for step", () => {
      const engine = new ReflectorEngine();
      const failures = [makeFailure("other-step", "something failed")];
      expect(engine.analyzeFailures(failures, "my-step")).toBeUndefined();
    });

    it("returns hint string for matching failures", () => {
      const engine = new ReflectorEngine();
      const failures = [
        makeFailure("build", "error 1"),
        makeFailure("build", "error 2"),
        makeFailure("build", "error 3"),
      ];
      const hint = engine.analyzeFailures(failures, "build");
      expect(hint).toBeDefined();
      expect(typeof hint).toBe("string");
    });

    it("analyzes all failures when no step filter", () => {
      const engine = new ReflectorEngine();
      const failures = [
        makeFailure("build", "error A"),
        makeFailure("test", "error B"),
        makeFailure("deploy", "error C"),
      ];
      const hint = engine.analyzeFailures(failures);
      expect(hint).toBeDefined();
      expect(hint).toContain("3 validation failures total");
    });
  });

  // ── Rule engine integration ────────────────────────────────────────

  describe("with rules", () => {
    it("evaluates rules and returns matching actions", () => {
      const rules: ReflectorRule[] = [
        {
          name: "cost_limit",
          when: { min_attempt: 5 },
          actions: [
            { type: "abort", priority: 100, payload: { reason: "exceeded 5 attempts" } },
          ],
        },
      ];
      const engine = new ReflectorEngine({ rules });
      const failures = Array.from({ length: 5 }, (_, i) =>
        makeFailure("build", `error ${i + 1}`, [], i + 1)
      );
      const output = engine.analyze(makeContext(failures, "build", 5));
      // Rule should match and produce an action
      expect(output.actions.length).toBeGreaterThan(0);
    });

    it("does not produce rule actions when conditions not met", () => {
      const rules: ReflectorRule[] = [
        {
          name: "cost_limit",
          when: { min_attempt: 10 },
          actions: [
            { type: "abort", priority: 100, payload: { reason: "too many" } },
          ],
        },
      ];
      const engine = new ReflectorEngine({ rules });
      const output = engine.analyze(
        makeContext([makeFailure("build", "error")], "build", 1)
      );
      expect(output.actions).toHaveLength(0);
    });
  });

  // ── Knowledge store integration ────────────────────────────────────

  describe("with knowledge store", () => {
    let tempDir: string;
    let storePath: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), "obora-reflector-test-"));
      storePath = join(tempDir, "knowledge.json");
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it("uses prior knowledge in hints", () => {
      const store = new KnowledgeStore(storePath);
      store.recordPattern("backup timing", "redesign backup logic", true);

      const engine = new ReflectorEngine({ knowledgeStore: store });
      const failures = [
        makeFailure("build", "backup timing issues", [
          { name: "impl: backup", message: "backup stores current data" },
        ]),
        makeFailure("build", "backup logic broken", [
          { name: "impl: restore", message: "backup creation broken" },
        ]),
      ];
      const output = engine.analyze(makeContext(failures));
      expect(output.knowledgeUsed.length).toBeGreaterThan(0);
      expect(output.hints).toContain("Prior knowledge");
    });

    it("records outcomes and saves to store", async () => {
      const store = new KnowledgeStore(storePath);
      const engine = new ReflectorEngine({ knowledgeStore: store });

      // Trigger analysis to record patterns
      const failures = [
        makeFailure("build", "backup timing issues", [
          { name: "impl: backup", message: "backup stores current data" },
        ]),
        makeFailure("build", "backup logic broken", [
          { name: "impl: restore", message: "backup creation broken" },
        ]),
      ];
      engine.analyze(makeContext(failures));

      // Record outcome
      await engine.recordOutcome("exec-1", true, "test-wf");
      expect(store.size).toBeGreaterThan(0);
    });
  });

  // ── Combined pipeline (overnight-builder scenario) ──────────────────

  it("produces rich output for overnight-builder scenario", () => {
    const engine = new ReflectorEngine();
    const failures = [
      makeFailure(
        "run_tests_and_judge",
        "5 tests failed due to backup/restore functionality issues",
        [{ name: "implementation_bug: backup timing", message: "backup stores current data instead of previous state" }],
        1,
        "implementation_bug:1"
      ),
      makeFailure(
        "run_tests_and_judge",
        "9 tests failed across backup logic, error handling, and E2E recovery",
        [
          { name: "implementation_bug: backup creation", message: "backup creation logic broken" },
          { name: "implementation_bug: exit code", message: "exit code propagation failed" },
          { name: "implementation_bug: data integrity", message: "data integrity under stress" },
        ],
        2,
        "implementation_bug:3"
      ),
      makeFailure(
        "run_tests_and_judge",
        "13 tests failed - backup creation/restore logic bugs and exitCode mapping errors",
        [
          { name: "implementation_bug: backup restore", message: "backup restore not working" },
          { name: "implementation_bug: exitCode mapping", message: "wrong exit codes" },
          { name: "implementation_bug: backup creation", message: "backup timing still wrong" },
          { name: "implementation_bug: recovery", message: "recovery scenario fails" },
          { name: "implementation_bug: data corruption", message: "data corrupted after stress" },
        ],
        3,
        "implementation_bug:5"
      ),
    ];

    const output = engine.analyze(makeContext(failures, "run_tests_and_judge", 3));
    expect(output.hints).toContain("backup");
    expect(output.hints).toContain("implementation_bug");
    expect(output.hints).toContain("WORSENING");
    expect(output.hints).toContain("fundamentally different approach");
    expect(output.insights.length).toBeGreaterThanOrEqual(3);
  });

  // ── executeActions ─────────────────────────────────────────────────

  it("executeActions runs actions through registry", () => {
    const engine = new ReflectorEngine();
    const results = engine.executeActions(
      [
        { type: "inject_context", priority: 50, payload: { content: "test hint" } },
        { type: "abort", priority: 100, payload: { reason: "done" } },
      ],
      {
        cursor: 0,
        stepIndexByName: new Map([["build", 0]]),
        repairContext: { mode: "repair" as const, attempt: 1 },
        blackboard: new BlackboardManager(),
      }
    );
    // Abort has higher priority, so it comes first
    expect(results[0]!.abort?.reason).toBe("done");
    expect(results[1]!.promptInjection).toBe("test hint");
  });
});
