import { generateText, streamText } from 'ai'
import {
  createOAuthAnthropicProvider,
  isAuthenticated,
  isOpenAIAuthenticated,
  isGoogleAuthenticated,
  getValidGoogleAccessToken,
} from '../auth'
import { ChatGPTBackend } from './chatgpt-backend'
import type { ProviderBackend, ProviderConfig, ProviderResponse } from './types'

type OAuthProviderType = 'anthropic' | 'openai' | 'google'

const DEFAULT_MODELS: Record<OAuthProviderType, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  google: 'gemini-2.0-flash',
}

export class OAuthBackend implements ProviderBackend {
  readonly type = 'oauth' as const
  private providerType: OAuthProviderType
  private chatgptBackend?: ChatGPTBackend

  constructor(providerType: OAuthProviderType) {
    this.providerType = providerType
    if (providerType === 'openai') {
      this.chatgptBackend = new ChatGPTBackend()
    }
  }

  async execute(prompt: string, config: ProviderConfig): Promise<ProviderResponse> {
    if (this.providerType === 'openai' && this.chatgptBackend) {
      return this.chatgptBackend.execute(prompt, config)
    }

    const startTime = Date.now()
    const modelId = config.model || DEFAULT_MODELS[this.providerType]

    const model = await this.getModel(modelId)

    const { text, usage, response } = await generateText({
      model,
      messages: [{ role: 'user', content: prompt }],
    })

    return {
      content: text,
      raw: response,
      metadata: {
        model: modelId,
        tokensUsed: usage?.totalTokens,
        latencyMs: Date.now() - startTime,
        backend: 'oauth',
      },
    }
  }

  async *stream(prompt: string, config: ProviderConfig): AsyncGenerator<{ chunk: string; done: boolean }> {
    if (this.providerType === 'openai' && this.chatgptBackend) {
      yield* this.chatgptBackend.stream(prompt, config)
      return
    }

    const modelId = config.model || DEFAULT_MODELS[this.providerType]
    const model = await this.getModel(modelId)

    const result = streamText({
      model,
      messages: [{ role: 'user', content: prompt }],
    })

    for await (const chunk of result.textStream) {
      yield { chunk, done: false }
    }

    yield { chunk: '', done: true }
  }

  async isAvailable(): Promise<boolean> {
    switch (this.providerType) {
      case 'anthropic':
        return isAuthenticated()
      case 'openai':
        return isOpenAIAuthenticated()
      case 'google':
        return isGoogleAuthenticated()
    }
  }

  private async getModel(modelId: string) {
    switch (this.providerType) {
      case 'anthropic': {
        const provider = await createOAuthAnthropicProvider()
        return provider(modelId)
      }
      case 'openai': {
        throw new Error('OpenAI uses ChatGPT Backend directly')
      }
      case 'google': {
        const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
        const token = await getValidGoogleAccessToken()
        const provider = createGoogleGenerativeAI({
          apiKey: token,
        })
        return provider(modelId)
      }
    }
  }
}

export async function isOAuthAvailable(providerType: OAuthProviderType): Promise<boolean> {
  switch (providerType) {
    case 'anthropic':
      return isAuthenticated()
    case 'openai':
      return isOpenAIAuthenticated()
    case 'google':
      return isGoogleAuthenticated()
  }
}
