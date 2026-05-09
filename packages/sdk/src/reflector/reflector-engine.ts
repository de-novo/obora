import type { FailureEntry } from "../blackboard/blackboard-manager.js";
import type {
  ReflectorAnalyzer,
  AnalyzerContext,
  AnalyzerResult,
  AnalysisSummary,
} from "./analyzer.js";
import {
  createDefaultAnalyzers,
  detectTrend,
  extractKeywords,
  extractSignatures,
  extractCategories,
} from "./analyzer.js";
import type { ReflectorAction, ActionResult, ActionExecutionContext } from "./actions.js";
import { ActionRegistry, createDefaultActionRegistry } from "./actions.js";
import type { ReflectorRule } from "./rule-engine.js";
import { RuleEngine } from "./rule-engine.js";
import type { KnowledgeEntry } from "./knowledge-store.js";
import { KnowledgeStore } from "./knowledge-store.js";

// ── Reflector output ───────────────────────────────────────────────────

export interface ReflectorOutput {
  /** Text for prompt injection (backward compatible with ExecutionReflector) */
  hints: string;
  /** System-enforced actions from rules + analyzers */
  actions: ActionResult[];
  /** Raw analyzer outputs */
  insights: AnalyzerResult[];
  /** Prior knowledge that was applied */
  knowledgeUsed: KnowledgeEntry[];
}

// ── ReflectorEngine options ────────────────────────────────────────────

export interface ReflectorEngineOptions {
  analyzers?: ReflectorAnalyzer[];
  actionRegistry?: ActionRegistry;
  rules?: ReflectorRule[];
  knowledgeStore?: KnowledgeStore;
}

// ── Execution tracking ─────────────────────────────────────────────────

interface ExecutionRecord {
  workflowName: string;
  patterns: string[];
}

// ── ReflectorEngine ────────────────────────────────────────────────────

export class ReflectorEngine {
  private readonly analyzers: ReflectorAnalyzer[];
  private readonly actionRegistry: ActionRegistry;
  private readonly ruleEngine: RuleEngine | undefined;
  private readonly knowledgeStore: KnowledgeStore | undefined;
  private readonly executionRecords = new Map<string, ExecutionRecord>();

  constructor(options: ReflectorEngineOptions = {}) {
    this.analyzers = (options.analyzers ?? createDefaultAnalyzers()).sort(
      (a, b) => a.priority - b.priority
    );
    this.actionRegistry =
      options.actionRegistry ?? createDefaultActionRegistry();
    this.ruleEngine =
      options.rules && options.rules.length > 0
        ? new RuleEngine(options.rules)
        : undefined;
    this.knowledgeStore = options.knowledgeStore;
  }

  /**
   * Main entry point — analyzes failures and returns structured output.
   * Called by workflow-runner during repair loops.
   */
  analyze(context: AnalyzerContext): ReflectorOutput {
    // 1. Run all analyzers
    const insights: AnalyzerResult[] = [];
    const allSuggestedActions: ReflectorAction[] = [];
    const hintParts: string[] = [];

    this.analyzers.forEach((analyzer) => {
      const result = analyzer.analyze(context);
      if (result) {
        insights.push(result);
        hintParts.push(...result.insights);
        allSuggestedActions.push(...result.suggestedActions);
      }
    });

    // 2. Build analysis summary for rule engine
    const summary = this.buildSummary(context, insights);

    // 3. Evaluate rules
    const ruleActions = this.ruleEngine ? this.ruleEngine.evaluate(summary) : [];

    // 4. Query knowledge store
    const knowledgeUsed =
      this.knowledgeStore && summary.keywords.length > 0
        ? this.knowledgeStore.findSimilar(summary.keywords)
        : [];
    if (knowledgeUsed.length > 0) {
      // Inject knowledge-based hints
      knowledgeUsed.slice(0, 3).forEach((entry) => {
        if (entry.confidence >= 0.5) {
          hintParts.push(
            `Prior knowledge: "${entry.pattern}" was resolved by: ${entry.resolution} (confidence: ${(entry.confidence * 100).toFixed(0)}%)`
          );
        }
      });
    }

    // 5. General escalation (backward compat with ExecutionReflector)
    if (context.failures.length >= 3) {
      hintParts.push(
        `There have been ${context.failures.length} validation failures total. Consider a fundamentally different approach to the failing area.`
      );
    }

    // 6. Combine all actions (analyzer suggestions + rule actions)
    const allActions = [...allSuggestedActions, ...ruleActions];

    // 7. Execute actions if we have a context
    // (Actions are executed later by the workflow runner, but we return the results)
    const actionResults: ActionResult[] = [];
    if (allActions.length > 0) {
      // We don't have full ActionExecutionContext here — that's provided by workflow-runner
      // Return the raw actions as metadata for the runner to execute
      allActions.forEach((action) => {
        actionResults.push({
          applied: false,
          metadata: { pendingAction: action },
        });
      });
    }

    // 8. Track patterns for outcome recording
    if (summary.keywords.length > 0) {
      const kwPattern = summary.keywords.slice(0, 5).join(", ");
      const record = this.executionRecords.get(context.stepName) ?? {
        workflowName: context.stepName,
        patterns: [],
      };
      if (!record.patterns.includes(kwPattern)) {
        record.patterns.push(kwPattern);
      }
      this.executionRecords.set(context.stepName, record);
    }

    return {
      hints: hintParts.length > 0 ? hintParts.join(" ") : "",
      actions: actionResults,
      insights,
      knowledgeUsed,
    };
  }

  /**
   * Backward-compatible method — same signature as ExecutionReflector.analyzeFailures().
   * Returns just the hint string, or undefined if no patterns detected.
   */
  analyzeFailures(
    failures: FailureEntry[],
    currentStepName?: string
  ): string | undefined {
    if (failures.length === 0) return undefined;

    // Use ALL failures for pattern detection across steps
    // (Previously filtered by stepName, which prevented cross-step pattern detection)
    const context: AnalyzerContext = {
      failures,
      stepName: currentStepName ?? "unknown",
      attempt: failures.filter(f => f.stepName === currentStepName).length || failures.length,
      knowledgeBase: this.knowledgeStore?.getEntries() ?? [],
    };

    const output = this.analyze(context);

    // Merge inject_context action payloads into hints
    output.actions.forEach((ar) => {
      const pending = (ar.metadata as Record<string, unknown>)?.pendingAction as
        | ReflectorAction
        | undefined;
      if (pending?.type === "inject_context" && pending.payload?.content) {
        const injected = String(pending.payload.content).trim();
        if (injected && !output.hints.includes(injected)) {
          output.hints = output.hints
            ? output.hints + " " + injected
            : injected;
        }
      }
    });

    // Cache latest output for workflow-runner to query actions
    this._lastOutput = output;

    return output.hints.length > 0 ? output.hints : undefined;
  }

  /** Most recent analysis output (includes actions). */
  private _lastOutput?: ReflectorOutput;

  /** Returns the latest full analysis output (after analyzeFailures). */
  getLastOutput(): ReflectorOutput | undefined {
    return this._lastOutput;
  }

  /**
   * Evaluate rules against an analysis summary and return matched actions.
   * Used by the workflow runner to get actions that should be executed.
   */
  evaluateRules(summary: AnalysisSummary): ReflectorAction[] {
    return this.ruleEngine?.evaluate(summary) ?? [];
  }

  /**
   * Execute actions through the registry with a full execution context.
   * Called by the workflow runner when it has the full context.
   */
  executeActions(
    actions: ReflectorAction[],
    context: ActionExecutionContext
  ): ActionResult[] {
    return this.actionRegistry.execute(actions, context);
  }

  /**
   * Record execution outcome for knowledge accumulation.
   */
  async recordOutcome(
    executionId: string,
    succeeded: boolean,
    workflowName?: string
  ): Promise<void> {
    if (!this.knowledgeStore) return;
    const knowledgeStore = this.knowledgeStore;

    // Find tracked patterns for this execution
    Array.from(this.executionRecords.values()).forEach((record) => {
      record.patterns.forEach((pattern) => {
        knowledgeStore.recordPattern(
          pattern,
          succeeded ? "succeeded" : "failed",
          succeeded,
          {
            workflowName: workflowName ?? record.workflowName,
            executionId,
          }
        );
      });
    });

    await this.knowledgeStore.save();
  }

  /**
   * Build an AnalysisSummary from the analyzer context and results.
   */
  buildSummary(
    context: AnalyzerContext,
    insights: AnalyzerResult[]
  ): AnalysisSummary {
    const { failures } = context;
    const keywords = extractKeywords(failures);
    const keywordFrequency = new Map<string, number>();
    keywords.forEach((kw) => {
      keywordFrequency.set(kw, (keywordFrequency.get(kw) ?? 0) + 1);
    });

    return {
      keywords,
      keywordFrequency,
      signatures: extractSignatures(failures),
      categories: extractCategories(failures),
      trend: detectTrend(failures),
      failureCount: failures.length,
      attempt: context.attempt,
      insights: insights.flatMap((i) => i.insights),
      suggestedActions: insights.flatMap((i) => i.suggestedActions),
    };
  }
}
