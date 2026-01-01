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
  type StructuredProvider,
} from './providers'
// Tools - Fact-checking tools for AI debates
export {
  createDebateTools,
  createWebSearchTool,
  type DebateToolsConfig,
  getWebSearchProviderInfo,
  webSearch,
  type WebSearchConfig,
  type WebSearchResult,
  webSearchTool,
} from './tools'
