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

    // Detect repeated failure patterns
    const summaryCount = new Map<string, number>();
    for (const f of relevant) {
      const key = f.validation.summary;
      summaryCount.set(key, (summaryCount.get(key) ?? 0) + 1);
    }

    // Find most common failure
    let topSummary = "";
    let topCount = 0;
    for (const [summary, count] of summaryCount) {
      if (count > topCount) {
        topSummary = summary;
        topCount = count;
      }
    }

    // Collect common failed check names
    const checkNameCount = new Map<string, number>();
    for (const f of relevant) {
      for (const check of f.validation.failedChecks) {
        checkNameCount.set(check.name, (checkNameCount.get(check.name) ?? 0) + 1);
      }
    }

    const topChecks = [...checkNameCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    // Build hint
    const parts: string[] = [];

    if (topCount > 1) {
      parts.push(
        `The same failure has occurred ${topCount} times: "${topSummary.slice(0, 150)}".`
      );
    }

    if (topChecks.length > 0) {
      parts.push(
        `Repeatedly failing checks: ${topChecks.join(", ")}.`
      );
    }

    if (relevant.length >= 3) {
      parts.push(
        `There have been ${relevant.length} validation failures total. Consider a fundamentally different approach.`
      );
    }

    return parts.length > 0 ? parts.join(" ") : undefined;
  }
}
