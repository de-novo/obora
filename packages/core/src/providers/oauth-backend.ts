import type { Tool } from 'ai'
import { generateText, stepCountIs, streamText } from 'ai'
import {
  CLAUDE_CODE_HEADER,
  createAuthenticatedFetch,
  createOAuthAnthropicProvider,
  getValidGoogleAccessToken,
  isAuthenticated,
  isGoogleAuthenticated,
  isOpenAIAuthenticated,
} from '../auth'
import { ChatGPTBackend } from './chatgpt-backend'
import type { ProviderBackend, ProviderConfig, ProviderResponse, ToolEnabledResponse } from './types'

interface WebSearchTool {
  type: 'web_search_20250305'
  name: 'web_search'
  max_uses?: number
}

interface WebSearchResult {
  type: 'web_search_result'
  title: string
  url: string
  encrypted_content: string
  page_age?: string
}

interface ServerToolUseBlock {
  type: 'server_tool_use'
  id: string
  name: string
  input: { query: string }
}

interface WebSearchToolResultBlock {
  type: 'web_search_tool_result'
  tool_use_id: string
  content: WebSearchResult[]
}

interface TextBlock {
  type: 'text'
  text: string
}

type ContentBlock = TextBlock | ServerToolUseBlock | WebSearchToolResultBlock

interface AnthropicResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: ContentBlock[]
  model: string
  stop_reason: string
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

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

  async runWithTools(
    prompt: string,
    tools: Record<string, Tool>,
    config: ProviderConfig,
  ): Promise<ToolEnabledResponse> {
    if (this.providerType === 'openai' && this.chatgptBackend) {
      return this.chatgptBackend.runWithTools(prompt, tools, config)
    }

    const startTime = Date.now()
    const modelId = config.model || DEFAULT_MODELS[this.providerType]
    const model = await this.getModel(modelId)

    const { text, toolResults, usage } = await generateText({
      model,
      messages: [{ role: 'user', content: prompt }],
      tools,
      stopWhen: stepCountIs(5),
    })

    return {
      content: text,
      toolCalls: toolResults?.map((tr) => ({
        toolName: tr.toolName,
        args: tr.input as Record<string, unknown>,
        result: tr.output,
      })),
      metadata: {
        model: modelId,
        tokensUsed: usage?.totalTokens,
        latencyMs: Date.now() - startTime,
        backend: 'oauth',
      },
    }
  }

  async runWithWebSearch(prompt: string, config: ProviderConfig): Promise<ToolEnabledResponse> {
    if (this.providerType !== 'anthropic') {
      throw new Error('WebSearch is only available for Anthropic provider')
    }

    const startTime = Date.now()
    const modelId = config.model || DEFAULT_MODELS.anthropic
    const authenticatedFetch = createAuthenticatedFetch()

    const requestBody = {
      model: modelId,
      max_tokens: 8096,
      system: [{ type: 'text', text: CLAUDE_CODE_HEADER }],
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        } as WebSearchTool,
      ],
      messages: [{ role: 'user', content: prompt }],
    }

    const response = await authenticatedFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Anthropic API error: ${response.status} ${errorText}`)
    }

    const data = (await response.json()) as AnthropicResponse

    const textBlocks = data.content.filter((block): block is TextBlock => block.type === 'text')
    const searchBlocks = data.content.filter((block): block is ServerToolUseBlock => block.type === 'server_tool_use')
    const resultBlocks = data.content.filter(
      (block): block is WebSearchToolResultBlock => block.type === 'web_search_tool_result',
    )

    const toolCalls = searchBlocks.map((search, idx) => ({
      toolName: 'web_search',
      args: search.input,
      result: resultBlocks[idx]?.content || [],
    }))

    return {
      content: textBlocks.map((b) => b.text).join('\n'),
      toolCalls,
      metadata: {
        model: modelId,
        tokensUsed: data.usage.input_tokens + data.usage.output_tokens,
        latencyMs: Date.now() - startTime,
        backend: 'oauth',
      },
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
