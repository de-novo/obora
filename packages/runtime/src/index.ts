export * from "./cell/index.js";
export * from "./policy/index.js";
export * as State from "./state/index.js";
export * from "./consensus/index.js";
export * from "./gates/index.js";
export * as Audit from "./audit/index.js";
export type { AuditEvent, AuditEventType, AuditFilter } from "./audit/types.js";
export * from "./errors/index.js";
export * from "./recovery/index.js";
export * from "./orchestrator/index.js";
export * from "./patterns/index.js";
export * as Plugins from "./plugins/index.js";
export * from "./storage/index.js";
export * from "./artifacts/index.js";
export * from "./checkpoint/index.js";
/**
 * @deprecated Legacy workflow API — will be removed in v0.3.0.
 * Use @obora/sdk Workflow and OboraRuntime instead.
 */
export * as LegacyWorkflow from "./_legacy/workflow/index.js";

/**
 * @deprecated Legacy agent roles API — will be removed in v0.3.0.
 * Use cell/agents or @obora/sdk Agent instead.
 */
export * as LegacyAgentRoles from "./_legacy/agents/roles/index.js";
export * as Judgment from "./judgment/index.js";

export { OboraError } from "./_legacy/workflow/errors/index.js";
export type { ErrorCode } from "./_legacy/workflow/errors/index.js";
export { log } from "./_legacy/workflow/utils.js";
export {
  getAllDiagnoses,
  formatDiagnosis,
  getDiagnosis,
} from "./_legacy/workflow/errors/diagnosis.js";
export { parseAndValidate, ValidationErrorCode } from "./_legacy/workflow/validator/workflow-validator.js";
export {
  AgentRole,
  AgentState,
  MeetingPhase,
  BaseAgent,
  createAgent,
} from "./_legacy/agents/roles/index.js";
export type {
  AgentContext,
  AgentStatus,
  Task,
  TaskResult,
  RuntimeExtensions,
} from "./_legacy/agents/roles/index.js";
export type {
  Step,
  Workflow,
} from "./_legacy/workflow/types/workflow.js";
export type {
  ValidationResult,
  ValidationError,
} from "./_legacy/workflow/validator/workflow-validator.js";
/**
 * Promoted blackboard API — canonical location for blackboard pattern.
 * Previously at _legacy/blackboard.
 *
 * NOTE: The full blackboard module is available via direct import from
 * packages/runtime/src/blackboard/index.ts. Only selected exports are
 * re-exported here to avoid naming conflicts with the legacy
 * Blackboard class from state/RuntimeBlackboardCompat.
 */
export { Blackboard as BoardBlackboard } from "./blackboard/core/blackboard.js";
export { createAgentId, createSessionId } from "./blackboard/types/base.js";
export type { AgentId, SessionId } from "./blackboard/types/base.js";
export { TKGObserver, TKGReflector } from "./blackboard/observer-reflector.js";
export type { ObserverOptions, ReflectorOptions } from "./blackboard/observer-reflector.js";
