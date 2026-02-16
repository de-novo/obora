import { OboraErrorCode } from "../errors/OboraErrorCode.js";

export { OboraErrorCode };

export const BUILTIN_PATTERN_KINDS = [
  "pipeline",
  "discussion",
  "consensus",
  "brainstorming",
  "peer-review",
  "red-blue",
  "fan-out-fan-in",
  "supervisor",
] as const;

export type BuiltinPatternKind = (typeof BUILTIN_PATTERN_KINDS)[number];

export type PatternFailureCategory = "failure" | "timeout" | "escalation";

export interface PatternRuntimeHooks {
  onStart?(context: PatternRuntimeContext): Promise<void> | void;
  onEvent?(event: PatternRuntimeEvent, context: PatternRuntimeContext): Promise<void> | void;
  onComplete?(result: PatternRuntimeResult, context: PatternRuntimeContext): Promise<void> | void;
  onError?(error: unknown, context: PatternRuntimeContext): Promise<void> | void;
}

export type PatternExecutionFn = (context: PatternRuntimeContext) => Promise<PatternRuntimeResult>;

/**
 * External runtime contract used by orchestrator/executors.
 * `run` is the stable entrypoint for runtime integration.
 */
export interface PatternRuntimeContract {
  readonly name: string;
  readonly kind: BuiltinPatternKind | (string & {});
  readonly version?: string;

  validateConfig?(config: PatternConfig): void;
  run: PatternExecutionFn;
}

export interface PatternRuntimeEvent {
  type: string;
  payload?: unknown;
  timestamp?: string;
}

export interface PatternPayloadContext {
  steps?: Array<(input: unknown) => unknown | Promise<unknown>>;
  input?: unknown;
  [key: string]: unknown;
}

export interface PatternRuntimeContext extends PatternPayloadContext {
  executionId?: string;
  stepName?: string;
  pattern: string;
  participants?: Record<string, string>;
  config?: PatternConfig;
  emit?: (event: PatternRuntimeEvent) => Promise<void> | void;
  hooks?: PatternRuntimeHooks;
}

export interface PatternPayloadResult {
  success: boolean;
  output: unknown;
  metadata?: Record<string, unknown>;
}

export interface PatternRuntimeResult extends PatternPayloadResult {
  pattern: string;
}

/**
 * SCHEMAS SSOT naming uses PatternContext/PatternResult.
 * Keep these aliases bound to runtime I/O types.
 */
export type PatternContext = PatternRuntimeContext;
export type PatternResult = PatternRuntimeResult;

export type CustomConvergenceFn = (context: {
  round: number;
  opinions: Record<string, string>;
  participants: string[];
}) => boolean;

export type CustomEvaluator = (context: {
  votes: Array<{ voterId: string; approved: boolean; score?: number; reason?: string }>;
  participants: string[];
  requiredParticipants: string[];
  config: ConsensusPatternConfig;
}) =>
  | boolean
  | {
      approved: boolean;
      reason?: string;
      score?: number;
    };

export interface DiscussionPatternConfig {
  max_rounds?: number;
  convergence?: "no_disagreements" | "majority" | "unanimous" | "custom";
  on_deadlock?: "escalate" | "retry" | "fail";
  custom_convergence?: CustomConvergenceFn;
}

export interface ConsensusPatternConfig {
  rule?: "majority" | "unanimous" | "weighted" | "score-threshold" | "custom";
  weights?: Record<string, number>;
  threshold?: number;
  timeout?: string;
  best_effort?: string[];
  custom_evaluate?: CustomEvaluator;
}

export interface BrainstormingPatternConfig {
  phase_1?: "generate";
  phase_2?: "evaluate";
  top_n?: number;
  dedup?: "semantic" | "exact";
}

export interface PeerReviewPatternConfig {
  min_score?: number;
  p0_allowed?: number;
  max_rounds?: number;
  best_effort?: string[];
}

export interface RedBluePatternConfig {
  red_team?: string[];
  blue_team?: string[];
  max_rounds?: number;
  convergence?: "red_finds_nothing" | "max_rounds" | "custom";
}

export interface PipelinePatternConfig {
  stages?: string[];
}

export interface FanOutFanInPatternConfig {
  input?: unknown;
  agents?: string[];
  merge?: "concatenate" | "rank" | "vote" | "custom";
}

export interface SupervisorPatternConfig {
  strategy?: "one_for_one" | "one_for_all";
  max_restarts?: number;
  backoff?: "linear" | "exponential";
}

export interface CustomPatternConfig {
  [key: string]: unknown;
}

export type PatternConfig =
  | DiscussionPatternConfig
  | ConsensusPatternConfig
  | BrainstormingPatternConfig
  | PeerReviewPatternConfig
  | RedBluePatternConfig
  | PipelinePatternConfig
  | FanOutFanInPatternConfig
  | SupervisorPatternConfig
  | CustomPatternConfig;

export type PatternConfigByKind = {
  discussion: DiscussionPatternConfig;
  consensus: ConsensusPatternConfig;
  brainstorming: BrainstormingPatternConfig;
  "peer-review": PeerReviewPatternConfig;
  "red-blue": RedBluePatternConfig;
  pipeline: PipelinePatternConfig;
  "fan-out-fan-in": FanOutFanInPatternConfig;
  supervisor: SupervisorPatternConfig;
};

export type PatternYamlStep<K extends BuiltinPatternKind = BuiltinPatternKind> = {
  pattern: K;
  config?: PatternConfigByKind[K];
};

export type BlackboardDomain =
  | "agenda"
  | "meeting-state-machine"
  | "message-bus"
  | "consensus-rule-engine"
  | "voting-session-store"
  | "knowledge"
  | "decision"
  | "state"
  | "actor-pool"
  | "supervisor"
  | "supervisor-tree";

export type PatternBlackboardDomainMapping = Record<BuiltinPatternKind, readonly BlackboardDomain[]>;

export const PATTERN_BLACKBOARD_DOMAIN_MAP: PatternBlackboardDomainMapping = {
  discussion: ["agenda", "meeting-state-machine", "message-bus"],
  consensus: ["consensus-rule-engine", "voting-session-store"],
  brainstorming: ["knowledge"],
  "peer-review": ["decision", "consensus-rule-engine"],
  "red-blue": ["meeting-state-machine", "knowledge"],
  pipeline: ["state"],
  "fan-out-fan-in": ["actor-pool", "knowledge"],
  supervisor: ["supervisor", "supervisor-tree"],
};

export const PATTERN_ERROR_CODE_MAP: Record<BuiltinPatternKind, Record<PatternFailureCategory, OboraErrorCode>> = {
  discussion: {
    failure: OboraErrorCode.CONSENSUS_FAIL,
    timeout: OboraErrorCode.CONSENSUS_TIMEOUT,
    escalation: OboraErrorCode.RECOVERY_ESCALATION_TIMEOUT,
  },
  consensus: {
    failure: OboraErrorCode.CONSENSUS_FAIL,
    timeout: OboraErrorCode.CONSENSUS_TIMEOUT,
    escalation: OboraErrorCode.RECOVERY_ESCALATION_TIMEOUT,
  },
  brainstorming: {
    failure: OboraErrorCode.ORCH_DEPENDENCY_FAILED,
    timeout: OboraErrorCode.ORCH_EXECUTION_TIMEOUT,
    escalation: OboraErrorCode.RECOVERY_ESCALATION_TIMEOUT,
  },
  "peer-review": {
    failure: OboraErrorCode.CONSENSUS_FAIL,
    timeout: OboraErrorCode.CONSENSUS_TIMEOUT,
    escalation: OboraErrorCode.RECOVERY_ESCALATION_TIMEOUT,
  },
  "red-blue": {
    failure: OboraErrorCode.ORCH_DEPENDENCY_FAILED,
    timeout: OboraErrorCode.ORCH_EXECUTION_TIMEOUT,
    escalation: OboraErrorCode.RECOVERY_ESCALATION_TIMEOUT,
  },
  pipeline: {
    failure: OboraErrorCode.ORCH_DEPENDENCY_FAILED,
    timeout: OboraErrorCode.ORCH_EXECUTION_TIMEOUT,
    escalation: OboraErrorCode.RECOVERY_ESCALATION_TIMEOUT,
  },
  "fan-out-fan-in": {
    failure: OboraErrorCode.ORCH_DEPENDENCY_FAILED,
    timeout: OboraErrorCode.ORCH_EXECUTION_TIMEOUT,
    escalation: OboraErrorCode.RECOVERY_ESCALATION_TIMEOUT,
  },
  supervisor: {
    failure: OboraErrorCode.RECOVERY_RETRY_EXHAUSTED,
    timeout: OboraErrorCode.CELL_TIMEOUT,
    escalation: OboraErrorCode.RECOVERY_ESCALATION_TIMEOUT,
  },
};

export function isBuiltinPatternKind(value: string): value is BuiltinPatternKind {
  return (BUILTIN_PATTERN_KINDS as readonly string[]).includes(value);
}

/**
 * Internal pattern implementation contract.
 * - `run`: external runtime entrypoint (called by orchestrator/executors)
 * - `execute`: internal compatibility entrypoint (delegates to `run`)
 * External callers should always use `run`.
 */
export interface CollaborationPattern extends PatternRuntimeContract {
  execute: PatternExecutionFn;
}

export abstract class CollaborationPatternBase implements CollaborationPattern {
  abstract readonly name: string;
  abstract readonly kind: BuiltinPatternKind | (string & {});
  readonly version = "1.0.0";

  validateConfig(_config: PatternConfig): void {
    // optional override
  }

  /**
   * Internal compatibility entrypoint; delegates to `run`.
   */
  async execute(context: PatternRuntimeContext): Promise<PatternRuntimeResult> {
    return this.run(context);
  }

  /**
   * External runtime entrypoint used by orchestrator.
   * Error channel contract:
   * - throw: unrecoverable external constraint violations (timeout/policy/etc), handled by upper recovery.
   * - return { success: false }: expected business-level failure (e.g., quorum not met / rejected).
   */
  async run(context: PatternRuntimeContext): Promise<PatternRuntimeResult> {
    await context.hooks?.onStart?.(context);

    try {
      this.validateConfig(context.config ?? {});
      const result = await this.onExecute(context);
      const normalized: PatternRuntimeResult = {
        ...result,
        pattern: context.pattern,
      };
      await context.hooks?.onComplete?.(normalized, context);
      return normalized;
    } catch (error) {
      await context.hooks?.onError?.(error, context);
      throw error;
    }
  }

  protected abstract onExecute(context: PatternRuntimeContext): Promise<PatternPayloadResult>;
}
