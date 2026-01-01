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
} from './engine';

// Providers - AI provider implementations (powered by Vercel AI SDK)
export {
  // AI SDK Backend
  AISDKBackend,
  createAISDKBackend,
  type AISDKConfig,
  type AISDKProviderType,
  // Base class
  BaseProvider,
  // Provider implementations
  ClaudeProvider,
  GeminiProvider,
  OpenAIProvider,
  providerFactory,
  // Types
  type ClaudeProviderConfig,
  type GeminiProviderConfig,
  type OpenAIProviderConfig,
  type Provider,
  type ProviderBackend,
  type ProviderConfig,
  type ProviderFactory,
  type ProviderResponse,
  type StructuredProvider,
} from './providers';

// Config - Configuration management
export {
  DEFAULT_CONFIG,
  getDefaultConfig,
  loadConfig,
  loadConfigFromEnv,
  loadConfigFromFile,
  type AIName,
  type ConfigLoaderOptions,
  type OboraConfig,
  type ProviderSettings,
} from './config';

// Auth - OAuth for Claude Pro/Max (optional)
export * from './auth';
