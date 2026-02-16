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

export enum OboraErrorCode {
  CELL_TIMEOUT = "CELL_1001",
  CELL_TOOL_DENIED = "CELL_1002",
  CELL_LLM_ERROR = "CELL_1003",
  CELL_ABORTED = "CELL_1004",

  POLICY_DENY = "POLICY_2001",
  POLICY_GATE_REQUIRED = "POLICY_2002",
  POLICY_GATE_TIMEOUT = "POLICY_2003",
  POLICY_GATE_REJECTED = "POLICY_2004",
  POLICY_SANDBOX_VIOLATION = "POLICY_2005",
  POLICY_RESOURCE_EXCEEDED = "POLICY_2006",
  POLICY_LOAD_FAILED = "POLICY_2007",

  CONSENSUS_FAIL = "CONSENSUS_3001",
  CONSENSUS_TIMEOUT = "CONSENSUS_3002",
  CONSENSUS_QUORUM_NOT_MET = "CONSENSUS_3003",

  RECOVERY_RETRY_EXHAUSTED = "RECOVERY_4001",
  RECOVERY_ROLLBACK_FAILED = "RECOVERY_4002",
  RECOVERY_ESCALATION_TIMEOUT = "RECOVERY_4003",

  ORCH_WORKFLOW_NOT_FOUND = "ORCH_5001",
  ORCH_STEP_NOT_FOUND = "ORCH_5002",
  ORCH_DEPENDENCY_FAILED = "ORCH_5003",
  ORCH_EXECUTION_TIMEOUT = "ORCH_5004",

  AUDIT_STORE_ERROR = "AUDIT_6001",
  AUDIT_REPLAY_NOT_FOUND = "AUDIT_6002",

  ADAPTER_LLM_UNAVAILABLE = "ADAPTER_7001",
  ADAPTER_AUTH_FAILED = "ADAPTER_7002",
  ADAPTER_TOOL_NOT_FOUND = "ADAPTER_7003",
}

export interface PatternRuntimeHooks {
  onStart?(context: PatternRuntimeContext): Promise<void> | void;
  onEvent?(event: PatternRuntimeEvent, context: PatternRuntimeContext): Promise<void> | void;
  onComplete?(result: PatternRuntimeResult, context: PatternRuntimeContext): Promise<void> | void;
  onError?(error: unknown, context: PatternRuntimeContext): Promise<void> | void;
}

export interface PatternRuntimeContract {
  readonly name: string;
  readonly kind: BuiltinPatternKind | (string & {});
  readonly version?: string;

  validateConfig?(config: PatternConfig): void;
  run(context: PatternRuntimeContext): Promise<PatternRuntimeResult>;
}

export interface PatternRuntimeEvent {
  type: string;
  payload?: unknown;
  timestamp?: string;
}

export interface PatternContext {
  steps?: Array<(input: unknown) => unknown | Promise<unknown>>;
  input?: unknown;
  [key: string]: unknown;
}

export interface PatternRuntimeContext extends PatternContext {
  executionId?: string;
  stepName?: string;
  pattern: string;
  participants?: Record<string, string>;
  config?: PatternConfig;
  emit?: (event: PatternRuntimeEvent) => Promise<void> | void;
  hooks?: PatternRuntimeHooks;
}

export interface PatternResult {
  success: boolean;
  output: unknown;
  metadata?: Record<string, unknown>;
}

export interface PatternRuntimeResult extends PatternResult {
  pattern: string;
}

export interface DiscussionPatternConfig {
  max_rounds?: number;
  convergence?: "no_disagreements" | "majority" | "unanimous" | "custom";
  on_deadlock?: "escalate" | "retry" | "fail";
}

export interface ConsensusPatternConfig {
  rule?: "majority" | "unanimous" | "weighted" | "score-threshold" | "custom";
  weights?: Record<string, number>;
  threshold?: number;
  timeout?: string;
  best_effort?: string[];
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

export interface CollaborationPattern extends PatternRuntimeContract {
  execute(context: PatternRuntimeContext): Promise<PatternRuntimeResult>;
}

export abstract class CollaborationPatternBase implements CollaborationPattern {
  abstract readonly name: string;
  abstract readonly kind: BuiltinPatternKind | (string & {});
  readonly version = "1.0.0";

  validateConfig(_config: PatternConfig): void {
    // optional override
  }

  async execute(context: PatternRuntimeContext): Promise<PatternRuntimeResult> {
    return this.run(context);
  }

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

  protected abstract onExecute(context: PatternRuntimeContext): Promise<PatternResult>;
}
