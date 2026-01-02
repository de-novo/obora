import type { Provider, ProviderBackend, ProviderConfig, ProviderResponse } from './types'

/**
 * Abstract base class for AI providers
 *
 * Supports multiple backends (CLI, API) with automatic fallback:
 * 1. If apiKey provided and not forceCLI → use API
 * 2. Otherwise → use CLI
 *
 * Subclasses implement specific backends.
 */
export abstract class BaseProvider implements Provider {
  abstract readonly name: string
  protected config: ProviderConfig
  protected backends: Map<string, ProviderBackend> = new Map()

  constructor(config: ProviderConfig = {}) {
    this.config = config
  }

  /**
   * Register a backend (CLI or API)
   */
  protected registerBackend(backend: ProviderBackend): void {
    this.backends.set(backend.type, backend)
  }

  /**
   * Get the appropriate backend based on config
   */
  protected async getBackend(): Promise<ProviderBackend> {
    // If API key provided and not forcing CLI, try API first
    if (this.config.apiKey && !this.config.forceCLI) {
      const apiBackend = this.backends.get('api')
      if (apiBackend && (await apiBackend.isAvailable())) {
        return apiBackend
      }
    }

    // Fallback to CLI
    const cliBackend = this.backends.get('cli')
    if (cliBackend && (await cliBackend.isAvailable())) {
      return cliBackend
    }

    throw new Error(`No available backend for provider: ${this.name}`)
  }

  async run(prompt: string): Promise<ProviderResponse> {
    const backend = await this.getBackend()
    return backend.execute(prompt, this.config)
  }

  async isAvailable(): Promise<boolean> {
    for (const backend of this.backends.values()) {
      if (await backend.isAvailable()) {
        return true
      }
    }
    return false
  }

  /**
   * Get current backend type being used
   */
  async getCurrentBackendType(): Promise<'cli' | 'api' | 'oauth' | null> {
    try {
      const backend = await this.getBackend()
      return backend.type
    } catch {
      return null
    }
  }

  protected getTimeout(): number {
    return this.config.timeout ?? 120000 // 2 minutes default
  }
}
