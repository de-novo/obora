/**
 * @obora/core
 *
 * Multi-AI Debate Engine - Core Library
 *
 * @example
 * ```typescript
 * import { DebateEngine, ClaudeProvider, OpenAIProvider } from '@obora/core';
 *
 * const engine = new DebateEngine({ mode: 'strong' });
 *
 * const result = await engine.run({
 *   topic: 'Should we migrate to microservices?',
 *   participants: [
 *     { name: 'claude', provider: new ClaudeProvider() },
 *     { name: 'openai', provider: new OpenAIProvider() },
 *   ],
 *   orchestrator: new ClaudeProvider(),
 * });
 * ```
 */

// Auth - OAuth for Claude Pro/Max (optional)
export * from './auth'
// Config - Configuration management
export {
  type AIName,
  type ConfigLoaderOptions,
  DEFAULT_CONFIG,
  getDefaultConfig,
  loadConfig,
  loadConfigFromEnv,
  loadConfigFromFile,
  type OboraConfig,
  type ProviderSettings,
} from './config'
// Engine - Core debate logic (with streaming support)
export {
  DebateEngine,
  type DebateEngineConfig,
  type DebateMode,
  type DebateOptions,
  type DebateParticipant,
  type DebatePhase,
  type DebateResult,
  type DebateRound,
  type DebateStreamEvent,
  type PositionChange,
  type StreamingDebateOptions,
  type StreamingParticipant,
  type ToolCall,
} from './engine'
// Providers - AI provider implementations (powered by Vercel AI SDK)
export {
  // AI SDK Backend
  AISDKBackend,
  type AISDKConfig,
  type AISDKProviderType,
  // Base class
  BaseProvider,
  // Provider implementations
  ClaudeProvider,
  // Types
  type ClaudeProviderConfig,
  createAISDKBackend,
  GeminiProvider,
  type GeminiProviderConfig,
  OpenAIProvider,
  type OpenAIProviderConfig,
  type Provider,
  type ProviderBackend,
  type ProviderConfig,
  type ProviderFactory,
  type ProviderResponse,
  providerFactory,
  type StreamableProvider,
  type StructuredProvider,
} from './providers'
// Runtime - Unified execution layer
export {
  AgentExecutor,
  type Budget,
  type BudgetTracker,
  type BudgetUsage,
  createAgentExecutor,
  createNoopContext,
  createRunContext,
  type ExecutorConfig,
  type ExecutorResult,
  type ExecutorResultMetadata,
  type RunContext,
  type RunContextOptions,
  type RunHandle,
  type Runnable,
  type RuntimeSession,
  type TraceEvent,
  type TraceEventType,
  type TraceSink,
} from './runtime'
// Session - Session-based logging and cost tracking
export {
  createNoopLogger,
  DEFAULT_SESSION_CONFIG,
  decodeTime,
  estimateCost,
  estimateCostAsync,
  isValidUlid,
  NoopSessionLogger,
  preloadPricing,
  type SessionConfig,
  type SessionDetails,
  type SessionEvent,
  type SessionIndexEntry,
  type SessionListOptions,
  SessionLogger,
  type SessionLoggerInstance,
  type SessionLoggerOptions,
  SessionManager,
  type SessionMetadata,
  type SessionUsageSummary,
  sessionManager,
  ulid,
} from './session'
// Skills - AgentSkills support for debate participants
export {
  isValidSkillFrontmatter,
  SKILL_CONSTRAINTS,
  SKILL_PATHS,
  type Skill,
  type SkillDiscoveryResult,
  type SkillFrontmatter,
  SkillLoader,
  type SkillLoaderConfig,
  type SkillMetadata,
  type SkillMetadataFields,
  SkillNotFoundError,
  type SkillResources,
  type SkillSource,
  type SkillValidationError,
  type SkillWarning,
  validateSkillFrontmatter,
} from './skills'
// Tools - For custom tool development (optional)
// Built-in tools are available via Provider config:
//   ClaudeProvider: enabledTools: ['WebSearch']
//   OpenAIProvider: enableWebSearch: true
export { createDebateTools, type DebateToolsConfig } from './tools'
// Utils - Logger and utilities
export { createLogger, Logger, logger } from './utils/logger'
