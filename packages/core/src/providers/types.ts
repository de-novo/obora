/**
 * Provider Types
 *
 * Designed for extensibility:
 * - Support both CLI and API backends
 * - Easy to add new providers
 * - Pluggable architecture
 */

export interface ProviderResponse {
  content: string
  raw?: unknown
  metadata?: {
    model?: string
    tokensUsed?: number
    latencyMs?: number
    backend?: 'cli' | 'api'
  }
}

export interface ProviderConfig {
  /** API key for direct API calls */
  apiKey?: string
  /** Model to use */
  model?: string
  /** Force CLI mode even if API key is available */
  forceCLI?: boolean
  /** Request timeout in ms */
  timeout?: number
  /** Base URL for API (for self-hosted or proxy) */
  baseUrl?: string
}

/**
 * Core provider interface
 */
export interface Provider {
  readonly name: string
  run(prompt: string): Promise<ProviderResponse>
  isAvailable(): Promise<boolean>
}

/**
 * Provider that supports structured JSON output
 */
export interface StructuredProvider extends Provider {
  runStructured<T>(prompt: string, schema: object): Promise<T>
}

/**
 * Backend interface for different execution methods
 */
export interface ProviderBackend {
  readonly type: 'cli' | 'api'
  execute(prompt: string, config: ProviderConfig): Promise<ProviderResponse>
  executeStructured?<T>(prompt: string, schema: object, config: ProviderConfig): Promise<T>
  isAvailable(): Promise<boolean>
}

/**
 * Provider factory for creating providers dynamically
 */
export interface ProviderFactory {
  create(name: string, config?: ProviderConfig): Provider
  register(name: string, provider: new (config?: ProviderConfig) => Provider): void
  list(): string[]
}
