/**
 * Anthropic OAuth 인증
 *
 * Claude Pro/Max 구독을 사용하여 API에 접근합니다.
 * OpenCode의 구현을 참고하여 작성되었습니다.
 */

import { generatePKCEChallenge } from './pkce.ts'
import { refreshWithRetry } from './refresh.ts'
import { deleteProviderTokens, isTokenExpired, loadProviderTokens, saveProviderTokens } from './storage.ts'
import type { OAuthTokens, PKCEChallenge, TokenResponse } from './types.ts'
import {
  ANTHROPIC_CONSOLE_OAUTH_CONFIG,
  ANTHROPIC_OAUTH_CONFIG,
  ANTHROPIC_REDIRECT_URI,
  TokenRefreshError,
} from './types.ts'

// ============================================================================
// 상수
// ============================================================================

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_API_VERSION = '2023-06-01'
// OpenCode에서 사용하는 beta 헤더 (전체 목록)
const ANTHROPIC_BETA_HEADER =
  'oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14'

// ============================================================================
// OAuth 플로우
// ============================================================================

export type AuthMode = 'max' | 'console'

export interface AuthorizationResult {
  authorizationUrl: string
  state: string
  pkce: PKCEChallenge
  redirectUri: string
  mode: AuthMode
}

/**
 * OAuth 인증 URL 생성
 *
 * console.anthropic.com 콜백 페이지를 사용하여 코드를 표시합니다.
 * 사용자가 코드를 복사하여 터미널에 붙여넣습니다.
 *
 * @param mode - "max" (claude.ai, Claude Pro/Max) 또는 "console" (API 키 생성)
 */
export async function createAuthorizationUrl(mode: AuthMode = 'max'): Promise<AuthorizationResult> {
  const config = mode === 'console' ? ANTHROPIC_CONSOLE_OAUTH_CONFIG : ANTHROPIC_OAUTH_CONFIG
  const pkce = await generatePKCEChallenge()
  // OpenCode 방식: state = pkce.codeVerifier (동일한 값 사용)
  const state = pkce.codeVerifier

  const url = new URL(config.authorizationUrl)
  // OpenCode 방식: code=true 파라미터 추가
  url.searchParams.set('code', 'true')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', ANTHROPIC_REDIRECT_URI)
  url.searchParams.set('scope', config.scopes.join(' '))
  url.searchParams.set('code_challenge', pkce.codeChallenge)
  url.searchParams.set('code_challenge_method', pkce.codeChallengeMethod)
  url.searchParams.set('state', state)

  return {
    authorizationUrl: url.toString(),
    state,
    pkce,
    redirectUri: ANTHROPIC_REDIRECT_URI,
    mode,
  }
}

/**
 * 인증 코드를 토큰으로 교환
 *
 * OpenCode 방식: code#state 형식에서 state 추출
 *
 * @param fullCode - 전체 코드 (code#state 형식) 또는 코드만
 * @param codeVerifier - PKCE 코드 검증자
 */
export async function exchangeCodeForTokens(fullCode: string, codeVerifier: string): Promise<OAuthTokens> {
  const config = ANTHROPIC_OAUTH_CONFIG

  // OpenCode 플러그인과 동일하게 code#state 파싱
  const splits = fullCode.split('#')
  const code = splits[0]
  const state = splits[1] || codeVerifier // state가 없으면 verifier 사용

  // OpenCode와 동일한 필드 순서
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code,
      state,
      grant_type: 'authorization_code',
      client_id: config.clientId,
      redirect_uri: ANTHROPIC_REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  })

  const responseText = await response.text()

  if (!response.ok) {
    let errorMessage = `Token exchange failed (${response.status})`
    try {
      const errorData = JSON.parse(responseText)
      if (errorData.error) {
        const errType = typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error)
        const errDesc = errorData.error_description || ''
        errorMessage = `Token exchange failed: ${errType} - ${errDesc}`
      } else {
        errorMessage += `: ${responseText.slice(0, 500)}`
      }
    } catch {
      errorMessage += `: ${responseText.slice(0, 500)}`
    }
    throw new Error(errorMessage)
  }

  let data: TokenResponse
  try {
    data = JSON.parse(responseText) as TokenResponse
  } catch {
    throw new Error(`Invalid token response: ${responseText.slice(0, 500)}`)
  }

  const tokens: OAuthTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type,
    scope: data.scope,
  }

  // 토큰 저장
  await saveProviderTokens('anthropic', tokens)

  return tokens
}

export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const config = ANTHROPIC_OAUTH_CONFIG
  const tokens = await refreshWithRetry({
    tokenUrl: config.tokenUrl,
    contentType: 'json',
    body: {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
    },
    providerName: 'Anthropic',
  })
  await saveProviderTokens('anthropic', tokens)
  return tokens
}

// ============================================================================
// 토큰 관리
// ============================================================================

export async function getValidAccessToken(): Promise<string> {
  const tokens = await loadProviderTokens('anthropic')

  if (!tokens) {
    throw new Error("Not authenticated with Anthropic. Run 'obora auth login' first.")
  }

  if (isTokenExpired(tokens)) {
    try {
      const newTokens = await refreshAccessToken(tokens.refreshToken)
      return newTokens.accessToken
    } catch (error) {
      if (error instanceof TokenRefreshError && error.isInvalidGrant) {
        await deleteProviderTokens('anthropic')
        throw new Error("Token has been revoked. Please run 'obora auth login' again.")
      }
      throw error
    }
  }

  return tokens.accessToken
}

/**
 * 현재 인증 상태 확인
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    await getValidAccessToken()
    return true
  } catch {
    return false
  }
}

/**
 * 로그아웃 (토큰 삭제)
 */
export async function logout(): Promise<void> {
  await deleteProviderTokens('anthropic')
}

// ============================================================================
// API 호출 헬퍼
// ============================================================================

export interface AnthropicRequestOptions {
  model?: string
  maxTokens?: number
  systemPrompt?: string
  temperature?: number
  stream?: boolean
}

/**
 * Anthropic API 호출을 위한 헤더 생성
 *
 * OpenCode와 동일한 헤더 구성:
 * - AI SDK User-Agent 포함
 * - x-api-key 없음 (Bearer 토큰만 사용)
 */
export async function createAnthropicHeaders(): Promise<Headers> {
  const accessToken = await getValidAccessToken()

  const headers = new Headers({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'anthropic-version': ANTHROPIC_API_VERSION,
    'anthropic-beta': ANTHROPIC_BETA_HEADER,
    // AI SDK와 동일한 User-Agent 서픽스
    'User-Agent': 'ai-sdk/anthropic/2.0.56',
  })

  // x-api-key는 절대 포함하지 않음! OAuth는 Bearer 토큰만 사용

  return headers
}

/**
 * Anthropic API URL
 */
export function getAnthropicApiUrl(): string {
  return ANTHROPIC_API_URL
}

/**
 * 기본 모델
 */
export function getDefaultModel(): string {
  return 'claude-sonnet-4-20250514'
}
