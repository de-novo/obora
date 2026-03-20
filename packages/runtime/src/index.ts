export * from "./cell/index.js";
export * from "./policy/index.js";
export * from "./state/index.js";
export * from "./consensus/index.js";
export * from "./gates/index.js";
export * from "./audit/index.js";
export * from "./errors/index.js";
export * from "./recovery/index.js";
export * from "./orchestrator/index.js";
export * from "./patterns/index.js";
export * from "./plugins/index.js";
export * from "./storage/index.js";
export * from "./artifacts/index.js";
export * from "./checkpoint/index.js";
/**
 * @deprecated Legacy workflow API — will be removed in v0.3.0.
 * Use @obora/sdk Workflow and OboraRuntime instead.
 */
export * from "./_legacy/workflow/index.js";

/**
 * @deprecated Legacy agent roles API — will be removed in v0.3.0.
 * Use cell/agents or @obora/sdk Agent instead.
 */
export * from "./_legacy/agents/roles/index.js";
export * from "./judgment/index.js";

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
export { createSessionId } from "./blackboard/types/base.js";
export type { SessionId } from "./blackboard/types/base.js";
export { TKGObserver, TKGReflector } from "./blackboard/observer-reflector.js";
export type { ObserverOptions, ReflectorOptions } from "./blackboard/observer-reflector.js";
