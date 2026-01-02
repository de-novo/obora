import { getValidOpenAIAccessToken, loadProviderTokens } from '../auth'
import type { ProviderBackend, ProviderConfig, ProviderResponse } from './types'

const CHATGPT_BASE_URL = 'https://chatgpt.com/backend-api'
const CODEX_RESPONSES_PATH = '/codex/responses'

const DEFAULT_MODEL = 'gpt-5.2-codex'

interface ChatGPTInputItem {
  type: 'message'
  role: 'user' | 'assistant' | 'developer'
  content: { type: 'input_text'; text: string }[]
}

interface ChatGPTRequest {
  model: string
  input: ChatGPTInputItem[]
  instructions: string
  store: boolean
  stream: boolean
  reasoning?: { effort: string; summary: string }
  include?: string[]
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

let cachedInstructions: Record<string, string> = {}
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

async function transformToChatGPTFormat(prompt: string, model: string): Promise<ChatGPTRequest> {
  const instructions = await getCodexInstructions(model)

  return {
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
}

async function parseSSEResponse(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''
  let result = ''

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
          result += parsed.delta || ''
        }

        if (parsed.type === 'response.output_item.done' && parsed.item?.content?.[0]?.text) {
          result = parsed.item.content[0].text
        }

        if (parsed.type === 'response.done' && parsed.response?.output) {
          for (const item of parsed.response.output) {
            if (item.type === 'message' && item.content) {
              for (const content of item.content) {
                if (content.type === 'output_text' && content.text) {
                  result = content.text
                }
              }
            }
          }
        }
      } catch {}
    }
  }

  return result
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

    const content = await parseSSEResponse(response)

    return {
      content,
      metadata: {
        model: modelId,
        latencyMs: Date.now() - startTime,
        backend: 'oauth',
      },
    }
  }

  async *stream(prompt: string, config: ProviderConfig): AsyncGenerator<{ chunk: string; done: boolean }> {
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
        } catch {}
      }
    }

    yield { chunk: '', done: true }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const tokens = await loadProviderTokens('openai')
      return !!tokens
    } catch {
      return false
    }
  }
}
