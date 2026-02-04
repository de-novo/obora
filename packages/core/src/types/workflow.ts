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
export interface Step {
  /** Unique name for the step */
  name: string;
  /** Agent responsible for executing the step */
  agent: string;
  /** Optional description of the step */
  description?: string;
  /** Explicit dependencies on other steps */
  depends_on?: string[];
  /** Input files or artifacts required */
  inputs?: string[];
  /** Output files or artifacts produced */
  outputs?: string[];
  /** Timeout for the step (e.g., "5m", "1h") */
  timeout?: string;
  /** Step-specific configuration */
  config?: Record<string, unknown>;
}

/**
 * Complete workflow definition
 */
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
