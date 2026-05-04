import { BoardBlackboard, createAgentId, createSessionId } from "@obora/runtime";
import type { SharedMemorySnapshot, MemoryScope } from "../shared-memory/store.js";
import type { ValidationResult } from "../validation-repair.js";
import { DEFAULTS } from "../defaults.js";

export interface FailureEntry {
  stepName: string;
  attempt: number;
  validation: ValidationResult;
  timestamp: Date;
}

export interface BlackboardFact {
  id: string;
  content: string;
  category: string;
  tags: string[];
  confidence: number;
  createdAt: Date;
}

export interface BlackboardSnapshot {
  facts: BlackboardFact[];
  stepOutputs: Record<string, unknown>;
  failures: FailureEntry[];
  stepTimings: Record<string, { startedAt: number; durationMs?: number }>;
  createdAt: Date;
}

export interface BlackboardManagerOptions {
  sessionId?: string;
}

export interface SharedMemoryImportResult {
  importedFacts: number;
  source: MemoryScope;
}

export interface SharedMemoryImportOptions {
  factSources?: Record<string, MemoryScope>;
  storeSnapshot?: boolean;
}

/**
 * Manages an in-memory blackboard for a single workflow execution.
 * Wraps the Runtime Blackboard for unified state management while
 * maintaining the simple API for recording step outputs, validations,
 * and failure history.
 */
export class BlackboardManager {
  readonly sessionId: string;

  /** The underlying Runtime Blackboard — exposes full event, versioning, and section APIs. */
  readonly board: BoardBlackboard;

  private readonly facts: BlackboardFact[] = [];
  private readonly stepOutputs = new Map<string, unknown>();
  private readonly failures: FailureEntry[] = [];
  private readonly stepTimings = new Map<string, { startedAt: number; durationMs?: number }>();

  constructor(options: BlackboardManagerOptions = {}) {
    this.sessionId = options.sessionId ?? `wf-${Date.now()}`;
    this.board = new BoardBlackboard({
      sessionId: createSessionId(this.sessionId),
    });
  }

  /**
   * Record step output as a fact on the blackboard.
   */
  recordStepOutput(stepName: string, output: unknown): void {
    this.stepOutputs.set(stepName, output);

    const content =
      typeof output === "string"
        ? output.slice(0, DEFAULTS.FACT_CONTENT_MAX_LENGTH)
        : JSON.stringify(output).slice(0, DEFAULTS.FACT_CONTENT_MAX_LENGTH);

    const fact: BlackboardFact = {
      id: `step-output:${stepName}`,
      content: `Step '${stepName}' completed: ${content}`,
      category: "step-output",
      tags: [stepName, "step-output"],
      confidence: 1.0,
      createdAt: new Date(),
    };
    this.facts.push(fact);

    // Dual-write: store in Runtime Blackboard
    this.board.write("state.context.stepOutputs." + stepName, {
      type: "step_output",
      content: output,
      timestamp: new Date(),
    });
  }

  /**
   * Get outputs from a previous step.
   */
  getStepOutput(stepName: string): unknown | undefined {
    return this.stepOutputs.get(stepName);
  }

  /**
   * Get all recorded step outputs.
   */
  getAllStepOutputs(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.stepOutputs) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Record a validation result on the blackboard.
   */
  recordValidation(stepName: string, result: ValidationResult, attempt: number = 1): void {
    const content = result.passed
      ? `Validation passed for '${stepName}': ${result.summary}`
      : `Validation failed for '${stepName}': ${result.summary}`;

    this.facts.push({
      id: `validation:${stepName}:${attempt}:${Date.now()}`,
      content,
      category: result.passed ? "validation-pass" : "validation-fail",
      tags: [stepName, "validation", result.passed ? "pass" : "fail"],
      confidence: 1.0,
      createdAt: new Date(),
    });

    if (!result.passed) {
      this.failures.push({
        stepName,
        attempt,
        validation: result,
        timestamp: new Date(),
      });
    }

    // Dual-write: store in Runtime Blackboard
    this.board.write("state.context.validations." + stepName + ".attempt_" + attempt, {
      validation: result,
      timestamp: new Date(),
    });
  }

  /**
   * Record step timing.
   */
  recordStepStart(stepName: string): void {
    const startedAt = Date.now();
    this.stepTimings.set(stepName, { startedAt });

    // Dual-write: store in Runtime Blackboard
    this.board.write("state.context.timings." + stepName, { startedAt });
  }

  /**
   * Record step completion timing.
   */
  recordStepEnd(stepName: string): void {
    const timing = this.stepTimings.get(stepName);
    if (timing) {
      timing.durationMs = Date.now() - timing.startedAt;

      // Dual-write: update in Runtime Blackboard
      this.board.write("state.context.timings." + stepName, { ...timing });
    }
  }

  /**
   * Get failure history for reflector analysis.
   */
  getFailureHistory(): FailureEntry[] {
    return [...this.failures];
  }

  /**
   * Get all facts recorded on the blackboard.
   */
  getFacts(): BlackboardFact[] {
    return [...this.facts];
  }

  /**
   * Get facts by category.
   */
  getFactsByCategory(category: string): BlackboardFact[] {
    return this.facts.filter((f) => f.category === category);
  }

  /**
   * Get the full blackboard snapshot.
   */
  getSnapshot(): BlackboardSnapshot {
    const timings: Record<string, { startedAt: number; durationMs?: number }> = {};
    for (const [key, value] of this.stepTimings) {
      timings[key] = { ...value };
    }
    return {
      facts: [...this.facts],
      stepOutputs: this.getAllStepOutputs(),
      failures: [...this.failures],
      stepTimings: timings,
      createdAt: new Date(),
    };
  }

  /**
   * Export a persistent shared-memory snapshot.
   * Excludes transient step timing data and raw step outputs.
   */
  exportPersistentSnapshot(sourceExecutionId?: string): SharedMemorySnapshot {
    const exportableFacts = this.facts.filter(
      (fact) => fact.category !== "step-output" && fact.category !== "shared-memory-import",
    );

    const lastFailureSummaries = this.failures.slice(-5).map((failure) => failure.validation.summary);

    return {
      knowledge: {
        facts: exportableFacts.map((fact) => ({
          id: fact.id,
          content: fact.content,
          category: fact.category,
          tags: [...fact.tags],
          confidence: fact.confidence,
          createdAt: fact.createdAt.toISOString(),
          sourceExecutionId,
        })),
      },
      decisions: {
        history: [],
      },
      context: {
        projectFacts: {
          knownStepOutputs: Object.keys(this.getAllStepOutputs()),
          recentFailureSummaries: lastFailureSummaries,
        },
      },
    };
  }

  recordSharedMemorySnapshot(snapshot: SharedMemorySnapshot, source: MemoryScope): void {
    this.board.write(`state.context.sharedMemory.${source.level}.${source.key}`, snapshot);
  }

  /**
   * Import shared-memory snapshot into the local blackboard and Runtime Blackboard.
   */
  importPersistentSnapshot(
    snapshot: SharedMemorySnapshot,
    source: MemoryScope,
    options: SharedMemoryImportOptions = {},
  ): SharedMemoryImportResult {
    let importedFacts = 0;

    for (const fact of snapshot.knowledge.facts) {
      const factSource = options.factSources?.[fact.id] ?? source;
      const sourceRef = `${factSource.level}:${factSource.key}`;
      const importedFact: BlackboardFact = {
        id: `shared:${factSource.level}:${factSource.key}:${fact.id}`,
        content: fact.content,
        category: "shared-memory-import",
        tags: [...fact.tags, "shared-memory", factSource.level, factSource.key],
        confidence: fact.confidence,
        createdAt: new Date(fact.createdAt),
      };
      this.facts.push(importedFact);
      importedFacts += 1;

      this.board.knowledge.addFact({
        content: fact.content,
        source: createAgentId(`shared-memory:${sourceRef}`),
        confidence: fact.confidence,
        category: "shared-memory-import",
        tags: [...fact.tags, factSource.level, factSource.key],
      });
    }

    if (options.storeSnapshot !== false) {
      this.recordSharedMemorySnapshot(snapshot, source);
    }

    return { importedFacts, source };
  }

  /**
   * Get step timings.
   */
  getStepTimings(): Map<string, { startedAt: number; durationMs?: number }> {
    return new Map(this.stepTimings);
  }
}
