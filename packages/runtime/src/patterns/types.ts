import { OboraErrorCode } from "../errors/OboraErrorCode.js";

export { OboraErrorCode };

/**
 * Core domain patterns. "composite" is a meta-pattern registered separately
 * because it orchestrates other patterns rather than implementing domain logic.
 */
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

export type VoterRole = "ai" | "human" | "service";

export interface VoterRoleConfig {
  /** Role of this voter. Default: "ai". */
  role: VoterRole;
  /** Voter ids assigned this role. */
  voters: string[];
}

export type EscalationTrigger = "timeout" | "quorum_not_met";

export interface EscalationConfig {
  /** Which failure conditions trigger escalation instead of plain failure/throw. */
  triggers: EscalationTrigger[];
  /** Opaque target identifier for the escalation handler. */
  target?: string;
}

export type CustomEvaluator = (context: {
  votes: Array<{ voterId: string; approved: boolean; score?: number; reason?: string; role?: VoterRole }>;
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
  /** Number of extra retry rounds when on_deadlock='retry'. Default 1. Must be >= 1. */
  retry_budget?: number;
  custom_convergence?: CustomConvergenceFn;
}

export interface ConsensusPatternConfig {
  rule?: "majority" | "unanimous" | "weighted" | "score-threshold" | "custom";
  weights?: Record<string, number>;
  threshold?: number;
  timeout?: string;
  best_effort?: string[];
  custom_evaluate?: CustomEvaluator;
  /** Voter role assignments. Voters not listed default to "ai". */
  voter_roles?: VoterRoleConfig[];
  /** Escalation integration point for timeout/quorum failures. */
  escalation?: EscalationConfig;
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

export type RedBlueEscalationTrigger = "max_rounds_exhausted";

export interface RedBlueEscalationConfig {
  /** Which failure conditions trigger escalation instead of plain failure. */
  triggers: RedBlueEscalationTrigger[];
  /** Opaque target identifier for the escalation handler. */
  target?: string;
}

export interface RedBluePatternConfig {
  red_team?: string[];
  blue_team?: string[];
  max_rounds?: number;
  convergence?: "red_finds_nothing" | "max_rounds" | "custom";
  /** Required when convergence='custom'. */
  custom_convergence?: (payload: {
    round: number;
    rounds: Array<{ round: number; red_findings: Record<string, unknown>; blue_responses: Record<string, unknown> }>;
    current_round: { round: number; red_findings: Record<string, unknown>; blue_responses: Record<string, unknown> };
    subject: unknown;
    red_team: string[];
    blue_team: string[];
  }) => boolean;
  /** Escalation integration point for failure paths. */
  escalation?: RedBlueEscalationConfig;
}

export interface PipelinePatternConfig {
  stages?: string[];
}

/**
 * failure_policy controls how partial participant failures are handled:
 * - "best_effort" (default): succeed if at least 1 participant succeeds.
 * - "required": succeed only if >= min_success participants succeed.
 *   When min_success is omitted under "required", ALL participants must succeed.
 *
 * min_success: minimum number of successful participants for "required" mode.
 *   Must be >= 1 and <= participant count. Ignored under "best_effort".
 */
export interface FanOutFanInPatternConfig {
  merge?: "concatenate" | "rank" | "vote" | "custom";
  failure_policy?: "best_effort" | "required";
  /** Minimum successful participants for "required" mode. Defaults to total participant count. */
  min_success?: number;
}
export interface SupervisorPatternConfig {
  strategy?: "one_for_one" | "one_for_all";
  max_restarts?: number;
  backoff?: "linear" | "exponential";
}

export interface CompositeStage {
  name: string;
  pattern: string;
  config?: Record<string, unknown>;
  participants?: Record<string, string>;
  input_from?: "previous" | "root" | string;
}

export interface CompositePatternConfig {
  stages: CompositeStage[];
  on_stage_failure?: "fail" | "skip" | "escalate";
}

export interface CustomPatternDefinition {
  name: string;
  version?: string;
  kind?: string;
  description?: string;
  execute: (context: PatternRuntimeContext) => Promise<PatternPayloadResult>;
  validateConfig?: (config: PatternConfig) => void;
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
  | CompositePatternConfig
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
  composite: CompositePatternConfig;
};

export type PatternYamlStep<K extends keyof PatternConfigByKind = keyof PatternConfigByKind> = {
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

export type PatternBlackboardDomainMapping = Record<keyof PatternConfigByKind, readonly BlackboardDomain[]>;

export const PATTERN_BLACKBOARD_DOMAIN_MAP: PatternBlackboardDomainMapping = {
  discussion: ["agenda", "meeting-state-machine", "message-bus"],
  consensus: ["consensus-rule-engine", "voting-session-store"],
  brainstorming: ["knowledge"],
  "peer-review": ["decision", "consensus-rule-engine"],
  "red-blue": ["meeting-state-machine", "knowledge"],
  pipeline: ["state"],
  "fan-out-fan-in": ["actor-pool", "knowledge"],
  supervisor: ["supervisor", "supervisor-tree"],
  composite: ["state", "knowledge"],
};

export const PATTERN_ERROR_CODE_MAP: Record<keyof PatternConfigByKind, Record<PatternFailureCategory, OboraErrorCode>> = {
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
  composite: {
    failure: OboraErrorCode.ORCH_DEPENDENCY_FAILED,
    timeout: OboraErrorCode.ORCH_EXECUTION_TIMEOUT,
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
