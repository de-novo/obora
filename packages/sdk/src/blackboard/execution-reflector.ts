import type { FailureEntry } from "./blackboard-manager.js";

/**
 * Lightweight reflector that analyzes failure history from the blackboard
 * and generates hints for repair prompts.
 *
 * On repair loop iterations, the reflector examines the pattern of failures
 * to produce a short (1-3 sentence) hint about repeated issues, which gets
 * injected into the repair prompt context.
 */
export class ExecutionReflector {
  /**
   * Analyze failure history and generate a hint for the repair prompt.
   * Returns undefined if no useful pattern is detected.
   */
  analyzeFailures(failures: FailureEntry[], currentStepName?: string): string | undefined {
    if (failures.length === 0) return undefined;

    // Filter to relevant failures (for the current step if specified)
    const relevant = currentStepName
      ? failures.filter((f) => f.stepName === currentStepName)
      : failures;

    if (relevant.length === 0) return undefined;

    const parts: string[] = [];

    // ── 1. Keyword-based root cause detection ──────────────────────────
    // Extract common keywords across ALL failure summaries + check messages
    // This catches the case where the summary text is different each time
    // but the same root cause keywords keep appearing (e.g. "backup", "restore")
    const keywordAnalysis = this.analyzeKeywords(relevant);
    if (keywordAnalysis) {
      parts.push(keywordAnalysis);
    }

    // ── 2. Signature-based repetition detection ────────────────────────
    // Signatures are structured (e.g. "implementation_bug:3") so exact match works
    const signatureAnalysis = this.analyzeSignatures(relevant);
    if (signatureAnalysis) {
      parts.push(signatureAnalysis);
    }

    // ── 3. Category-based pattern detection ────────────────────────────
    // Extract failure categories from check names (e.g. "implementation_bug: ...")
    const categoryAnalysis = this.analyzeCategories(relevant);
    if (categoryAnalysis) {
      parts.push(categoryAnalysis);
    }

    // ── 4. Trend detection (improving / worsening) ─────────────────────
    const trendAnalysis = this.analyzeTrend(relevant);
    if (trendAnalysis) {
      parts.push(trendAnalysis);
    }

    // ── 5. General escalation ──────────────────────────────────────────
    if (relevant.length >= 3) {
      parts.push(
        `There have been ${relevant.length} validation failures total. Consider a fundamentally different approach to the failing area.`
      );
    }

    return parts.length > 0 ? parts.join(" ") : undefined;
  }

  /**
   * Extract frequently appearing keywords from failure summaries and check messages.
   * Catches the same root cause even when LLM phrases it differently each time.
   */
  private analyzeKeywords(failures: FailureEntry[]): string | undefined {
    if (failures.length < 2) return undefined;

    // Collect all text from summaries and check messages
    const allText: string[] = [];
    for (const f of failures) {
      allText.push(f.validation.summary.toLowerCase());
      for (const check of f.validation.failedChecks) {
        allText.push(check.name.toLowerCase());
        allText.push(check.message.toLowerCase());
      }
    }

    // Extract meaningful words (skip common stop words and short words)
    const stopWords = new Set([
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

    const wordCount = new Map<string, number>();
    const wordInFailures = new Map<string, Set<number>>(); // track which failures contain each word

    for (let i = 0; i < failures.length; i++) {
      const failure = failures[i]!;
      const texts = [
        failure.validation.summary.toLowerCase(),
        ...failure.validation.failedChecks.map((c) => `${c.name} ${c.message}`.toLowerCase()),
      ];
      const allWords = texts.join(" ").split(/[\s,.:;()\[\]{}"'`/\\|!?=<>+\-*#@~^&%$]+/);
      const seen = new Set<string>();

      for (const word of allWords) {
        if (word.length < 3 || stopWords.has(word)) continue;
        if (!seen.has(word)) {
          seen.add(word);
          wordCount.set(word, (wordCount.get(word) ?? 0) + 1);
          if (!wordInFailures.has(word)) wordInFailures.set(word, new Set());
          wordInFailures.get(word)!.add(i);
        }
      }
    }

    // Find keywords that appear across MOST failures (not just within one)
    const threshold = Math.max(2, Math.ceil(failures.length * 0.5));
    const recurringKeywords = [...wordInFailures.entries()]
      .filter(([, failureSet]) => failureSet.size >= threshold)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 5)
      .map(([word, failureSet]) => `"${word}" (in ${failureSet.size}/${failures.length} failures)`);

    if (recurringKeywords.length === 0) return undefined;

    return `Recurring root cause keywords across failures: ${recurringKeywords.join(", ")}.`;
  }

  /**
   * Analyze validation signatures (structured, e.g. "implementation_bug:3").
   */
  private analyzeSignatures(failures: FailureEntry[]): string | undefined {
    const sigCount = new Map<string, number>();
    for (const f of failures) {
      const sig = f.validation.signature;
      if (sig) {
        sigCount.set(sig, (sigCount.get(sig) ?? 0) + 1);
      }
    }

    // Find repeated signatures
    const repeated = [...sigCount.entries()]
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1]);

    if (repeated.length === 0) return undefined;

    const top = repeated[0]!;
    return `The same failure signature "${top[0]}" has occurred ${top[1]} times.`;
  }

  /**
   * Extract failure categories from check names and find patterns.
   * Check names follow format: "implementation_bug: description"
   */
  private analyzeCategories(failures: FailureEntry[]): string | undefined {
    const categoryCount = new Map<string, number>();
    for (const f of failures) {
      for (const check of f.validation.failedChecks) {
        // Extract category prefix (e.g. "implementation_bug" from "implementation_bug: task completion")
        const colonIndex = check.name.indexOf(":");
        const category = colonIndex > 0 ? check.name.slice(0, colonIndex).trim() : check.name;
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

    return `Failure categories: ${categoryReport}.`;
  }

  /**
   * Detect whether the failure count is improving, stable, or worsening.
   */
  private analyzeTrend(failures: FailureEntry[]): string | undefined {
    if (failures.length < 3) return undefined;

    // Compare failure check counts across attempts
    const checkCounts = failures.map((f) => f.validation.failedChecks.length);
    const recent3 = checkCounts.slice(-3);
    const [first, second, third] = recent3 as [number, number, number];

    const isWorsening = third > second && second > first;
    const isImproving = third < second && second < first;
    const isStable = first === second && second === third;

    if (isWorsening) {
      return `⚠️ WORSENING TREND: Failed checks increased over last 3 attempts (${recent3.join(" → ")}). Current repairs may be introducing new bugs. Stop fixing symptoms and address the root cause.`;
    }
    if (isStable) {
      return `Stable failure count (${first}) over last 3 attempts. The current approach is not making progress.`;
    }
    if (isImproving) {
      return `Improving trend (${recent3.join(" → ")}). Continue current approach.`;
    }

    return undefined;
  }
}
