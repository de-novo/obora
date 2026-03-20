import type { AnalysisSummary } from "./analyzer.js";
import type { ReflectorAction } from "./actions.js";

// ── Rule interfaces ────────────────────────────────────────────────────

export interface RuleCondition {
  keywords_include?: string[];
  keywords_exclude?: string[];
  trend?: "worsening" | "stable" | "improving";
  min_failures?: number;
  max_failures?: number;
  signature_repeated?: number;
  category_includes?: string[];
  min_attempt?: number;
}

export interface ReflectorRule {
  name: string;
  when: RuleCondition;
  actions: ReflectorAction[];
}

// ── RuleEngine ─────────────────────────────────────────────────────────

export class RuleEngine {
  private readonly rules: ReflectorRule[];

  constructor(rules: ReflectorRule[]) {
    this.rules = rules;
  }

  evaluate(summary: AnalysisSummary): ReflectorAction[] {
    const matched: ReflectorAction[] = [];

    for (const rule of this.rules) {
      if (this.matchCondition(rule.when, summary)) {
        matched.push(...rule.actions);
      }
    }

    return matched;
  }

  private matchCondition(
    condition: RuleCondition,
    summary: AnalysisSummary
  ): boolean {
    // keywords_include: ALL listed keywords must appear in the keyword set
    if (condition.keywords_include) {
      const kwLower = summary.keywords.map((k) => k.toLowerCase());
      for (const kw of condition.keywords_include) {
        if (!kwLower.includes(kw.toLowerCase())) return false;
      }
    }

    // keywords_exclude: NONE of the listed keywords may appear
    if (condition.keywords_exclude) {
      const kwLower = summary.keywords.map((k) => k.toLowerCase());
      for (const kw of condition.keywords_exclude) {
        if (kwLower.includes(kw.toLowerCase())) return false;
      }
    }

    // trend must match exactly
    if (condition.trend !== undefined) {
      if (summary.trend !== condition.trend) return false;
    }

    // min_failures: at least this many failures
    if (condition.min_failures !== undefined) {
      if (summary.failureCount < condition.min_failures) return false;
    }

    // max_failures: at most this many failures
    if (condition.max_failures !== undefined) {
      if (summary.failureCount > condition.max_failures) return false;
    }

    // signature_repeated: at least one signature repeated >= N times
    if (condition.signature_repeated !== undefined) {
      let found = false;
      for (const count of summary.signatures.values()) {
        if (count >= condition.signature_repeated) {
          found = true;
          break;
        }
      }
      if (!found) return false;
    }

    // category_includes: ALL listed categories must appear
    if (condition.category_includes) {
      for (const cat of condition.category_includes) {
        if (!summary.categories.has(cat)) return false;
      }
    }

    // min_attempt: current attempt must be >= N
    if (condition.min_attempt !== undefined) {
      if (summary.attempt < condition.min_attempt) return false;
    }

    return true;
  }
}
