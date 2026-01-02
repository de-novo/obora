import { getValidGoogleAccessToken, loadProviderTokens } from '../auth'
import type { ProviderBackend, ProviderConfig, ProviderResponse } from './types'

const CODE_ASSIST_ENDPOINTS = [
  'https://daily-cloudcode-pa.sandbox.googleapis.com',
  'https://autopush-cloudcode-pa.sandbox.googleapis.com',
  'https://cloudcode-pa.googleapis.com',
] as const

const CODE_ASSIST_HEADERS = {
  'User-Agent': 'antigravity/1.11.5 darwin/arm64',
  'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
  'Client-Metadata': '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
}

const DEFAULT_MODEL = 'gemini-3-flash-preview'

interface LoadCodeAssistResponse {
  cloudaicompanionProject?: string
  currentTier?: { id?: string }
  allowedTiers?: { id: string; isDefault?: boolean }[]
}

interface OnboardUserResponse {
  done?: boolean
  response?: {
    cloudaicompanionProject?: { id?: string }
  }
}

interface GoogleSearchTool {
  googleSearch: Record<string, never>
}

interface AntigravityRequest {
  project: string
  model: string
  userAgent: string
  requestId: string
  request: {
    contents: { role: string; parts: { text: string }[] }[]
    generationConfig?: { temperature?: number; maxOutputTokens?: number }
    sessionId?: string
    tools?: GoogleSearchTool[]
  }
}

interface AntigravityResponse {
  response?: {
    candidates?: {
      content: { parts: { text: string }[]; role: string }
      finishReason: string
    }[]
    usageMetadata?: {
      promptTokenCount: number
      candidatesTokenCount: number
      totalTokenCount: number
    }
  }
  error?: { code: number; message: string; status: string }
}

let cachedProjectId: string | null = null
let sessionId: string | null = null

function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function getSessionId(): string {
  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  }
  return sessionId
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function onboardFreeUser(accessToken: string): Promise<string | undefined> {
  const metadata = {
    ideType: 'IDE_UNSPECIFIED',
    platform: 'PLATFORM_UNSPECIFIED',
    pluginType: 'GEMINI',
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    for (const endpoint of CODE_ASSIST_ENDPOINTS) {
      try {
        const response = await fetch(`${endpoint}/v1internal:onboardUser`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            ...CODE_ASSIST_HEADERS,
          },
          body: JSON.stringify({ tierId: 'FREE', metadata }),
        })

        if (!response.ok) continue

        const data = (await response.json()) as OnboardUserResponse
        if (data.done && data.response?.cloudaicompanionProject?.id) {
          return data.response.cloudaicompanionProject.id
        }
        if (data.done) break
      } catch {
        continue
      }
    }
    await sleep(3000)
  }
  return undefined
}

async function discoverProjectId(accessToken: string): Promise<string> {
  if (cachedProjectId) return cachedProjectId

  for (const endpoint of CODE_ASSIST_ENDPOINTS) {
    try {
      const response = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...CODE_ASSIST_HEADERS,
        },
        body: JSON.stringify({
          metadata: {
            ideType: 'IDE_UNSPECIFIED',
            platform: 'PLATFORM_UNSPECIFIED',
            pluginType: 'ANTIGRAVITY',
          },
        }),
      })

      if (!response.ok) continue

      const data = (await response.json()) as LoadCodeAssistResponse

      if (data.cloudaicompanionProject) {
        cachedProjectId = data.cloudaicompanionProject
        return cachedProjectId
      }

      const currentTierId = data.currentTier?.id
      if (!currentTierId || currentTierId === 'FREE') {
        const managedProjectId = await onboardFreeUser(accessToken)
        if (managedProjectId) {
          cachedProjectId = managedProjectId
          return cachedProjectId
        }
      }
    } catch {
      continue
    }
  }

  throw new Error('Failed to discover or create Antigravity project. Ensure your Google account has access.')
}

function createAntigravityRequest(
  projectId: string,
  model: string,
  prompt: string,
  enableWebSearch = false,
): AntigravityRequest {
  const request: AntigravityRequest = {
    project: projectId,
    model,
    userAgent: 'antigravity',
    requestId: generateRequestId(),
    request: {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
      sessionId: getSessionId(),
    },
  }

  if (enableWebSearch) {
    request.request.tools = [{ googleSearch: {} }]
  }

  return request
}

async function generateContent(
  accessToken: string,
  projectId: string,
  model: string,
  prompt: string,
  enableWebSearch = false,
): Promise<AntigravityResponse> {
  const request = createAntigravityRequest(projectId, model, prompt, enableWebSearch)

  for (const endpoint of CODE_ASSIST_ENDPOINTS) {
    try {
      const response = await fetch(`${endpoint}/v1internal:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...CODE_ASSIST_HEADERS,
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const errorText = await response.text()
        if (response.status === 404 || response.status === 503) continue
        throw new Error(`Antigravity API error (${response.status}): ${errorText}`)
      }

      return (await response.json()) as AntigravityResponse
    } catch (e) {
      if (e instanceof Error && e.message.includes('Antigravity API error')) throw e
      continue
    }
  }

  throw new Error('All Antigravity endpoints failed')
}

export class AntigravityBackend implements ProviderBackend {
  readonly type = 'oauth' as const

  async execute(prompt: string, config: ProviderConfig): Promise<ProviderResponse> {
    const startTime = Date.now()
    const modelId = config.model || DEFAULT_MODEL

    const enableWebSearch = (config as { enabledTools?: string[] }).enabledTools?.includes('google_web_search') ?? false

    const accessToken = await getValidGoogleAccessToken()
    const projectId = await discoverProjectId(accessToken)

    const data = await generateContent(accessToken, projectId, modelId, prompt, enableWebSearch)

    if (data.error) {
      throw new Error(`Antigravity error: ${data.error.message}`)
    }

    const content = data.response?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || ''

    return {
      content,
      metadata: {
        model: modelId,
        latencyMs: Date.now() - startTime,
        backend: 'oauth',
        tokensUsed: data.response?.usageMetadata?.totalTokenCount,
      },
    }
  }

  async *stream(prompt: string, config: ProviderConfig): AsyncGenerator<{ chunk: string; done: boolean }> {
    const modelId = config.model || DEFAULT_MODEL

    const accessToken = await getValidGoogleAccessToken()
    const projectId = await discoverProjectId(accessToken)

    const request = createAntigravityRequest(projectId, modelId, prompt)

    let response: Response | null = null

    for (const endpoint of CODE_ASSIST_ENDPOINTS) {
      try {
        response = await fetch(`${endpoint}/v1internal:streamGenerateContent?alt=sse`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            ...CODE_ASSIST_HEADERS,
          },
          body: JSON.stringify(request),
        })

        if (response.ok) break
      } catch {
        continue
      }
    }

    if (!response?.ok) {
      throw new Error('All Antigravity streaming endpoints failed')
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
        const jsonData = line.slice(6).trim()
        if (!jsonData || jsonData === '[DONE]') continue

        try {
          const parsed = JSON.parse(jsonData) as AntigravityResponse
          const text = parsed.response?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || ''
          if (text) {
            yield { chunk: text, done: false }
          }
        } catch {}
      }
    }

    yield { chunk: '', done: true }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const tokens = await loadProviderTokens('google')
      return !!tokens
    } catch {
      return false
    }
  }
}
