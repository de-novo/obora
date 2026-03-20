import { describe, it, expect } from "vitest";
import { RuleEngine } from "../rule-engine.js";
import type { ReflectorRule } from "../rule-engine.js";
import type { AnalysisSummary } from "../analyzer.js";

function makeSummary(overrides?: Partial<AnalysisSummary>): AnalysisSummary {
  return {
    keywords: [],
    keywordFrequency: new Map(),
    signatures: new Map(),
    categories: new Map(),
    trend: undefined,
    failureCount: 0,
    attempt: 1,
    insights: [],
    suggestedActions: [],
    ...overrides,
  };
}

describe("RuleEngine", () => {
  it("returns empty array when no rules match", () => {
    const rules: ReflectorRule[] = [
      {
        name: "test_rule",
        when: { keywords_include: ["backup"] },
        actions: [{ type: "inject_context", priority: 50, payload: { content: "x" } }],
      },
    ];
    const engine = new RuleEngine(rules);
    const result = engine.evaluate(makeSummary({ keywords: ["restore"] }));
    expect(result).toHaveLength(0);
  });

  it("matches keywords_include", () => {
    const rules: ReflectorRule[] = [
      {
        name: "backup_rule",
        when: { keywords_include: ["backup", "restore"] },
        actions: [{ type: "inject_context", priority: 50, payload: { content: "fix backup" } }],
      },
    ];
    const engine = new RuleEngine(rules);
    const result = engine.evaluate(makeSummary({ keywords: ["backup", "restore", "timing"] }));
    expect(result).toHaveLength(1);
    expect(result[0]!.payload.content).toBe("fix backup");
  });

  it("rejects when keywords_include partially matches", () => {
    const rules: ReflectorRule[] = [
      {
        name: "partial",
        when: { keywords_include: ["backup", "database"] },
        actions: [{ type: "inject_context", priority: 50, payload: {} }],
      },
    ];
    const engine = new RuleEngine(rules);
    const result = engine.evaluate(makeSummary({ keywords: ["backup", "restore"] }));
    expect(result).toHaveLength(0);
  });

  it("matches keywords_exclude (excludes when keyword present)", () => {
    const rules: ReflectorRule[] = [
      {
        name: "exclude_test",
        when: { keywords_exclude: ["timeout"] },
        actions: [{ type: "inject_context", priority: 50, payload: {} }],
      },
    ];
    const engine = new RuleEngine(rules);
    // Rule should NOT match because "timeout" is present
    expect(engine.evaluate(makeSummary({ keywords: ["timeout", "backup"] }))).toHaveLength(0);
    // Rule should match because "timeout" is not present
    expect(engine.evaluate(makeSummary({ keywords: ["backup"] }))).toHaveLength(1);
  });

  it("matches trend condition", () => {
    const rules: ReflectorRule[] = [
      {
        name: "worsening_rule",
        when: { trend: "worsening" },
        actions: [{ type: "abort", priority: 100, payload: { reason: "worsening" } }],
      },
    ];
    const engine = new RuleEngine(rules);
    expect(engine.evaluate(makeSummary({ trend: "worsening" }))).toHaveLength(1);
    expect(engine.evaluate(makeSummary({ trend: "improving" }))).toHaveLength(0);
    expect(engine.evaluate(makeSummary({ trend: undefined }))).toHaveLength(0);
  });

  it("matches min_failures and max_failures", () => {
    const rules: ReflectorRule[] = [
      {
        name: "range_rule",
        when: { min_failures: 3, max_failures: 5 },
        actions: [{ type: "inject_context", priority: 50, payload: {} }],
      },
    ];
    const engine = new RuleEngine(rules);
    expect(engine.evaluate(makeSummary({ failureCount: 2 }))).toHaveLength(0);
    expect(engine.evaluate(makeSummary({ failureCount: 3 }))).toHaveLength(1);
    expect(engine.evaluate(makeSummary({ failureCount: 5 }))).toHaveLength(1);
    expect(engine.evaluate(makeSummary({ failureCount: 6 }))).toHaveLength(0);
  });

  it("matches signature_repeated", () => {
    const rules: ReflectorRule[] = [
      {
        name: "sig_rule",
        when: { signature_repeated: 3 },
        actions: [{ type: "inject_context", priority: 50, payload: {} }],
      },
    ];
    const engine = new RuleEngine(rules);
    const sigsWith3 = new Map([["sig_a", 3], ["sig_b", 1]]);
    expect(engine.evaluate(makeSummary({ signatures: sigsWith3 }))).toHaveLength(1);
    const sigsWith2 = new Map([["sig_a", 2]]);
    expect(engine.evaluate(makeSummary({ signatures: sigsWith2 }))).toHaveLength(0);
  });

  it("matches category_includes", () => {
    const rules: ReflectorRule[] = [
      {
        name: "cat_rule",
        when: { category_includes: ["implementation_bug"] },
        actions: [{ type: "inject_context", priority: 50, payload: {} }],
      },
    ];
    const engine = new RuleEngine(rules);
    const cats = new Map([["implementation_bug", 3], ["test_bug", 1]]);
    expect(engine.evaluate(makeSummary({ categories: cats }))).toHaveLength(1);
    const noCats = new Map([["test_bug", 1]]);
    expect(engine.evaluate(makeSummary({ categories: noCats }))).toHaveLength(0);
  });

  it("matches min_attempt", () => {
    const rules: ReflectorRule[] = [
      {
        name: "attempt_rule",
        when: { min_attempt: 10 },
        actions: [{ type: "abort", priority: 100, payload: { reason: "too many attempts" } }],
      },
    ];
    const engine = new RuleEngine(rules);
    expect(engine.evaluate(makeSummary({ attempt: 9 }))).toHaveLength(0);
    expect(engine.evaluate(makeSummary({ attempt: 10 }))).toHaveLength(1);
    expect(engine.evaluate(makeSummary({ attempt: 15 }))).toHaveLength(1);
  });

  it("matches compound conditions (all must be true)", () => {
    const rules: ReflectorRule[] = [
      {
        name: "compound",
        when: {
          keywords_include: ["backup"],
          trend: "worsening",
          min_failures: 3,
        },
        actions: [
          { type: "force_target", priority: 90, payload: { target: "design_and_write_tests" } },
          { type: "inject_context", priority: 80, payload: { content: "redesign backup" } },
        ],
      },
    ];
    const engine = new RuleEngine(rules);

    // All match
    expect(
      engine.evaluate(
        makeSummary({ keywords: ["backup", "restore"], trend: "worsening", failureCount: 5 })
      )
    ).toHaveLength(2);

    // Missing trend
    expect(
      engine.evaluate(
        makeSummary({ keywords: ["backup"], trend: "stable", failureCount: 5 })
      )
    ).toHaveLength(0);

    // Missing keyword
    expect(
      engine.evaluate(
        makeSummary({ keywords: ["restore"], trend: "worsening", failureCount: 5 })
      )
    ).toHaveLength(0);
  });

  it("collects actions from multiple matching rules", () => {
    const rules: ReflectorRule[] = [
      {
        name: "rule_a",
        when: { min_failures: 1 },
        actions: [{ type: "inject_context", priority: 10, payload: { content: "a" } }],
      },
      {
        name: "rule_b",
        when: { min_failures: 2 },
        actions: [{ type: "inject_context", priority: 20, payload: { content: "b" } }],
      },
    ];
    const engine = new RuleEngine(rules);
    const result = engine.evaluate(makeSummary({ failureCount: 3 }));
    expect(result).toHaveLength(2);
  });

  it("case insensitive keyword matching", () => {
    const rules: ReflectorRule[] = [
      {
        name: "case_rule",
        when: { keywords_include: ["Backup"] },
        actions: [{ type: "inject_context", priority: 50, payload: {} }],
      },
    ];
    const engine = new RuleEngine(rules);
    expect(engine.evaluate(makeSummary({ keywords: ["backup"] }))).toHaveLength(1);
    expect(engine.evaluate(makeSummary({ keywords: ["BACKUP"] }))).toHaveLength(1);
  });
});
