/**
 * Workflow Core - Provider-Agnostic Workflow Engine
 *
 * This package provides the core workflow execution logic
 * without being tied to any specific AI provider.
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Result Pattern
  Result,
  // Project
  ProjectConfig,
  ProjectIdentifier,
  ResolvedProject,
  // Agent
  AgentDefinition,
  WorkflowStep,
  FeedbackLoop,
  WorkflowPlan,
  AgentResult,
  SessionInfo,
  // Provider
  AgentProvider,
  AgentRunOptions,
  AgentMessage,
  TokenUsage,
} from "./types.js";

export { ok, err } from "./types.js";

// ============================================================================
// Agent Loading
// ============================================================================

export {
  loadAgents,
  formatAgentsForPlanner,
  getAgentByName,
  findProjectRoot,
} from "./agent-loader.js";

// ============================================================================
// Workflow Engine
// ============================================================================

export {
  executeWorkflow,
  type ExecuteWorkflowOptions,
  type JsonParseError,
} from "./engine.js";

// ============================================================================
// Tracking
// ============================================================================

export {
  WorkflowTracker,
  getTracker,
  resetTracker,
} from "./tracker.js";

// ============================================================================
// Project Management
// ============================================================================

export {
  ProjectService,
  getProjectService,
  resetProjectService,
} from "./project-service.js";

// ============================================================================
// Database
// ============================================================================

export {
  initializeDb,
  getDbPath,
  dbExists,
} from "./db-init.js";
