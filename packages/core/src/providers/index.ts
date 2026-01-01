/**
 * Providers Module
 *
 * Re-exports all provider implementations and types.
 * Now powered by Vercel AI SDK for unified API access.
 */

// AI SDK Backend (unified API)
export {
  AISDKBackend,
  type AISDKConfig,
  type AISDKProviderType,
  createAISDKBackend,
} from './ai-sdk'

// Base class
export { BaseProvider } from './BaseProvider'
// Provider implementations
export { ClaudeProvider, type ClaudeProviderConfig } from './claude'
export { GeminiProvider, type GeminiProviderConfig } from './gemini'
export { OpenAIProvider, type OpenAIProviderConfig } from './openai'
// Types
export type {
  Provider,
  ProviderBackend,
  ProviderConfig,
  ProviderFactory,
  ProviderResponse,
  StreamableProvider,
  StructuredProvider,
} from './types'

import { ClaudeProvider } from './claude'
import { GeminiProvider } from './gemini'
import { OpenAIProvider } from './openai'
// Provider factory for dynamic creation
import type { Provider, ProviderConfig, ProviderFactory } from './types'

const providers = new Map<string, new (config?: ProviderConfig) => Provider>([
  ['claude', ClaudeProvider],
  ['anthropic', ClaudeProvider], // Alias
  ['openai', OpenAIProvider],
  ['gemini', GeminiProvider],
  ['google', GeminiProvider], // Alias
])

export const providerFactory: ProviderFactory = {
  create(name: string, config?: ProviderConfig): Provider {
    const ProviderClass = providers.get(name)
    if (!ProviderClass) {
      throw new Error(`Unknown provider: ${name}. Available: ${[...providers.keys()].join(', ')}`)
    }
    return new ProviderClass(config)
  },

  register(name: string, provider: new (config?: ProviderConfig) => Provider): void {
    providers.set(name, provider)
  },

  list(): string[] {
    return [...providers.keys()]
  },
}
