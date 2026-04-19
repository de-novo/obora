export { Agent } from "./agent.js";
export { Policy } from "./policy.js";
export { PLUGIN_TYPES } from "./plugin-types.js";
export { PluginLoader } from "./plugin-loader.js";
export { PluginRegistry } from "./plugin-registry.js";
export { PluginManager } from "./plugin-manager.js";
export { PLUGIN_TYPE_ALIASES, resolvePluginType } from "./plugin-type-map.js";
export { validatePluginMetadata } from "./plugin-validator.js";
export { OboraRuntime, OboraError, OboraErrorCode } from "./runtime.js";
export { Workflow } from "./workflow.js";
export { detectLLMConfigFromEnv, resolveLLMConfig } from "./llm-config.js";
export { loadConfig, resolveProviderConfig } from "./config-loader.js";
export {
  buildResolutionSummary,
  formatResolutionSummary,
  buildBindingPreview,
  formatBindingPreview,
  buildOutputPreview,
  formatOutputPreview,
} from "./resolution-summary.js";
export { formatDiagnostic } from "./diagnostics.js";
export { CostTracker, BudgetExceededError } from "./cost-tracker.js";
export {
  validateKnowledgeSchema,
  validateKnowledgeSchemaContent,
  validateKnowledgeTag,
  parseKnowledgeSchema,
} from "./knowledge/schema-validator.js";
export {
  queryKnowledge,
  configureKnowledgeProvider,
  configureKnowledgeProviderFromBlackboard,
  configureKnowledgeProviderFromSqlite,
  mapBlackboardToKnowledgeResults,
} from "./knowledge/queryKnowledge.js";
export { clearKnowledgeCache } from "./knowledge/queryKnowledge-cache.js";
export { executeWorkflowHook, resolveWorkflowHook, WORKFLOW_HOOK_LIFECYCLES } from "./hooks.js";
export {
  normalizeTag,
  suggestTags,
  validateAndSuggestTag,
  mergeTagsWithConflictResolution,
} from "./knowledge/schema-ai.js";
export { createAuthResolver, resolveAuthRef } from "./auth-resolver.js";
export { StepExecutor } from "./step-executor.js";
export { findSchemaMismatchReason, loadMinimalJsonSchema } from "./schema-output.js";
export { topologicalSort, groupByParallelizableLevels } from "./dependency-resolver.js";
export { ParallelScheduler } from "./execution/parallel-scheduler.js";
export { buildExecutionAgentSnapshot } from "./agents/execution-resolution-snapshot.js";
export {
  buildValidationSignature,
  getRepairLoopConfig,
  getValidationStepConfig,
  normalizeValidationResult,
} from "./validation-repair.js";
export {
  MockAgent,
  MockTool,
  runWorkflowTest,
  validateFixture,
  loadFixture,
  loadFixtures,
  fixtureToTestCase,
} from "./testing/index.js";

export type { AgentContext, AgentResult } from "./agent.js";
export type { PolicyDefinition } from "./policy.js";
export type { PluginType, PluginMetadata, PluginDescriptor, LoadedPlugin } from "./plugin-types.js";
export type { PluginLoaderOptions } from "./plugin-loader.js";
export type { PluginRegistryOptions, RegisterOptions } from "./plugin-registry.js";
export type { PluginManagerOptions } from "./plugin-manager.js";
export type {
  PersistenceConfig,
  OboraRuntimeConfig,
  SharedMemoryConfig,
  TKGProjectionConfig,
  RunOptions,
  RunHandle,
  RunStatus,
  EventHandler,
  Unsubscribe,
  AgentFactory,
  ToolHandler,
  PatternRegistration,
  OboraAuditConfig,
  AuditEventType,
  AuditEvent,
} from "./runtime.js";
export type {
  AddStepOptions,
  HookDefinition,
  OnFailConfig,
  OnFailRoute,
  GotoTarget,
  MergeStrategy,
  ParallelBranch,
  WorkflowDef,
  WorkflowHooks,
  WorkflowSharedMemoryConfig,
  WorkflowTKGProjectionConfig,
  WorkflowStep,
  WorkflowStepConfig,
} from "./workflow.js";
export type {
  ExecutionPlan,
  ParallelStepOutcome,
  ParallelStepResult,
  ParallelStepFailure,
} from "./execution/parallel-scheduler.js";
export type {
  ExecutionAgentSource,
  ExecutionAgentSourceKind,
  ExecutionAgentSnapshot,
} from "./agents/execution-resolution-snapshot.js";
export type {
  PeerReviewStepResult,
  PeerReviewStepConfig,
  PeerReviewSummary,
  ReviewerScore,
  Vote,
} from "./execution/peer-review-executor.js";
export type { HookExecutionResult, WorkflowHookLifecycle } from "./hooks.js";
export type { LLMConfig } from "./llm-config.js";
export type { ResolutionSummary } from "./resolution-summary.js";
export type {
  OneFileMode,
  OneFileStopSemantics,
  ValidationRepairStopSemantics,
  ResearchLoopStopSemantics,
  ProofLoopStopSemantics,
  JudgeStopSemantics,
} from "./one-file-modes.js";
export type { OboraConfig, ResolvedProviderConfig, ModelPricing } from "./config-loader.js";
export type {
  StepContext,
  StepExecutorConfig,
  StepResult,
  LLMAdapterLike,
  ToolHandler as StepToolHandler,
} from "./step-executor.js";
export type {
  RepairContext,
  RepairLoopConfig,
  ValidationFailureCheck,
  ValidationResult,
  ValidationStepConfig,
} from "./validation-repair.js";
export type { RouteResolution } from "./conditional-routing.js";
export { resolveFailureRoute, validateRoutes, getAllRouteTargets } from "./conditional-routing.js";
export { BUILTIN_TOOLS } from "./step-executor.js";
export { BlackboardManager, ExecutionObserver, ExecutionReflector } from "./blackboard/index.js";
export type {
  BlackboardManagerOptions,
  FailureEntry,
  BlackboardFact,
  BlackboardSnapshot,
  SharedMemoryImportResult,
  StepMetrics,
  ExecutionMetrics,
  ExecutionReport,
  ExecutionReportStepMetric,
} from "./blackboard/index.js";

export { FileSharedMemoryStore, mergeSharedMemorySnapshots } from "./shared-memory/index.js";
export type {
  MemoryScope,
  MemoryScopeLevel,
  SharedMemoryFact,
  SharedMemoryDecision,
  SharedMemorySnapshot,
  SharedMemoryStore,
} from "./shared-memory/index.js";

export {
  TKGProjector,
  projectAuditEventToTemporalNode,
  FileStagingTKGStore,
  FileTKGReviewQueueStore,
  FileTKGRollbackStore,
  listOpenTKGReviewQueueItems,
  listOpenTKGReviewQueueItemsFromStore,
  mergeStagingTKGSnapshot,
  mergeTKGRollbackSnapshot,
  mergeTKGReviewQueueSnapshot,
  resolveTKGReviewQueueItemInStore,
  resolveTKGReviewQueueSnapshot,
  restoreTKGRollbackEntryToSharedMemory,
  restoreTKGRollbackFromStore,
  selectTKGRollbackEntry,
  summarizeTKGRollbackEntries,
  applyApprovedTKGReviewQueueItemsToSharedMemory,
  buildSharedMemorySnapshotFromApprovedTKGReviewQueueItem,
  buildSharedMemorySnapshotFromApprovedTKGReviewQueueItems,
  buildSharedMemorySnapshotFromTKGPromotion,
  reapplyApprovedTKGReviewQueueItems,
  summarizeTKGPromotionApply,
  PROJECTABLE_TKG_EVENT_TYPES,
  estimateTemporalNodeConfidence,
  detectTKGConflicts,
  evaluateTKGPromotion,
  summarizeTKGPromotionEvaluation,
} from "./tkg/index.js";
export type {
  TKGProjectorOptions,
  TKGProjectionSummary,
  ProjectableTKGEventType,
  TemporalNode,
  TemporalNodeRelation,
  StagingTKGSnapshot,
  StagingTKGStore,
  PromotionCandidate,
  TKGConflict,
  TKGConflictType,
  ApprovedTKGReviewQueueReapplyRequest,
  TKGApprovedReviewQueueApplySummary,
  TKGPromotionApplyOptions,
  TKGPromotionApplySummary,
  TKGPromotionEvaluation,
  TKGPromotionOptions,
  TKGPromotionSummary,
  TKGReviewQueueItem,
  TKGReviewQueueResolution,
  TKGReviewQueueResolutionSummary,
  TKGReviewQueueSnapshot,
  TKGReviewQueueStatus,
  TKGReviewQueueStore,
  TKGRollbackEntry,
  TKGRollbackRestoreSummary,
  TKGRollbackSnapshot,
  TKGRollbackStore,
  TKGRollbackSummary,
} from "./tkg/index.js";

// ── Reflector v2 ────────────────────────────────────────────────────────
export { ReflectorEngine } from "./reflector/index.js";
export {
  KeywordAnalyzer,
  SignatureAnalyzer,
  CategoryAnalyzer,
  TrendAnalyzer,
  ActionRegistry,
  RuleEngine,
  KnowledgeStore,
  createDefaultAnalyzers,
  createDefaultActionRegistry,
} from "./reflector/index.js";
export type {
  ReflectorAnalyzer,
  AnalyzerContext,
  AnalyzerResult,
  AnalysisSummary,
  SuggestedAction,
  ReflectorAction,
  ActionExecutionContext,
  ActionResult,
  ActionHandler,
  RuleCondition,
  ReflectorRule,
  KnowledgeEntry,
  ReflectorOutput,
  ReflectorEngineOptions,
} from "./reflector/index.js";

export type {
  StepHandler,
  ToolContext,
  ToolExecutor,
  WorkflowTestCase,
  TestResult,
  TestFailure,
  YamlFixture,
} from "./testing/index.js";
export type {
  ReExecutionOptions,
  ReExecutionResult,
  ReExecutionPlan,
  ReExecutionDiffReport,
  StepReExecutionResult,
  StepDiff,
  NonDeterminismWarning,
} from "./replay.js";
export {
  type DLQEntry,
  type DLQSnapshot,
  type DLQStore,
  type DLQSummary,
  createDLQEntry,
  summarizeDLQ,
  resolveDLQEntry,
  FileDLQStore,
} from "./dlq/index.js";
export {
  CircuitBreaker,
  CircuitOpenError,
  type CircuitBreakerConfig,
  type CircuitState,
} from "./execution/circuit-breaker.js";
export { type ExecutionLock, FileExecutionLock } from "./execution/execution-lock.js";
export {
  HealthChecker,
  createStuckExecutionCheck,
  type HealthStatus,
  type HealthCheckResult,
  type HealthCheckConfig,
  type HealthCheckFn,
} from "./execution/health-check.js";
export {
  type Alert,
  type AlertChannel,
  type AlertingConfig,
  AlertManager,
  WebhookAlertChannel,
  ConsoleAlertChannel,
} from "./alerting/index.js";
export {
  MetricsCollector,
  OBORA_METRICS,
  type MetricPoint,
  type HistogramBucket,
  type HistogramMetric,
  type MetricsSnapshot,
} from "./metrics/index.js";
