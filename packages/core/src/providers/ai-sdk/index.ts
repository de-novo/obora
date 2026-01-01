/**
 * AI SDK Backend
 *
 * Unified backend using Vercel AI SDK for all providers.
 * Supports streaming, structured output, and tool calls.
 */

import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, type LanguageModel, streamText } from 'ai'
import type { ProviderBackend, ProviderConfig, ProviderResponse } from '../types'

/**
 * Supported AI SDK providers
 */
export type AISDKProviderType = 'anthropic' | 'openai' | 'google'

/**
 * Provider factory type
 */
type ProviderFactory = (options?: { apiKey?: string; baseURL?: string }) => (modelId: string) => LanguageModel

/**
 * Provider factory registry
 */
const PROVIDER_FACTORIES: Record<AISDKProviderType, ProviderFactory> = {
  anthropic: createAnthropic as ProviderFactory,
  openai: createOpenAI as ProviderFactory,
  google: createGoogleGenerativeAI as ProviderFactory,
}

/**
 * Default models for each provider
 * (Latest models with best price-performance ratio - January 2026)
 *
 * @see https://models.dev for latest model info
 */
const DEFAULT_MODELS: Record<AISDKProviderType, string> = {
  anthropic: 'claude-sonnet-4-5-20250929', // Claude Sonnet 4.5 - $3/$15 per 1M tokens
  openai: 'gpt-5.2', // GPT-5.2 Thinking - $1.75/$14 per 1M tokens
  google: 'gemini-3-flash', // Gemini 3 Flash - $0.50/$3 per 1M tokens (best value!)
}

export interface AISDKConfig extends ProviderConfig {
  providerType: AISDKProviderType
}

/**
 * AI SDK Backend Implementation
 *
 * Uses Vercel AI SDK for unified API access across providers.
 */
export class AISDKBackend implements ProviderBackend {
  readonly type = 'api' as const
  private providerType: AISDKProviderType
  private sdk: (modelId: string) => LanguageModel

  constructor(providerType: AISDKProviderType, config: ProviderConfig) {
    this.providerType = providerType
    const factory = PROVIDER_FACTORIES[providerType]

    this.sdk = factory({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    })
  }

  /**
   * Execute a prompt and return the response
   */
  async execute(prompt: string, config: ProviderConfig): Promise<ProviderResponse> {
    const startTime = Date.now()
    const modelId = config.model || DEFAULT_MODELS[this.providerType]

    const { text, usage, response } = await generateText({
      model: this.sdk(modelId),
      messages: [{ role: 'user', content: prompt }],
    })

    return {
      content: text,
      raw: response,
      metadata: {
        model: modelId,
        tokensUsed: usage?.totalTokens,
        latencyMs: Date.now() - startTime,
        backend: 'api',
      },
    }
  }

  /**
   * Stream a response (returns async generator)
   */
  async *stream(prompt: string, config: ProviderConfig): AsyncGenerator<{ chunk: string; done: boolean }> {
    const modelId = config.model || DEFAULT_MODELS[this.providerType]

    const result = streamText({
      model: this.sdk(modelId),
      messages: [{ role: 'user', content: prompt }],
    })

    for await (const chunk of result.textStream) {
      yield { chunk, done: false }
    }

    yield { chunk: '', done: true }
  }

  /**
   * Execute with structured output (JSON schema)
   */
  async executeStructured<T>(prompt: string, schema: object, config: ProviderConfig): Promise<T> {
    // AI SDK structured output requires zod schema
    // For now, use regular generation with JSON instruction
    const modelId = config.model || DEFAULT_MODELS[this.providerType]

    const { text } = await generateText({
      model: this.sdk(modelId),
      messages: [
        {
          role: 'user',
          content: `${prompt}\n\nRespond ONLY with valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}`,
        },
      ],
    })

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from response')
    }

    return JSON.parse(jsonMatch[0]) as T
  }

  /**
   * Check if SDK is available
   */
  async isAvailable(): Promise<boolean> {
    return true // SDK is always available if installed
  }

  /**
   * Get the underlying language model for advanced usage
   */
  getModel(modelId?: string): LanguageModel {
    return this.sdk(modelId || DEFAULT_MODELS[this.providerType])
  }
}

/**
 * Create an AI SDK backend for a specific provider
 */
export function createAISDKBackend(providerType: AISDKProviderType, config: ProviderConfig): AISDKBackend {
  return new AISDKBackend(providerType, config)
}
