/**
 * OpenCode-Compatible Anthropic Provider
 *
 * OpenCode의 opencode-anthropic-auth 플러그인과 동일한 방식으로
 * Vercel AI SDK와 함께 사용할 수 있는 custom fetch wrapper를 제공합니다.
 *
 * 핵심:
 * - Bearer 토큰 인증 (x-api-key 제거)
 * - 필수 beta 헤더 병합
 * - 토큰 자동 갱신
 * - Claude Code 시스템 프롬프트 헤더 자동 주입
 */

import { createAnthropic } from '@ai-sdk/anthropic'
import { isTokenExpired, loadProviderTokens, saveProviderTokens } from './storage.ts'
import type { OAuthTokens, TokenResponse } from './types.ts'
import {
  ANTHROPIC_OAUTH_CONFIG,
  calculateRetryDelay,
  MAX_REFRESH_RETRIES,
  parseOAuthErrorPayload,
  TokenRefreshError,
} from './types.ts'

// ============================================================================
// OpenCode와 동일한 상수
// ============================================================================

// OpenCode 버전 정보 (opencode-anthropic-auth와 동일)
export const VERSION = '1.0.0'
export const CHANNEL = 'latest'
export const CLIENT = 'cli'

// OpenCode와 동일한 User-Agent 포맷
export const USER_AGENT = `opencode/${CHANNEL}/${VERSION}/${CLIENT}`

// OpenCode에서 사용하는 필수 beta 헤더
const REQUIRED_BETAS = [
  'oauth-2025-04-20',
  'claude-code-20250219',
  'interleaved-thinking-2025-05-14',
  'fine-grained-tool-streaming-2025-05-14',
  'web-search-2025-03-05',
]

// ============================================================================
// Claude Code 시스템 프롬프트 헤더 (핵심!)
// ============================================================================

/**
 * Claude Code API 인증을 위한 필수 시스템 프롬프트 헤더
 *
 * 이 문구가 시스템 프롬프트의 첫 부분에 포함되어야 OAuth 토큰이 작동합니다.
 * OpenCode의 anthropic_spoof.txt와 동일합니다.
 */
export const CLAUDE_CODE_HEADER = "You are Claude Code, Anthropic's official CLI for Claude."

// ============================================================================
// 토큰 갱신 (OpenCode와 동일)
// ============================================================================

async function refreshToken(currentRefreshToken: string): Promise<OAuthTokens> {
  let lastError: TokenRefreshError | undefined

  for (let attempt = 0; attempt <= MAX_REFRESH_RETRIES; attempt++) {
    try {
      const response = await fetch(ANTHROPIC_OAUTH_CONFIG.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: currentRefreshToken,
          client_id: ANTHROPIC_OAUTH_CONFIG.clientId,
        }),
      })

      if (response.ok) {
        const data = (await response.json()) as TokenResponse
        const tokens: OAuthTokens = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + data.expires_in * 1000,
          tokenType: data.token_type,
          scope: data.scope,
        }
        await saveProviderTokens('anthropic', tokens)
        return tokens
      }

      const responseBody = await response.text().catch(() => undefined)
      const parsed = parseOAuthErrorPayload(responseBody)

      lastError = new TokenRefreshError({
        message: parsed.description || `Token refresh failed: ${response.status}`,
        code: parsed.code,
        description: parsed.description,
        status: response.status,
        statusText: response.statusText,
        responseBody,
      })

      if (lastError.isInvalidGrant || !lastError.isRetryable) {
        throw lastError
      }

      if (attempt < MAX_REFRESH_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, calculateRetryDelay(attempt)))
      }
    } catch (error) {
      if (error instanceof TokenRefreshError) throw error

      lastError = new TokenRefreshError({
        message: error instanceof Error ? error.message : 'Network error',
        status: 0,
        statusText: 'Network Error',
      })

      if (attempt < MAX_REFRESH_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, calculateRetryDelay(attempt)))
      }
    }
  }

  throw (
    lastError ||
    new TokenRefreshError({
      message: 'Token refresh failed after all retries',
      status: 0,
      statusText: 'Max Retries Exceeded',
    })
  )
}

// ============================================================================
// Custom Fetch Wrapper (opencode-anthropic-auth와 동일)
// ============================================================================

/**
 * OpenCode의 opencode-anthropic-auth 플러그인과 동일한 fetch wrapper
 *
 * 주요 기능:
 * 1. Bearer 토큰 인증
 * 2. x-api-key 헤더 제거
 * 3. 필수 beta 헤더 병합
 * 4. 토큰 만료 시 자동 갱신
 * 5. Claude Code 시스템 프롬프트 헤더 자동 주입
 *
 * @param options.injectClaudeCodeHeader - 시스템 프롬프트에 Claude Code 헤더 자동 추가 (기본값: true)
 */
export function createAuthenticatedFetch(options?: {
  injectClaudeCodeHeader?: boolean
}): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  const { injectClaudeCodeHeader = true } = options || {}
  let hasRefreshedFor401 = false

  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    let tokens = await loadProviderTokens('anthropic')

    if (!tokens) {
      throw new Error('Not authenticated. Run login first.')
    }

    if (isTokenExpired(tokens)) {
      tokens = await refreshToken(tokens.refreshToken)
      hasRefreshedFor401 = false
    }

    const executeRequest = async (currentTokens: OAuthTokens): Promise<Response> => {
      const existingHeaders = init?.headers || {}
      const headersObj: Record<string, string> = {}

      if (existingHeaders instanceof Headers) {
        existingHeaders.forEach((value, key) => {
          headersObj[key.toLowerCase()] = value
        })
      } else if (Array.isArray(existingHeaders)) {
        for (const entry of existingHeaders) {
          const key = entry[0]
          const value = entry[1]
          if (key && typeof value === 'string') {
            headersObj[key.toLowerCase()] = value
          }
        }
      } else {
        for (const [key, value] of Object.entries(existingHeaders)) {
          if (typeof value === 'string') {
            headersObj[key.toLowerCase()] = value
          }
        }
      }

      const incomingBetas = headersObj['anthropic-beta'] || ''
      const incomingBetasList = incomingBetas ? incomingBetas.split(',').map((b: string) => b.trim()) : []
      const mergedBetas = [...new Set([...REQUIRED_BETAS, ...incomingBetasList])].join(',')

      const finalHeaders: Record<string, string> = {
        ...headersObj,
        authorization: `Bearer ${currentTokens.accessToken}`,
        'anthropic-beta': mergedBetas,
        'user-agent': USER_AGENT,
      }

      delete finalHeaders['x-api-key']

      let finalBody = init?.body
      if (injectClaudeCodeHeader && init?.body) {
        try {
          const bodyStr =
            typeof init.body === 'string'
              ? init.body
              : init.body instanceof Uint8Array
                ? new TextDecoder().decode(init.body)
                : null

          if (bodyStr) {
            const bodyObj = JSON.parse(bodyStr)

            if (bodyObj.system === undefined) {
              bodyObj.system = [{ type: 'text', text: CLAUDE_CODE_HEADER }]
            } else if (typeof bodyObj.system === 'string') {
              const existingText = bodyObj.system
              bodyObj.system = [
                { type: 'text', text: CLAUDE_CODE_HEADER },
                { type: 'text', text: existingText },
              ]
            } else if (Array.isArray(bodyObj.system)) {
              const firstItem = bodyObj.system[0]
              const isExactHeader = firstItem?.type === 'text' && firstItem?.text === CLAUDE_CODE_HEADER
              if (!isExactHeader) {
                bodyObj.system = [{ type: 'text', text: CLAUDE_CODE_HEADER }, ...bodyObj.system]
              }
            }

            finalBody = JSON.stringify(bodyObj)
          }
        } catch {
          // JSON 파싱 실패 시 원본 body 유지
        }
      }

      return fetch(input, {
        ...init,
        body: finalBody,
        headers: finalHeaders,
      })
    }

    const response = await executeRequest(tokens)

    if (response.status === 401 && !hasRefreshedFor401) {
      hasRefreshedFor401 = true
      try {
        tokens = await refreshToken(tokens.refreshToken)
        return executeRequest(tokens)
      } catch (error) {
        if (error instanceof TokenRefreshError && error.isInvalidGrant) {
          return new Response(
            JSON.stringify({
              error: { message: 'Token has been revoked', type: 'token_revoked', code: 'invalid_grant' },
            }),
            { status: 401, statusText: 'Unauthorized', headers: { 'Content-Type': 'application/json' } },
          )
        }
        throw error
      }
    }

    return response
  }
}

// ============================================================================
// Vercel AI SDK Provider (OpenCode와 동일)
// ============================================================================

/**
 * OpenCode와 동일한 방식으로 설정된 Anthropic Provider
 *
 * 사용법:
 * ```ts
 * import { createOAuthAnthropicProvider } from "@obora/core";
 *
 * const anthropic = await createOAuthAnthropicProvider();
 * const model = anthropic("claude-sonnet-4-20250514");
 *
 * const result = await streamText({
 *   model,
 *   messages: [...],
 * });
 * ```
 */
export async function createOAuthAnthropicProvider() {
  const customFetch = createAuthenticatedFetch()

  return createAnthropic({
    // apiKey는 빈 문자열 (custom fetch에서 Bearer 토큰 사용)
    apiKey: '',
    // OpenCode와 동일한 custom fetch
    fetch: customFetch as typeof fetch,
  })
}

/**
 * Provider 정보 (디버깅용)
 */
export function getProviderInfo() {
  return {
    userAgent: USER_AGENT,
    version: VERSION,
    channel: CHANNEL,
    client: CLIENT,
    requiredBetas: REQUIRED_BETAS,
    claudeCodeHeader: CLAUDE_CODE_HEADER,
  }
}

/**
 * 시스템 프롬프트에 Claude Code 헤더 추가 (수동 사용용)
 *
 * @example
 * ```ts
 * const systemPrompt = withClaudeCodeHeader("You are a helpful assistant.");
 * // => "You are Claude Code, Anthropic's official CLI for Claude.\n\nYou are a helpful assistant."
 * ```
 */
export function withClaudeCodeHeader(systemPrompt?: string): string {
  if (!systemPrompt) {
    return CLAUDE_CODE_HEADER
  }
  if (systemPrompt.includes(CLAUDE_CODE_HEADER)) {
    return systemPrompt
  }
  return `${CLAUDE_CODE_HEADER}\n\n${systemPrompt}`
}
