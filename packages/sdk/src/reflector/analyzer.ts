import type { FailureEntry } from "../blackboard/blackboard-manager.js";
import type { KnowledgeEntry } from "./knowledge-store.js";

// ── Analyzer interfaces ────────────────────────────────────────────────

export interface AnalyzerContext {
  failures: FailureEntry[];
  stepName: string;
  attempt: number;
  knowledgeBase: KnowledgeEntry[];
}

export interface AnalyzerResult {
  insights: string[];
  suggestedActions: SuggestedAction[];
  confidence: number;
  category: string;
}

export interface SuggestedAction {
  type: string;
  priority: number;
  payload: Record<string, unknown>;
}

export interface ReflectorAnalyzer {
  name: string;
  priority: number;
  analyze(context: AnalyzerContext): AnalyzerResult | undefined;
}

// ── Analysis summary (aggregate of all analyzer results) ───────────────

export interface AnalysisSummary {
  keywords: string[];
  keywordFrequency: Map<string, number>;
  signatures: Map<string, number>;
  categories: Map<string, number>;
  trend: "worsening" | "stable" | "improving" | undefined;
  failureCount: number;
  attempt: number;
  insights: string[];
  suggestedActions: SuggestedAction[];
}

// ── Stop words shared across keyword analysis ──────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been",
  "has", "have", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "shall", "can", "need",
  "for", "of", "in", "on", "at", "to", "from", "by", "with",
  "and", "or", "not", "but", "if", "then", "else", "when",
  "all", "each", "every", "both", "few", "more", "most",
  "other", "some", "such", "no", "nor", "too", "very",
  "that", "this", "these", "those", "it", "its",
  "due", "into", "also", "than", "as", "out", "up",
  "test", "tests", "failed", "failure", "error", "errors",
  "check", "checks", "issue", "issues", "bug", "bugs",
  "code", "file", "files", "line", "lines",
  "passed", "passing", "fail", "failing",
  "total", "개", "실패", "통과", "인해",
]);

const WORD_SPLIT_RE = /[\s,.:;()\[\]{}"'`/\\|!?=<>+\-*#@~^&%$]+/;

// ── Builtin: KeywordAnalyzer ───────────────────────────────────────────

export class KeywordAnalyzer implements ReflectorAnalyzer {
  readonly name = "keyword";
  readonly priority = 10;

  analyze(context: AnalyzerContext): AnalyzerResult | undefined {
    const { failures } = context;
    if (failures.length < 2) return undefined;

    const wordInFailures = new Map<string, Set<number>>();

    for (let i = 0; i < failures.length; i++) {
      const f = failures[i]!;
      const texts = [
        f.validation.summary.toLowerCase(),
        ...f.validation.failedChecks.map(
          (c) => `${c.name} ${c.message}`.toLowerCase()
        ),
      ];
      const allWords = texts.join(" ").split(WORD_SPLIT_RE);
      const seen = new Set<string>();

      for (const word of allWords) {
        if (word.length < 3 || STOP_WORDS.has(word)) continue;
        if (!seen.has(word)) {
          seen.add(word);
          if (!wordInFailures.has(word)) wordInFailures.set(word, new Set());
          wordInFailures.get(word)!.add(i);
        }
      }
    }

    const threshold = Math.max(2, Math.ceil(failures.length * 0.5));
    const recurring = [...wordInFailures.entries()]
      .filter(([, s]) => s.size >= threshold)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 5);

    if (recurring.length === 0) return undefined;

    const keywordList = recurring.map(
      ([word, s]) => `"${word}" (in ${s.size}/${failures.length} failures)`
    );

    return {
      insights: [
        `Recurring root cause keywords across failures: ${keywordList.join(", ")}.`,
      ],
      suggestedActions: [],
      confidence: Math.min(0.9, recurring[0]![1].size / failures.length),
      category: "keyword",
    };
  }
}

// ── Builtin: SignatureAnalyzer ──────────────────────────────────────────

export class SignatureAnalyzer implements ReflectorAnalyzer {
  readonly name = "signature";
  readonly priority = 20;

  analyze(context: AnalyzerContext): AnalyzerResult | undefined {
    const sigCount = new Map<string, number>();
    for (const f of context.failures) {
      const sig = f.validation.signature;
      if (sig) {
        sigCount.set(sig, (sigCount.get(sig) ?? 0) + 1);
      }
    }

    const repeated = [...sigCount.entries()]
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1]);

    if (repeated.length === 0) return undefined;

    const top = repeated[0]!;
    return {
      insights: [
        `The same failure signature "${top[0]}" has occurred ${top[1]} times.`,
      ],
      suggestedActions: [],
      confidence: Math.min(0.95, top[1] / context.failures.length),
      category: "signature",
    };
  }
}

// ── Builtin: CategoryAnalyzer ──────────────────────────────────────────

export class CategoryAnalyzer implements ReflectorAnalyzer {
  readonly name = "category";
  readonly priority = 30;

  analyze(context: AnalyzerContext): AnalyzerResult | undefined {
    const categoryCount = new Map<string, number>();
    for (const f of context.failures) {
      for (const check of f.validation.failedChecks) {
        const colonIndex = check.name.indexOf(":");
        const category =
          colonIndex > 0 ? check.name.slice(0, colonIndex).trim() : check.name;
        categoryCount.set(category, (categoryCount.get(category) ?? 0) + 1);
      }
    }

    const sorted = [...categoryCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (sorted.length === 0) return undefined;

    const categoryReport = sorted
      .map(([cat, count]) => `${cat} (${count}x)`)
      .join(", ");

    return {
      insights: [`Failure categories: ${categoryReport}.`],
      suggestedActions: [],
      confidence: 0.7,
      category: "category",
    };
  }
}

// ── Builtin: TrendAnalyzer ─────────────────────────────────────────────

export type TrendDirection = "worsening" | "stable" | "improving";

export class TrendAnalyzer implements ReflectorAnalyzer {
  readonly name = "trend";
  readonly priority = 40;

  analyze(context: AnalyzerContext): AnalyzerResult | undefined {
    const { failures } = context;
    if (failures.length < 3) return undefined;

    const checkCounts = failures.map((f) => f.validation.failedChecks.length);
    const recent3 = checkCounts.slice(-3) as [number, number, number];

    const isWorsening = recent3[2] > recent3[1] && recent3[1] > recent3[0];
    const isImproving = recent3[2] < recent3[1] && recent3[1] < recent3[0];
    const isStable = recent3[0] === recent3[1] && recent3[1] === recent3[2];

    let trend: TrendDirection | undefined;
    let insight: string;

    if (isWorsening) {
      trend = "worsening";
      insight = `⚠️ WORSENING TREND: Failed checks increased over last 3 attempts (${recent3.join(" → ")}). Current repairs may be introducing new bugs. Stop fixing symptoms and address the root cause.`;
    } else if (isStable) {
      trend = "stable";
      insight = `Stable failure count (${recent3[0]}) over last 3 attempts. The current approach is not making progress.`;
    } else if (isImproving) {
      trend = "improving";
      insight = `Improving trend (${recent3.join(" → ")}). Continue current approach.`;
    } else {
      return undefined;
    }

    return {
      insights: [insight],
      suggestedActions:
        trend === "worsening"
          ? [{ type: "inject_context", priority: 80, payload: { content: insight } }]
          : [],
      confidence: 0.8,
      category: `trend:${trend}`,
    };
  }
}

// ── Helper: detect trend from failures ─────────────────────────────────

export function detectTrend(
  failures: FailureEntry[]
): TrendDirection | undefined {
  if (failures.length < 3) return undefined;
  const counts = failures.map((f) => f.validation.failedChecks.length);
  const r = counts.slice(-3) as [number, number, number];
  if (r[2] > r[1] && r[1] > r[0]) return "worsening";
  if (r[2] < r[1] && r[1] < r[0]) return "improving";
  if (r[0] === r[1] && r[1] === r[2]) return "stable";
  return undefined;
}

// ── Helper: extract keyword set from failures ──────────────────────────

export function extractKeywords(failures: FailureEntry[]): string[] {
  const wordSet = new Set<string>();
  for (const f of failures) {
    const texts = [
      f.validation.summary.toLowerCase(),
      ...f.validation.failedChecks.map(
        (c) => `${c.name} ${c.message}`.toLowerCase()
      ),
    ];
    for (const word of texts.join(" ").split(WORD_SPLIT_RE)) {
      if (word.length >= 3 && !STOP_WORDS.has(word)) {
        wordSet.add(word);
      }
    }
  }
  return [...wordSet];
}

// ── Helper: extract signature counts ───────────────────────────────────

export function extractSignatures(
  failures: FailureEntry[]
): Map<string, number> {
  const sigCount = new Map<string, number>();
  for (const f of failures) {
    const sig = f.validation.signature;
    if (sig) {
      sigCount.set(sig, (sigCount.get(sig) ?? 0) + 1);
    }
  }
  return sigCount;
}

// ── Helper: extract category counts ────────────────────────────────────

export function extractCategories(
  failures: FailureEntry[]
): Map<string, number> {
  const categoryCount = new Map<string, number>();
  for (const f of failures) {
    for (const check of f.validation.failedChecks) {
      const colonIndex = check.name.indexOf(":");
      const category =
        colonIndex > 0 ? check.name.slice(0, colonIndex).trim() : check.name;
      categoryCount.set(category, (categoryCount.get(category) ?? 0) + 1);
    }
  }
  return categoryCount;
}

// ── Default builtin analyzers ──────────────────────────────────────────

export function createDefaultAnalyzers(): ReflectorAnalyzer[] {
  return [
    new KeywordAnalyzer(),
    new SignatureAnalyzer(),
    new CategoryAnalyzer(),
    new TrendAnalyzer(),
  ];
}
