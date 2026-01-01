/**
 * Provider Types
 *
 * Defines interfaces for AI provider implementations.
 * Designed for extensibility with support for:
 * - CLI backends (claude, codex, gemini CLI tools)
 * - API backends (direct API calls via Vercel AI SDK)
 * - Streaming responses
 * - Structured JSON output
 *
 * @packageDocumentation
 * @module providers/types
 */

/**
 * Response from an AI provider.
 *
 * @example
 * ```typescript
 * const response: ProviderResponse = {
 *   content: 'I recommend Option A because...',
 *   metadata: {
 *     model: 'claude-sonnet-4-20250514',
 *     tokensUsed: 1234,
 *     latencyMs: 2500,
 *     backend: 'api'
 *   }
 * }
 * ```
 */
export interface ProviderResponse {
  /** The AI's response text */
  content: string
  /** Raw response from the underlying API (for debugging) */
  raw?: unknown
  /** Response metadata */
  metadata?: {
    /** Model used for generation */
    model?: string
    /** Total tokens consumed */
    tokensUsed?: number
    /** Response latency in milliseconds */
    latencyMs?: number
    /** Which backend was used */
    backend?: 'cli' | 'api'
  }
}

/**
 * Configuration for AI providers.
 *
 * Providers automatically select the best available backend:
 * 1. API backend if apiKey is provided
 * 2. CLI backend if CLI tool is installed
 *
 * @example
 * ```typescript
 * // Use API with key
 * const apiConfig: ProviderConfig = {
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 *   model: 'claude-sonnet-4-20250514'
 * }
 *
 * // Force CLI mode
 * const cliConfig: ProviderConfig = {
 *   forceCLI: true
 * }
 * ```
 */
export interface ProviderConfig {
  /** API key for direct API calls */
  apiKey?: string
  /** Model to use (provider-specific) */
  model?: string
  /** Force CLI mode even if API key is available */
  forceCLI?: boolean
  /** Request timeout in milliseconds */
  timeout?: number
  /** Base URL for API (for self-hosted or proxy) */
  baseUrl?: string
}

/**
 * Core provider interface.
 *
 * All AI providers must implement this interface.
 * Providers handle the details of communicating with different AI services.
 *
 * @example Implementing a custom provider
 * ```typescript
 * class MyProvider implements Provider {
 *   readonly name = 'my-ai'
 *
 *   async run(prompt: string): Promise<ProviderResponse> {
 *     const response = await myAiApi.generate(prompt)
 *     return { content: response.text }
 *   }
 *
 *   async isAvailable(): Promise<boolean> {
 *     return !!process.env.MY_AI_KEY
 *   }
 * }
 * ```
 */
export interface Provider {
  /** Unique identifier for this provider */
  readonly name: string
  /**
   * Generate a response to the given prompt.
   * @param prompt - The input prompt
   * @returns The AI's response
   */
  run(prompt: string): Promise<ProviderResponse>
  /**
   * Check if this provider is available (CLI installed or API key set).
   * @returns True if the provider can be used
   */
  isAvailable(): Promise<boolean>
}

/**
 * Provider that supports streaming responses.
 *
 * Enables real-time output as the AI generates text.
 * Essential for CLI applications and live UI updates.
 *
 * @example
 * ```typescript
 * const provider: StreamableProvider = new ClaudeProvider()
 *
 * for await (const { chunk, done } of provider.stream('Hello')) {
 *   if (!done) {
 *     process.stdout.write(chunk)
 *   }
 * }
 * ```
 */
export interface StreamableProvider extends Provider {
  /**
   * Stream a response to the given prompt.
   * @param prompt - The input prompt
   * @yields Chunks of text as they are generated
   */
  stream(prompt: string): AsyncGenerator<{ chunk: string; done: boolean }>
}

/**
 * Provider that supports structured JSON output.
 *
 * Useful for extracting specific data from AI responses.
 *
 * @example
 * ```typescript
 * interface Analysis {
 *   sentiment: 'positive' | 'negative' | 'neutral'
 *   confidence: number
 * }
 *
 * const result = await provider.runStructured<Analysis>(
 *   'Analyze: "Great product!"',
 *   { type: 'object', properties: { sentiment: {...}, confidence: {...} } }
 * )
 * console.log(result.sentiment) // 'positive'
 * ```
 */
export interface StructuredProvider extends Provider {
  /**
   * Generate a structured response matching the given schema.
   * @param prompt - The input prompt
   * @param schema - JSON schema for the expected output
   * @returns Parsed response matching the schema
   */
  runStructured<T>(prompt: string, schema: object): Promise<T>
}

/**
 * Backend implementation for executing prompts.
 *
 * Backends handle the low-level communication with AI services.
 * Each provider can have multiple backends (CLI, API).
 *
 * @example
 * ```typescript
 * class CLIBackend implements ProviderBackend {
 *   readonly type = 'cli'
 *
 *   async execute(prompt: string, config: ProviderConfig) {
 *     const result = await $`claude -p ${prompt}`
 *     return { content: result.stdout.toString() }
 *   }
 *
 *   async isAvailable() {
 *     return commandExists('claude')
 *   }
 * }
 * ```
 */
export interface ProviderBackend {
  /** Backend type identifier */
  readonly type: 'cli' | 'api'
  /**
   * Execute a prompt and return the response.
   * @param prompt - The input prompt
   * @param config - Provider configuration
   * @returns The AI's response
   */
  execute(prompt: string, config: ProviderConfig): Promise<ProviderResponse>
  /**
   * Execute a prompt and return structured output.
   * @param prompt - The input prompt
   * @param schema - JSON schema for the expected output
   * @param config - Provider configuration
   * @returns Parsed response matching the schema
   */
  executeStructured?<T>(prompt: string, schema: object, config: ProviderConfig): Promise<T>
  /**
   * Check if this backend is available.
   * @returns True if the backend can be used
   */
  isAvailable(): Promise<boolean>
}

/**
 * Factory for creating provider instances.
 *
 * Enables dynamic provider creation and registration.
 *
 * @example
 * ```typescript
 * // Create provider by name
 * const claude = factory.create('claude')
 *
 * // Register custom provider
 * factory.register('my-ai', MyAIProvider)
 *
 * // List available providers
 * console.log(factory.list()) // ['claude', 'openai', 'gemini', 'my-ai']
 * ```
 */
export interface ProviderFactory {
  /**
   * Create a provider instance by name.
   * @param name - Provider name
   * @param config - Optional configuration
   * @returns Provider instance
   */
  create(name: string, config?: ProviderConfig): Provider
  /**
   * Register a new provider type.
   * @param name - Provider name
   * @param provider - Provider class constructor
   */
  register(name: string, provider: new (config?: ProviderConfig) => Provider): void
  /**
   * List all registered provider names.
   * @returns Array of provider names
   */
  list(): string[]
}
