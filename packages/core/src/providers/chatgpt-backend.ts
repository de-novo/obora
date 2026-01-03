import type { Tool } from 'ai'
import { getValidOpenAIAccessToken, loadProviderTokens } from '../auth'
import type { ProviderBackend, ProviderConfig, ProviderResponse, ToolCallResult, ToolEnabledResponse } from './types'

const CHATGPT_BASE_URL = 'https://chatgpt.com/backend-api'
const CODEX_RESPONSES_PATH = '/codex/responses'

const DEFAULT_MODEL = 'gpt-5.2-codex'
const MAX_TOOL_ITERATIONS = 5

interface ChatGPTInputItem {
  type: 'message' | 'function_call' | 'function_call_output'
  role?: 'user' | 'assistant' | 'developer'
  content?: { type: 'input_text'; text: string }[]
  call_id?: string
  name?: string
  arguments?: string
  output?: string
}

interface ChatGPTToolDefinition {
  type: 'function'
  name: string
  description: string
  strict: boolean
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

interface ChatGPTWebSearchTool {
  type: 'web_search_preview'
}

interface ChatGPTRequest {
  model: string
  input: ChatGPTInputItem[]
  instructions: string
  store: boolean
  stream: boolean
  tools?: (ChatGPTToolDefinition | ChatGPTWebSearchTool)[]
  tool_choice?: 'auto' | 'none' | 'required'
  reasoning?: { effort: string; summary: string }
  include?: string[]
}

interface FunctionCallEvent {
  call_id: string
  name: string
  arguments: string
}

interface ParsedSSEResult {
  text: string
  functionCalls: FunctionCallEvent[]
  done: boolean
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
}

function extractAccountIdFromToken(accessToken: string): string {
  try {
    const parts = accessToken.split('.')
    if (parts.length !== 3) throw new Error('Invalid JWT')

    const base64 = parts[1]
    if (!base64) throw new Error('Invalid JWT payload')
    const payload = JSON.parse(atob(base64))

    const authData = payload['https://api.openai.com/auth']
    if (authData?.chatgpt_account_id) return authData.chatgpt_account_id

    if (payload.chatgpt_account_id) return payload.chatgpt_account_id
    if (payload.account_id) return payload.account_id

    throw new Error('No account ID found in token')
  } catch (e) {
    throw new Error(`Failed to extract account ID: ${e}`)
  }
}

type ModelFamily = 'gpt-5.2-codex' | 'codex-max' | 'codex' | 'gpt-5.2' | 'gpt-5.1'

const PROMPT_FILES: Record<ModelFamily, string> = {
  'gpt-5.2-codex': 'gpt-5.2-codex_prompt.md',
  'codex-max': 'gpt-5.1-codex-max_prompt.md',
  codex: 'gpt_5_codex_prompt.md',
  'gpt-5.2': 'gpt_5_2_prompt.md',
  'gpt-5.1': 'gpt_5_1_prompt.md',
}

function getModelFamily(normalizedModel: string): ModelFamily {
  if (normalizedModel.includes('gpt-5.2-codex')) return 'gpt-5.2-codex'
  if (normalizedModel.includes('codex-max')) return 'codex-max'
  if (normalizedModel.includes('codex')) return 'codex'
  if (normalizedModel.includes('gpt-5.2')) return 'gpt-5.2'
  return 'gpt-5.1'
}

const cachedInstructions: Record<string, string> = {}
let cachedReleaseTag: string | null = null

async function getLatestReleaseTag(): Promise<string> {
  if (cachedReleaseTag) return cachedReleaseTag

  try {
    const response = await fetch('https://api.github.com/repos/openai/codex/releases/latest')
    if (response.ok) {
      const data = (await response.json()) as { tag_name: string }
      cachedReleaseTag = data.tag_name
      return cachedReleaseTag!
    }
  } catch {}

  return 'rust-v0.77.0'
}

async function getCodexInstructions(model: string): Promise<string> {
  const family = getModelFamily(model)

  if (cachedInstructions[family]) {
    return cachedInstructions[family]
  }

  const tag = await getLatestReleaseTag()
  const promptFile = PROMPT_FILES[family]
  const url = `https://raw.githubusercontent.com/openai/codex/${tag}/codex-rs/core/${promptFile}`

  try {
    const response = await fetch(url)
    if (response.ok) {
      const instructions = await response.text()
      cachedInstructions[family] = instructions
      return instructions
    }
  } catch {}

  const fallback = `You are Codex, based on GPT-5. You are a helpful assistant.
Be concise and accurate. Provide clear answers.`
  cachedInstructions[family] = fallback
  return fallback
}

function convertToolsToCodexFormat(tools: Record<string, Tool>): ChatGPTToolDefinition[] {
  return Object.entries(tools).map(([name, tool]) => {
    const schema = tool.inputSchema as { toJSONSchema?: () => unknown }
    const jsonSchema = schema.toJSONSchema?.() || { type: 'object', properties: {} }
    return {
      type: 'function' as const,
      name,
      description: tool.description || '',
      strict: true,
      parameters: jsonSchema as ChatGPTToolDefinition['parameters'],
    }
  })
}

async function transformToChatGPTFormat(
  prompt: string,
  model: string,
  tools?: ChatGPTToolDefinition[],
): Promise<ChatGPTRequest> {
  const instructions = await getCodexInstructions(model)

  const request: ChatGPTRequest = {
    model,
    input: [
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: prompt }],
      },
    ],
    instructions,
    store: false,
    stream: true,
    reasoning: { effort: 'medium', summary: 'auto' },
    include: ['reasoning.encrypted_content'],
  }

  if (tools && tools.length > 0) {
    request.tools = tools
    request.tool_choice = 'auto'
  }

  return request
}

async function parseSSEResponse(response: Response): Promise<ParsedSSEResult> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  const functionCalls: FunctionCallEvent[] = []
  let usage: ParsedSSEResult['usage']

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue

      try {
        const parsed = JSON.parse(data)

        if (parsed.type === 'response.output_text.delta') {
          text += parsed.delta || ''
        }

        if (parsed.type === 'response.output_item.done' && parsed.item?.content?.[0]?.text) {
          text = parsed.item.content[0].text
        }

        if (parsed.type === 'response.output_item.done' && parsed.item?.type === 'function_call') {
          functionCalls.push({
            call_id: parsed.item.call_id,
            name: parsed.item.name,
            arguments: parsed.item.arguments,
          })
        }

        if (parsed.type === 'response.done' || parsed.type === 'response.completed') {
          if (parsed.response?.output) {
            for (const item of parsed.response.output) {
              if (item.type === 'message' && item.content) {
                for (const content of item.content) {
                  if (content.type === 'output_text' && content.text) {
                    text = content.text
                  }
                }
              }
              if (item.type === 'function_call') {
                functionCalls.push({
                  call_id: item.call_id,
                  name: item.name,
                  arguments: item.arguments,
                })
              }
            }
          }
          if (parsed.response?.usage) {
            usage = {
              inputTokens: parsed.response.usage.input_tokens,
              outputTokens: parsed.response.usage.output_tokens,
              totalTokens: (parsed.response.usage.input_tokens ?? 0) + (parsed.response.usage.output_tokens ?? 0),
            }
          }
        }
      } catch {}
    }
  }

  return { text, functionCalls, done: functionCalls.length === 0, usage }
}

export class ChatGPTBackend implements ProviderBackend {
  readonly type = 'oauth' as const

  async execute(prompt: string, config: ProviderConfig): Promise<ProviderResponse> {
    const startTime = Date.now()
    const modelId = config.model || DEFAULT_MODEL

    const accessToken = await getValidOpenAIAccessToken()
    const accountId = extractAccountIdFromToken(accessToken)

    const body = await transformToChatGPTFormat(prompt, modelId)

    const response = await fetch(`${CHATGPT_BASE_URL}${CODEX_RESPONSES_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'chatgpt-account-id': accountId,
        'OpenAI-Beta': 'responses=experimental',
        originator: 'codex_cli_rs',
        accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`ChatGPT API error (${response.status}): ${errorText}`)
    }

    const result = await parseSSEResponse(response)

    return {
      content: result.text,
      metadata: {
        model: modelId,
        tokensUsed: result.usage?.totalTokens,
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        latencyMs: Date.now() - startTime,
        backend: 'oauth',
      },
    }
  }

  async *stream(
    prompt: string,
    config: ProviderConfig,
  ): AsyncGenerator<{
    chunk: string
    done: boolean
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; model?: string }
  }> {
    const modelId = config.model || DEFAULT_MODEL

    const accessToken = await getValidOpenAIAccessToken()
    const accountId = extractAccountIdFromToken(accessToken)

    const body = await transformToChatGPTFormat(prompt, modelId)

    const response = await fetch(`${CHATGPT_BASE_URL}${CODEX_RESPONSES_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'chatgpt-account-id': accountId,
        'OpenAI-Beta': 'responses=experimental',
        originator: 'codex_cli_rs',
        accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`ChatGPT API error (${response.status}): ${errorText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''
    let usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          if (parsed.type === 'response.output_text.delta' && parsed.delta) {
            yield { chunk: parsed.delta, done: false }
          }
          if ((parsed.type === 'response.done' || parsed.type === 'response.completed') && parsed.response?.usage) {
            usage = {
              inputTokens: parsed.response.usage.input_tokens,
              outputTokens: parsed.response.usage.output_tokens,
              totalTokens: (parsed.response.usage.input_tokens ?? 0) + (parsed.response.usage.output_tokens ?? 0),
            }
          }
          if (parsed.type === 'response.done' && parsed.response?.usage) {
            usage = {
              inputTokens: parsed.response.usage.input_tokens,
              outputTokens: parsed.response.usage.output_tokens,
              totalTokens: (parsed.response.usage.input_tokens ?? 0) + (parsed.response.usage.output_tokens ?? 0),
            }
          }
        } catch {}
      }
    }

    yield { chunk: '', done: true, usage: usage ? { ...usage, model: modelId } : undefined }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const tokens = await loadProviderTokens('openai')
      return !!tokens
    } catch {
      return false
    }
  }

  async runWithWebSearch(prompt: string, config: ProviderConfig): Promise<ToolEnabledResponse> {
    const startTime = Date.now()
    const modelId = config.model || 'gpt-4o'
    const accessToken = await getValidOpenAIAccessToken()

    const body = {
      model: modelId,
      input: prompt,
      tools: [{ type: 'web_search_preview' }],
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenAI Responses API error (${response.status}): ${errorText}`)
    }

    const data = (await response.json()) as { output?: { type: string; content?: { type: string; text?: string }[] }[] }
    let text = ''

    if (data.output) {
      for (const item of data.output) {
        if (item.type === 'message' && item.content) {
          for (const content of item.content) {
            if (content.type === 'output_text' && content.text) {
              text += content.text
            }
          }
        }
      }
    }

    return {
      content: text,
      toolCalls: [],
      metadata: {
        model: modelId,
        latencyMs: Date.now() - startTime,
        backend: 'oauth',
      },
    }
  }

  async runWithTools(
    prompt: string,
    tools: Record<string, Tool>,
    config: ProviderConfig,
  ): Promise<ToolEnabledResponse> {
    const startTime = Date.now()
    const modelId = config.model || DEFAULT_MODEL
    const accessToken = await getValidOpenAIAccessToken()
    const accountId = extractAccountIdFromToken(accessToken)

    const codexTools = convertToolsToCodexFormat(tools)
    const instructions = await getCodexInstructions(modelId)

    const input: ChatGPTInputItem[] = [
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: prompt }],
      },
    ]

    const allToolCalls: ToolCallResult[] = []
    let finalText = ''
    let iterations = 0

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++

      const body: ChatGPTRequest = {
        model: modelId,
        input,
        instructions,
        store: false,
        stream: true,
        tools: codexTools,
        tool_choice: 'auto',
        reasoning: { effort: 'medium', summary: 'auto' },
        include: ['reasoning.encrypted_content'],
      }

      const response = await fetch(`${CHATGPT_BASE_URL}${CODEX_RESPONSES_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'chatgpt-account-id': accountId,
          'OpenAI-Beta': 'responses=experimental',
          originator: 'codex_cli_rs',
          accept: 'text/event-stream',
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`ChatGPT API error (${response.status}): ${errorText}`)
      }

      const result = await parseSSEResponse(response)
      finalText = result.text

      if (result.done || result.functionCalls.length === 0) {
        break
      }

      for (const fc of result.functionCalls) {
        input.push({
          type: 'function_call',
          call_id: fc.call_id,
          name: fc.name,
          arguments: fc.arguments,
        })

        const tool = tools[fc.name]
        if (tool?.execute) {
          try {
            const args = JSON.parse(fc.arguments)
            const toolResult = await tool.execute(args, {
              abortSignal: undefined as unknown as AbortSignal,
              toolCallId: fc.call_id,
              messages: [],
            })

            allToolCalls.push({
              toolName: fc.name,
              args,
              result: toolResult,
            })

            input.push({
              type: 'function_call_output',
              call_id: fc.call_id,
              output: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
            })
          } catch (err) {
            input.push({
              type: 'function_call_output',
              call_id: fc.call_id,
              output: `Error: ${err instanceof Error ? err.message : String(err)}`,
            })
          }
        }
      }
    }

    return {
      content: finalText,
      toolCalls: allToolCalls,
      metadata: {
        model: modelId,
        latencyMs: Date.now() - startTime,
        backend: 'oauth',
      },
    }
  }
}
