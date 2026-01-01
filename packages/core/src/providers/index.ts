/**
 * Providers Module
 *
 * Re-exports all provider implementations and types.
 * Now powered by Vercel AI SDK for unified API access.
 */

// Types
export type {
  Provider,
  ProviderBackend,
  ProviderConfig,
  ProviderResponse,
  ProviderFactory,
  StructuredProvider,
} from './types';

// Base class
export { BaseProvider } from './BaseProvider';

// AI SDK Backend (unified API)
export {
  AISDKBackend,
  createAISDKBackend,
  type AISDKConfig,
  type AISDKProviderType,
} from './ai-sdk';

// Provider implementations
export { ClaudeProvider, type ClaudeProviderConfig } from './claude';
export { OpenAIProvider, type OpenAIProviderConfig } from './openai';
export { GeminiProvider, type GeminiProviderConfig } from './gemini';

// Provider factory for dynamic creation
import type { Provider, ProviderConfig, ProviderFactory } from './types';
import { ClaudeProvider } from './claude';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';

const providers = new Map<string, new (config?: ProviderConfig) => Provider>([
  ['claude', ClaudeProvider],
  ['anthropic', ClaudeProvider], // Alias
  ['openai', OpenAIProvider],
  ['gemini', GeminiProvider],
  ['google', GeminiProvider], // Alias
]);

export const providerFactory: ProviderFactory = {
  create(name: string, config?: ProviderConfig): Provider {
    const ProviderClass = providers.get(name);
    if (!ProviderClass) {
      throw new Error(`Unknown provider: ${name}. Available: ${[...providers.keys()].join(', ')}`);
    }
    return new ProviderClass(config);
  },

  register(name: string, provider: new (config?: ProviderConfig) => Provider): void {
    providers.set(name, provider);
  },

  list(): string[] {
    return [...providers.keys()];
  },
};
