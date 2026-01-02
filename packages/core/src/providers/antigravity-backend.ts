import { getValidGoogleAccessToken, loadProviderTokens } from '../auth'
import type { ProviderBackend, ProviderConfig, ProviderResponse } from './types'

const CODE_ASSIST_ENDPOINTS = [
  'https://daily-cloudcode-pa.sandbox.googleapis.com',
  'https://autopush-cloudcode-pa.sandbox.googleapis.com',
  'https://cloudcode-pa.googleapis.com',
] as const

const CODE_ASSIST_HEADERS = {
  'User-Agent': 'google-api-nodejs-client/9.15.1',
  'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
  'Client-Metadata': '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
}

const DEFAULT_MODEL = 'gemini-3-flash-preview'

// Default Project ID (fallback when all discovery methods fail)
// From oh-my-opencode reference implementation
const ANTIGRAVITY_DEFAULT_PROJECT_ID = 'rising-fact-p41fc'

// Onboard retry configuration (oh-my-opencode uses 10 attempts with 5s delay)
const ONBOARD_MAX_ATTEMPTS = 10
const ONBOARD_DELAY_MS = 5000

interface LoadCodeAssistResponse {
  cloudaicompanionProject?: string
  currentTier?: { id?: string }
  allowedTiers?: { id: string; isDefault?: boolean }[]
  gcpManaged?: boolean
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

// Content types for thoughtSignature injection (from oh-my-opencode)
interface ContentPart {
  text?: string
  functionCall?: Record<string, unknown>
  thoughtSignature?: string
}

interface ContentBlock {
  role?: string
  parts: ContentPart[]
}

// Skip thought signature validator constant
// This allows requests without proper thought signatures to pass through
const SKIP_THOUGHT_SIGNATURE_VALIDATOR = 'skip_thought_signature_validator'

/**
 * Injects thoughtSignature into function call parts.
 * The Antigravity API requires thoughtSignature in functionCall parts.
 * Without it, requests fail with validation errors.
 */
function injectThoughtSignatureIntoFunctionCalls(
  body: Record<string, unknown>,
  signature?: string,
): Record<string, unknown> {
  const effectiveSignature = signature || SKIP_THOUGHT_SIGNATURE_VALIDATOR

  const contents = body.contents as ContentBlock[] | undefined
  if (!contents || !Array.isArray(contents)) {
    return body
  }

  const modifiedContents = contents.map((content) => {
    if (!content.parts || !Array.isArray(content.parts)) {
      return content
    }

    const modifiedParts = content.parts.map((part) => {
      if (part.functionCall && !part.thoughtSignature) {
        return { ...part, thoughtSignature: effectiveSignature }
      }
      return part
    })

    return { ...content, parts: modifiedParts }
  })

  return { ...body, contents: modifiedContents }
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

async function isSubscriptionRequiredError(response: Response): Promise<boolean> {
  if (response.status !== 403) return false
  try {
    const text = await response.clone().text()
    return text.includes('SUBSCRIPTION_REQUIRED') || text.includes('Gemini Code Assist license')
  } catch {
    return false
  }
}

async function onboardFreeUser(accessToken: string): Promise<string | undefined> {
  const metadata = {
    ideType: 'IDE_UNSPECIFIED',
    platform: 'PLATFORM_UNSPECIFIED',
    pluginType: 'GEMINI',
  }

  for (let attempt = 0; attempt < ONBOARD_MAX_ATTEMPTS; attempt++) {
    console.log(`[Antigravity] Onboard attempt ${attempt + 1}/${ONBOARD_MAX_ATTEMPTS}`)
    for (const endpoint of CODE_ASSIST_ENDPOINTS) {
      try {
        const response = await fetch(`${endpoint}/v1internal:onboardUser`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            ...CODE_ASSIST_HEADERS,
          },
          body: JSON.stringify({ tierId: 'free-tier', metadata }),
        })

        if (!response.ok) {
          const errorBody = await response.text()
          console.log(`[Antigravity] Onboard ${endpoint} returned ${response.status}: ${errorBody}`)
          continue
        }

        const data = (await response.json()) as OnboardUserResponse
        console.log(`[Antigravity] Onboard response:`, JSON.stringify(data, null, 2))

        if (data.done && data.response?.cloudaicompanionProject?.id) {
          return data.response.cloudaicompanionProject.id
        }
        if (data.done) {
          console.log('[Antigravity] Onboard done but no project ID')
          break
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e)
        console.log(`[Antigravity] Onboard ${endpoint} error: ${errorMsg}`)
      }
    }
    await sleep(ONBOARD_DELAY_MS)
  }
  return undefined
}

async function discoverProjectId(accessToken: string): Promise<string> {
  if (cachedProjectId) return cachedProjectId

  const errors: string[] = []

  for (const endpoint of CODE_ASSIST_ENDPOINTS) {
    try {
      console.log(`[Antigravity] Trying endpoint: ${endpoint}`)
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
            pluginType: 'GEMINI',
          },
        }),
      })

      if (await isSubscriptionRequiredError(response)) {
        console.log(`[Antigravity] ${endpoint} returned SUBSCRIPTION_REQUIRED, trying next endpoint`)
        errors.push(`${endpoint}: SUBSCRIPTION_REQUIRED`)
        continue
      }

      if (!response.ok) {
        const errorBody = await response.text()
        console.log(`[Antigravity] ${endpoint} returned ${response.status}: ${errorBody}`)
        errors.push(`${endpoint}: HTTP ${response.status} - ${errorBody}`)
        continue
      }

      const data = (await response.json()) as LoadCodeAssistResponse
      console.log(`[Antigravity] ${endpoint} response:`, JSON.stringify(data, null, 2))

      const currentTierId = data.currentTier?.id
      const isFreeTier = !currentTierId || currentTierId === 'FREE' || currentTierId === 'free-tier'
      console.log(
        `[Antigravity] Current tier: ${currentTierId}, isFreeTier: ${isFreeTier}, gcpManaged: ${data.gcpManaged}`,
      )

      if (isFreeTier) {
        console.log('[Antigravity] Free tier detected, attempting onboard...')
        const managedProjectId = await onboardFreeUser(accessToken)
        if (managedProjectId) {
          cachedProjectId = managedProjectId
          console.log(`[Antigravity] Onboarded with project: ${cachedProjectId}`)
          return cachedProjectId
        }
        console.log('[Antigravity] Onboarding returned no project')

        if (data.cloudaicompanionProject) {
          cachedProjectId = data.cloudaicompanionProject
          console.log(`[Antigravity] Falling back to existing project: ${cachedProjectId}`)
          return cachedProjectId
        }
      } else if (data.cloudaicompanionProject) {
        cachedProjectId = data.cloudaicompanionProject
        console.log(`[Antigravity] Found project: ${cachedProjectId}`)
        return cachedProjectId
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      console.log(`[Antigravity] ${endpoint} error: ${errorMsg}`)
      errors.push(`${endpoint}: ${errorMsg}`)
    }
  }

  console.log(
    `[Antigravity] All endpoints failed, using default project ID: ${ANTIGRAVITY_DEFAULT_PROJECT_ID}\n` +
      `Errors:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
  )
  cachedProjectId = ANTIGRAVITY_DEFAULT_PROJECT_ID
  return cachedProjectId
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
  // Inject thoughtSignature to satisfy Antigravity API validation
  const requestWithSignature = injectThoughtSignatureIntoFunctionCalls(request as unknown as Record<string, unknown>)
  console.log(`[Antigravity] Calling generateContent with project: ${projectId}`)

  for (const endpoint of CODE_ASSIST_ENDPOINTS) {
    try {
      const response = await fetch(`${endpoint}/v1internal:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...CODE_ASSIST_HEADERS,
        },
        body: JSON.stringify(requestWithSignature),
      })

      if (!response.ok) {
        const errorText = await response.text()
        if (response.status === 404 || response.status === 503) continue
        if (response.status === 403 && errorText.includes('SUBSCRIPTION_REQUIRED')) {
          throw new Error('SUBSCRIPTION_REQUIRED')
        }
        throw new Error(`Antigravity API error (${response.status}): ${errorText}`)
      }

      return (await response.json()) as AntigravityResponse
    } catch (e) {
      if (e instanceof Error && e.message.includes('Antigravity API error')) throw e
      if (e instanceof Error && e.message === 'SUBSCRIPTION_REQUIRED') throw e
    }
  }

  throw new Error('All Antigravity endpoints failed')
}

async function generateContentWithFallback(
  accessToken: string,
  projectId: string,
  model: string,
  prompt: string,
  enableWebSearch = false,
): Promise<AntigravityResponse> {
  try {
    return await generateContent(accessToken, projectId, model, prompt, enableWebSearch)
  } catch (e) {
    if (e instanceof Error && e.message === 'SUBSCRIPTION_REQUIRED') {
      if (projectId !== ANTIGRAVITY_DEFAULT_PROJECT_ID) {
        console.log(`[Antigravity] Project ${projectId} requires subscription, trying default project...`)
        cachedProjectId = ANTIGRAVITY_DEFAULT_PROJECT_ID
        try {
          return await generateContent(accessToken, ANTIGRAVITY_DEFAULT_PROJECT_ID, model, prompt, enableWebSearch)
        } catch (fallbackError) {
          if (fallbackError instanceof Error && fallbackError.message === 'SUBSCRIPTION_REQUIRED') {
            throw new Error(
              'Gemini Code Assist subscription required.\n' +
                'Your Google account does not have access to Gemini Code Assist.\n' +
                'Please visit https://codeassist.google.com/upgrade to set up your account.',
            )
          }
          throw fallbackError
        }
      }
      throw new Error(
        'Gemini Code Assist subscription required.\n' +
          'Your Google account does not have access to Gemini Code Assist.\n' +
          'Please visit https://codeassist.google.com/upgrade to set up your account.',
      )
    }
    throw e
  }
}

export class AntigravityBackend implements ProviderBackend {
  readonly type = 'oauth' as const

  async execute(prompt: string, config: ProviderConfig): Promise<ProviderResponse> {
    const startTime = Date.now()
    const modelId = config.model || DEFAULT_MODEL

    const enableWebSearch = (config as { enabledTools?: string[] }).enabledTools?.includes('google_web_search') ?? false

    const accessToken = await getValidGoogleAccessToken()
    const projectId = await discoverProjectId(accessToken)

    const data = await generateContentWithFallback(accessToken, projectId, modelId, prompt, enableWebSearch)

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
    let projectId = await discoverProjectId(accessToken)

    const tryStream = async (project: string): Promise<Response | null> => {
      const request = createAntigravityRequest(project, modelId, prompt)
      // Inject thoughtSignature to satisfy Antigravity API validation
      const requestWithSignature = injectThoughtSignatureIntoFunctionCalls(
        request as unknown as Record<string, unknown>,
      )
      for (const endpoint of CODE_ASSIST_ENDPOINTS) {
        try {
          const response = await fetch(`${endpoint}/v1internal:streamGenerateContent?alt=sse`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
              ...CODE_ASSIST_HEADERS,
            },
            body: JSON.stringify(requestWithSignature),
          })

          if (response.ok) return response
          if (response.status === 403) {
            const text = await response.text()
            if (text.includes('SUBSCRIPTION_REQUIRED')) {
              return null
            }
          }
        } catch {}
      }
      return null
    }

    let response = await tryStream(projectId)

    if (!response && projectId !== ANTIGRAVITY_DEFAULT_PROJECT_ID) {
      console.log(
        `[Antigravity] Project ${projectId} requires subscription, falling back to default project for streaming`,
      )
      cachedProjectId = ANTIGRAVITY_DEFAULT_PROJECT_ID
      projectId = ANTIGRAVITY_DEFAULT_PROJECT_ID
      response = await tryStream(projectId)
    }

    if (!response) {
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
