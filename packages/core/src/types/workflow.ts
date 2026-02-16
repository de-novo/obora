/**
 * Workflow type definitions for obora-kit
 * @module @obora/core/types/workflow
 */

/**
 * Workflow execution mode
 */
export type WorkflowMode = "auto" | "supervised" | "gated" | "manual";

/**
 * Workflow configuration options
 */
export interface WorkflowConfig {
  /** Number of retry attempts for failed steps */
  retry?: number;
  /** Delay between retries (e.g., "5s", "1m") */
  retry_delay?: string;
  /** Continue execution on step failure */
  continue_on_error?: boolean;
  /** Maximum concurrent steps */
  max_parallel?: number;
}

/**
 * Step definition within a workflow
 */
export type GateType = "human-approval" | "consensus" | "external";

export interface StateBinding {
  source: string;
  target: string;
  transform?: string;
  condition?: string;
}

export interface ConsensusVoterSpec {
  id: string;
  weight?: number;
  role?: "ai" | "human" | "service";
  required?: boolean;
}

export interface ConsensusConfig {
  type: "majority" | "unanimous" | "weighted" | "score-threshold" | "custom";
  voters?: ConsensusVoterSpec[];
  min?: number;
  of?: number;
  threshold?: number;
  timeout?: string;
  best_effort?: string[];
  custom?: string;
}

export interface GateConfig {
  timeout?: string;
  fallback?: "fail" | "escalate" | "auto-approve";
  escalation_to?: string;
}

export interface ToolPolicyOverride {
  name: string;
  effect: "allow" | "deny" | "transform" | "gate";
}

export interface PolicyOverride {
  sandbox?: string;
  tools_override?: ToolPolicyOverride[];
}

export interface Step {
  /** Unique name for the step */
  name: string;
  /** Agent responsible for executing the step */
  agent: string;
  /** Optional description of the step */
  description?: string;
  /** Optional provider override for this step */
  provider?: string;
  /** Optional model override for this step */
  model?: string;
  /** Explicit dependencies on other steps */
  depends_on?: string[];
  /** Input files or artifacts required */
  inputs?: string[];
  /** Output files or artifacts produced */
  outputs?: string[];
  /** Timeout for the step (e.g., "5m", "1h") */
  timeout?: string;
  /** Optional skills to activate for this step */
  skills?: string[];
  /** Optional tool whitelist */
  tools?: string[];
  /** State binding declarations */
  bindings?: StateBinding[];
  /** Step consensus configuration */
  consensus?: ConsensusConfig;
  /** Step gate type */
  gate?: GateType;
  /** Step gate details */
  gate_config?: GateConfig;
  /** Collaboration pattern */
  pattern?: string;
  /** Pattern participant mapping */
  participants?: Record<string, string>;
  /** Step policy override */
  policy?: PolicyOverride;
  /** Step-specific configuration (legacy/backward compatibility) */
  config?: Record<string, unknown>;
}

/**
 * Complete workflow definition
 */
export interface RecoveryStrategyConfig {
  on_fail: "retry" | "rollback" | "escalate" | "alternative" | "custom";
  max_retries?: number;
  backoff?: "linear" | "exponential";
  backoff_base?: string;
  to?: string;
  fallback?: Omit<Step, "depends_on">;
  custom?: string;
}

export interface Workflow {
  /** Workflow name */
  name: string;
  /** Workflow version */
  version?: string;
  /** Optional description */
  description?: string;
  /** Execution mode */
  mode?: WorkflowMode;
  /** Global workflow configuration */
  config?: WorkflowConfig;
  /** List of steps */
  steps: Step[];
  /** Workflow-level recovery by step name */
  recovery?: Record<string, RecoveryStrategyConfig>;
}

/**
 * Dependency map: step name -> list of dependency step names
 */
export type DependencyMap = Map<string, string[]>;

/**
 * Parser options
 */
export interface ParserOptions {
  /** Enable strict mode (throw on unknown fields) */
  strict?: boolean;
  /** Callback for warnings */
  onWarning?: (warning: string) => void;
}

/**
 * Parse result with warnings
 */
export interface ParseResult<T> {
  data: T;
  warnings: string[];
}
