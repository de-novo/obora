import { describe, it, expect } from "vitest";
import {
  KeywordAnalyzer,
  SignatureAnalyzer,
  CategoryAnalyzer,
  TrendAnalyzer,
  createDefaultAnalyzers,
  detectTrend,
  extractKeywords,
  extractSignatures,
  extractCategories,
} from "../analyzer.js";
import type { AnalyzerContext } from "../analyzer.js";
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
  attempt = 1
): AnalyzerContext {
  return { failures, stepName, attempt, knowledgeBase: [] };
}

// ── KeywordAnalyzer ──────────────────────────────────────────────────

describe("KeywordAnalyzer", () => {
  const analyzer = new KeywordAnalyzer();

  it("returns undefined for fewer than 2 failures", () => {
    const ctx = makeContext([makeFailure("build", "one error")]);
    expect(analyzer.analyze(ctx)).toBeUndefined();
  });

  it("detects recurring keywords across failures", () => {
    const failures = [
      makeFailure("build", "backup/restore timing issues", [
        { name: "impl: backup", message: "backup stores current data" },
      ]),
      makeFailure("build", "backup logic and error handling broken", [
        { name: "impl: restore", message: "backup creation logic broken" },
      ]),
      makeFailure("build", "backup creation bugs and exitCode errors", [
        { name: "impl: backup recovery", message: "data integrity under stress" },
      ]),
    ];
    const result = analyzer.analyze(makeContext(failures));
    expect(result).toBeDefined();
    expect(result!.insights[0]).toContain("backup");
    expect(result!.category).toBe("keyword");
  });

  it("does not flag keywords that appear in only one failure", () => {
    const failures = [
      makeFailure("build", "typecheck error in main.ts"),
      makeFailure("build", "lint warning in utils.ts"),
    ];
    const result = analyzer.analyze(makeContext(failures));
    expect(result).toBeUndefined();
  });
});

// ── SignatureAnalyzer ────────────────────────────────────────────────

describe("SignatureAnalyzer", () => {
  const analyzer = new SignatureAnalyzer();

  it("returns undefined when no signatures repeat", () => {
    const failures = [
      makeFailure("build", "fail", [], 1, "sig_a"),
      makeFailure("build", "fail", [], 2, "sig_b"),
    ];
    expect(analyzer.analyze(makeContext(failures))).toBeUndefined();
  });

  it("detects repeated signatures", () => {
    const failures = [
      makeFailure("build", "fail 1", [], 1, "implementation_bug:3"),
      makeFailure("build", "fail 2", [], 2, "implementation_bug:3"),
      makeFailure("build", "fail 3", [], 3, "implementation_bug:3"),
    ];
    const result = analyzer.analyze(makeContext(failures));
    expect(result).toBeDefined();
    expect(result!.insights[0]).toContain("implementation_bug:3");
    expect(result!.insights[0]).toContain("3 times");
    expect(result!.category).toBe("signature");
  });
});

// ── CategoryAnalyzer ─────────────────────────────────────────────────

describe("CategoryAnalyzer", () => {
  const analyzer = new CategoryAnalyzer();

  it("returns undefined for failures without checks", () => {
    const failures = [makeFailure("build", "fail 1"), makeFailure("build", "fail 2")];
    expect(analyzer.analyze(makeContext(failures))).toBeUndefined();
  });

  it("extracts and counts failure categories", () => {
    const failures = [
      makeFailure("build", "fail 1", [
        { name: "implementation_bug: backup timing", message: "wrong order" },
        { name: "implementation_bug: restore logic", message: "data lost" },
      ]),
      makeFailure("build", "fail 2", [
        { name: "test_code_bug: assertion", message: "wrong expected" },
        { name: "implementation_bug: exit code", message: "not propagated" },
      ]),
    ];
    const result = analyzer.analyze(makeContext(failures));
    expect(result).toBeDefined();
    expect(result!.insights[0]).toContain("implementation_bug");
    expect(result!.insights[0]).toContain("3x");
    expect(result!.category).toBe("category");
  });
});

// ── TrendAnalyzer ────────────────────────────────────────────────────

describe("TrendAnalyzer", () => {
  const analyzer = new TrendAnalyzer();

  it("returns undefined for fewer than 3 failures", () => {
    const failures = [
      makeFailure("build", "f1", [{ name: "b1", message: "m" }]),
      makeFailure("build", "f2", [{ name: "b1", message: "m" }]),
    ];
    expect(analyzer.analyze(makeContext(failures))).toBeUndefined();
  });

  it("detects worsening trend", () => {
    const failures = [
      makeFailure("build", "f", [{ name: "b1", message: "m" }]),
      makeFailure("build", "f", [{ name: "b1", message: "m" }, { name: "b2", message: "m" }]),
      makeFailure("build", "f", [{ name: "b1", message: "m" }, { name: "b2", message: "m" }, { name: "b3", message: "m" }]),
    ];
    const result = analyzer.analyze(makeContext(failures));
    expect(result).toBeDefined();
    expect(result!.insights[0]).toContain("WORSENING TREND");
    expect(result!.insights[0]).toContain("1 → 2 → 3");
    expect(result!.category).toBe("trend:worsening");
    expect(result!.suggestedActions.length).toBeGreaterThan(0);
  });

  it("detects improving trend", () => {
    const failures = [
      makeFailure("build", "f", [{ name: "b1", message: "m" }, { name: "b2", message: "m" }, { name: "b3", message: "m" }]),
      makeFailure("build", "f", [{ name: "b1", message: "m" }, { name: "b2", message: "m" }]),
      makeFailure("build", "f", [{ name: "b1", message: "m" }]),
    ];
    const result = analyzer.analyze(makeContext(failures));
    expect(result).toBeDefined();
    expect(result!.insights[0]).toContain("Improving trend");
    expect(result!.insights[0]).toContain("3 → 2 → 1");
  });

  it("detects stable trend", () => {
    const failures = [
      makeFailure("build", "f", [{ name: "b1", message: "m" }, { name: "b2", message: "m" }]),
      makeFailure("build", "f", [{ name: "b1", message: "m" }, { name: "b2", message: "m" }]),
      makeFailure("build", "f", [{ name: "b1", message: "m" }, { name: "b2", message: "m" }]),
    ];
    const result = analyzer.analyze(makeContext(failures));
    expect(result).toBeDefined();
    expect(result!.insights[0]).toContain("Stable failure count");
  });
});

// ── Helper functions ─────────────────────────────────────────────────

describe("helper functions", () => {
  it("detectTrend returns correct trend", () => {
    const worsening = [
      makeFailure("b", "f", [{ name: "a", message: "m" }]),
      makeFailure("b", "f", [{ name: "a", message: "m" }, { name: "b", message: "m" }]),
      makeFailure("b", "f", [{ name: "a", message: "m" }, { name: "b", message: "m" }, { name: "c", message: "m" }]),
    ];
    expect(detectTrend(worsening)).toBe("worsening");
    expect(detectTrend(worsening.slice(0, 2))).toBeUndefined();
  });

  it("extractKeywords returns meaningful words", () => {
    const failures = [makeFailure("build", "backup restore timing issue")];
    const kw = extractKeywords(failures);
    expect(kw).toContain("backup");
    expect(kw).toContain("restore");
    expect(kw).toContain("timing");
    // stop words should be excluded
    expect(kw).not.toContain("the");
  });

  it("extractSignatures returns signature counts", () => {
    const failures = [
      makeFailure("b", "f1", [], 1, "sig_a"),
      makeFailure("b", "f2", [], 2, "sig_a"),
      makeFailure("b", "f3", [], 3, "sig_b"),
    ];
    const sigs = extractSignatures(failures);
    expect(sigs.get("sig_a")).toBe(2);
    expect(sigs.get("sig_b")).toBe(1);
  });

  it("extractCategories returns category counts", () => {
    const failures = [
      makeFailure("b", "f", [
        { name: "impl_bug: x", message: "m" },
        { name: "impl_bug: y", message: "m" },
        { name: "test_bug: z", message: "m" },
      ]),
    ];
    const cats = extractCategories(failures);
    expect(cats.get("impl_bug")).toBe(2);
    expect(cats.get("test_bug")).toBe(1);
  });
});

// ── createDefaultAnalyzers ───────────────────────────────────────────

describe("createDefaultAnalyzers", () => {
  it("returns 4 builtin analyzers sorted by priority", () => {
    const analyzers = createDefaultAnalyzers();
    expect(analyzers).toHaveLength(4);
    expect(analyzers.map((a) => a.name)).toEqual(["keyword", "signature", "category", "trend"]);
  });
});
