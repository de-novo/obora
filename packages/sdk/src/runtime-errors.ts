/**
 * OboraError and OboraErrorCode — pure leaf module.
 *
 * Extracted from runtime-types.ts to break circular import chains.
 * This module MUST NOT import from any other SDK module.
 */

export const OboraErrorCode = {
  CELL_TIMEOUT: "CELL_1001",
  CELL_TOOL_DENIED: "CELL_1002",
  CELL_LLM_ERROR: "CELL_1003",
  CELL_ABORTED: "CELL_1004",
  POLICY_DENY: "POLICY_2001",
  POLICY_GATE_REQUIRED: "POLICY_2002",
  POLICY_GATE_TIMEOUT: "POLICY_2003",
  POLICY_GATE_REJECTED: "POLICY_2004",
  POLICY_SANDBOX_VIOLATION: "POLICY_2005",
  POLICY_RESOURCE_EXCEEDED: "POLICY_2006",
  POLICY_LOAD_FAILED: "POLICY_2007",
  CONSENSUS_FAIL: "CONSENSUS_3001",
  CONSENSUS_TIMEOUT: "CONSENSUS_3002",
  CONSENSUS_QUORUM_NOT_MET: "CONSENSUS_3003",
  RECOVERY_RETRY_EXHAUSTED: "RECOVERY_4001",
  RECOVERY_ROLLBACK_FAILED: "RECOVERY_4002",
  RECOVERY_ESCALATION_TIMEOUT: "RECOVERY_4003",
  ORCH_WORKFLOW_NOT_FOUND: "ORCH_5001",
  ORCH_STEP_NOT_FOUND: "ORCH_5002",
  ORCH_DEPENDENCY_FAILED: "ORCH_5003",
  ORCH_EXECUTION_TIMEOUT: "ORCH_5004",
  AUDIT_STORE_ERROR: "AUDIT_6001",
  AUDIT_REPLAY_NOT_FOUND: "AUDIT_6002",
  ADAPTER_LLM_UNAVAILABLE: "ADAPTER_7001",
  ADAPTER_AUTH_FAILED: "ADAPTER_7002",
  ADAPTER_TOOL_NOT_FOUND: "ADAPTER_7003",
  SDK_WORKFLOW_NOT_FOUND: "SDK_8001",
  SDK_EXECUTION_CANCELLED: "SDK_8002",
  SDK_NOT_IMPLEMENTED: "SDK_8003",
  SDK_INVALID_POLICY: "SDK_8004",
  SDK_INVALID_WORKFLOW: "SDK_8005",
  SDK_UNKNOWN_ERROR: "SDK_8006",
  SDK_EXECUTION_NOT_FOUND: "SDK_8007",
  SDK_INVALID_CONFIG: "SDK_8008",
  SDK_CONFIG_ERROR: "SDK_8009",
  EXECUTION_FAILED: "SDK_8010",
  SDK_TOOL_INPUT_INVALID: "SDK_8011",
  SDK_INVALID_PLUGIN: "SDK_9001",
  SDK_PLUGIN_LOAD_FAILED: "SDK_9002",
  SDK_PLUGIN_CONFLICT: "SDK_9003",
  SDK_FIXTURE_INVALID: "SDK_9004",
} as const;

export class OboraError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly executionId?: string,
    public readonly stepName?: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OboraError";
  }

  // ── Factory methods ────────────────────────────────────────────────────────

  static workflowNotFound(name: string): OboraError {
    return new OboraError(
      `Workflow is not defined: ${name}`,
      OboraErrorCode.SDK_WORKFLOW_NOT_FOUND,
    );
  }

  static stepNotFound(name: string): OboraError {
    return new OboraError(
      `Step is not defined: ${name}`,
      OboraErrorCode.ORCH_STEP_NOT_FOUND,
    );
  }

  static executionNotFound(id: string): OboraError {
    return new OboraError(
      `Execution not found: ${id}`,
      OboraErrorCode.SDK_EXECUTION_NOT_FOUND,
    );
  }

  static checkpointNotFound(id: string): OboraError {
    return new OboraError(
      `No checkpoint found for run: ${id}`,
      "SDK_CHECKPOINT_NOT_FOUND",
    );
  }

  static policyLoadFailed(cause?: unknown): OboraError {
    return new OboraError(
      "Failed to load policy",
      OboraErrorCode.POLICY_LOAD_FAILED,
      undefined,
      undefined,
      cause,
    );
  }

  static adapterUnavailable(cause?: unknown): OboraError {
    return new OboraError(
      "LLM adapter is unavailable",
      OboraErrorCode.ADAPTER_LLM_UNAVAILABLE,
      undefined,
      undefined,
      cause,
    );
  }

  static invalidWorkflow(message: string): OboraError {
    return new OboraError(message, OboraErrorCode.SDK_INVALID_WORKFLOW);
  }

  static policyDrift(oldHash: string, newHash: string): OboraError {
    return new OboraError(
      `Policy drift detected: ${oldHash} → ${newHash}`,
      "SDK_POLICY_DRIFT",
    );
  }

  static resumeInvalidStatus(id: string, status: string): OboraError {
    return new OboraError(
      `Run ${id} is not resumable (status: ${status})`,
      "SDK_RESUME_INVALID_STATUS",
      id,
    );
  }

  static executionCancelled(id: string, reason?: string): OboraError {
    return new OboraError(
      reason ?? "Execution cancelled",
      OboraErrorCode.SDK_EXECUTION_CANCELLED,
      id,
    );
  }

  static replayExecutionNotFound(id: string): OboraError {
    return new OboraError(
      `Execution not found: ${id}`,
      OboraErrorCode.AUDIT_REPLAY_NOT_FOUND,
    );
  }

  static replayStepNotFound(stepName: string): OboraError {
    return new OboraError(
      `Checkpoint step not found: ${stepName}`,
      OboraErrorCode.AUDIT_REPLAY_NOT_FOUND,
    );
  }

  static invalidPolicy(message: string): OboraError {
    return new OboraError(message, OboraErrorCode.SDK_INVALID_POLICY);
  }

  static circularDependency(): OboraError {
    return new OboraError(
      "Circular dependency detected in workflow",
      OboraErrorCode.SDK_INVALID_WORKFLOW,
    );
  }

  static persistenceDisabled(): OboraError {
    return new OboraError("Persistence is not enabled", "SDK_PERSISTENCE_DISABLED");
  }

  static persistenceConfigError(): OboraError {
    return new OboraError("Invalid persistence configuration", "SDK_PERSISTENCE_CONFIG_ERROR");
  }

  static invalidConfig(message: string): OboraError {
    return new OboraError(message, OboraErrorCode.SDK_INVALID_CONFIG);
  }

  static configError(message: string): OboraError {
    return new OboraError(message, OboraErrorCode.SDK_CONFIG_ERROR);
  }

  static pluginConflict(name: string): OboraError {
    return new OboraError(
      `Plugin conflict: ${name} is already registered`,
      OboraErrorCode.SDK_PLUGIN_CONFLICT,
    );
  }

  static pluginInvalid(message: string): OboraError {
    return new OboraError(message, OboraErrorCode.SDK_INVALID_PLUGIN);
  }

  static pluginLoadFailed(name: string): OboraError {
    return new OboraError(
      `Failed to load plugin: ${name}`,
      OboraErrorCode.SDK_PLUGIN_LOAD_FAILED,
    );
  }

  static invalidPluginType(type: string): OboraError {
    return new OboraError(
      `Unknown plugin type: ${type}`,
      OboraErrorCode.SDK_INVALID_PLUGIN,
    );
  }

  static fixtureInvalid(message: string): OboraError {
    return new OboraError(message, OboraErrorCode.SDK_FIXTURE_INVALID);
  }

  static executionFailed(message: string): OboraError {
    return new OboraError(message, OboraErrorCode.EXECUTION_FAILED);
  }

  static toolInputInvalid(toolName: string | undefined, cause?: unknown): OboraError {
    const suffix = toolName ? ` for tool '${toolName}'` : "";
    return new OboraError(
      `Tool input failed schema validation${suffix}`,
      OboraErrorCode.SDK_TOOL_INPUT_INVALID,
      undefined,
      undefined,
      cause,
    );
  }

  static adapterAuthFailed(): OboraError {
    return new OboraError("Authentication failed", OboraErrorCode.ADAPTER_AUTH_FAILED);
  }

  static adapterToolNotFound(name: string): OboraError {
    return new OboraError(
      `Tool not found: ${name}`,
      OboraErrorCode.ADAPTER_TOOL_NOT_FOUND,
    );
  }
}
