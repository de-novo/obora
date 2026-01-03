/**
 * OAuth 인증 관련 타입 정의
 */

// ============================================================================
// OAuth 토큰
// ============================================================================

/**
 * OAuth 토큰 정보
 */
export interface OAuthTokens {
  /** 액세스 토큰 */
  accessToken: string
  /** 리프레시 토큰 */
  refreshToken: string
  /** 만료 시간 (Unix timestamp, ms) */
  expiresAt: number
  /** 토큰 타입 (보통 "Bearer") */
  tokenType?: string
  /** 스코프 */
  scope?: string
}

/**
 * 프로바이더별 인증 정보
 */
export interface AuthCredentials {
  anthropic?: OAuthTokens
  google?: OAuthTokens
  openai?: OAuthTokens
}

// ============================================================================
// OAuth 설정
// ============================================================================

/**
 * OAuth 프로바이더 설정
 */
export interface OAuthProviderConfig {
  /** 프로바이더 이름 */
  name: string
  /** Client ID */
  clientId: string
  /** Authorization URL */
  authorizationUrl: string
  /** Token URL */
  tokenUrl: string
  /** 스코프 */
  scopes: string[]
  /** 리다이렉트 URI 포트 범위 */
  redirectPortRange: [number, number]
}

/**
 * Anthropic OAuth 설정
 *
 * OpenCode의 구현을 참고:
 * - 인증: claude.ai
 * - 토큰 교환: console.anthropic.com
 * - 리다이렉트: console.anthropic.com 콜백 페이지 사용
 */
export const ANTHROPIC_OAUTH_CONFIG: OAuthProviderConfig = {
  name: 'anthropic',
  // OpenCode에서 사용하는 public client ID
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  // Claude Pro/Max 직접 사용
  authorizationUrl: 'https://claude.ai/oauth/authorize',
  tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
  scopes: ['org:create_api_key', 'user:profile', 'user:inference'],
  // 리다이렉트는 Anthropic 콜백 페이지 사용 (코드 복사 방식)
  redirectPortRange: [49152, 65535],
}

/**
 * Console OAuth 설정 (API 키 생성용)
 */
export const ANTHROPIC_CONSOLE_OAUTH_CONFIG: OAuthProviderConfig = {
  name: 'anthropic-console',
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  // Console을 통한 API 키 생성
  authorizationUrl: 'https://console.anthropic.com/oauth/authorize',
  tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
  scopes: ['org:create_api_key', 'user:profile', 'user:inference'],
  redirectPortRange: [49152, 65535],
}

export const ANTHROPIC_REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback'

export const OPENAI_OAUTH_CONFIG: OAuthProviderConfig = {
  name: 'openai',
  clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
  authorizationUrl: 'https://auth.openai.com/oauth/authorize',
  tokenUrl: 'https://auth.openai.com/oauth/token',
  scopes: ['openid', 'profile', 'email', 'offline_access'],
  redirectPortRange: [1455, 1455],
}

export const OPENAI_REDIRECT_URI = 'http://localhost:1455/auth/callback'

export const GOOGLE_OAUTH_CONFIG: OAuthProviderConfig = {
  name: 'google',
  clientId: '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com',
  authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/cclog',
    'https://www.googleapis.com/auth/experimentsandconfigs',
  ],
  redirectPortRange: [36742, 36742],
}

export const GOOGLE_CLIENT_SECRET = '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'
export const GOOGLE_REDIRECT_URI = 'http://localhost:36742/oauth-callback'

// ============================================================================
// PKCE
// ============================================================================

/**
 * PKCE 챌린지 데이터
 */
export interface PKCEChallenge {
  /** 코드 검증자 (랜덤 문자열) */
  codeVerifier: string
  /** 코드 챌린지 (SHA256 해시) */
  codeChallenge: string
  /** 챌린지 메서드 */
  codeChallengeMethod: 'S256'
}

// ============================================================================
// OAuth 응답
// ============================================================================

/**
 * 토큰 응답
 */
export interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope?: string
}

/**
 * OAuth 에러 응답
 */
export interface OAuthError {
  error: string | { status?: string; code?: string }
  error_description?: string
}

// ============================================================================
// 토큰 리프레시 상수 및 에러
// ============================================================================

/** 토큰 만료 버퍼 (만료 60초 전에 리프레시) */
export const TOKEN_REFRESH_BUFFER_MS = 60_000

/** 최대 리프레시 재시도 횟수 */
export const MAX_REFRESH_RETRIES = 3

/** 초기 재시도 지연 시간 (ms) */
export const INITIAL_RETRY_DELAY_MS = 1000

/**
 * 토큰 리프레시 에러
 *
 * oh-my-opencode의 AntigravityTokenRefreshError와 동일한 패턴
 */
export class TokenRefreshError extends Error {
  /** OAuth 에러 코드 (e.g., "invalid_grant") */
  code?: string
  /** 에러 설명 */
  description?: string
  /** HTTP 상태 코드 */
  status: number
  /** HTTP 상태 텍스트 */
  statusText: string
  /** 응답 본문 */
  responseBody?: string

  constructor(options: {
    message: string
    code?: string
    description?: string
    status: number
    statusText: string
    responseBody?: string
  }) {
    super(options.message)
    this.name = 'TokenRefreshError'
    this.code = options.code
    this.description = options.description
    this.status = options.status
    this.statusText = options.statusText
    this.responseBody = options.responseBody
  }

  /** 토큰이 폐기되었는지 (재인증 필요) */
  get isInvalidGrant(): boolean {
    return this.code === 'invalid_grant'
  }

  /** 네트워크 에러인지 */
  get isNetworkError(): boolean {
    return this.status === 0
  }

  /** 재시도 가능한 에러인지 (네트워크 에러, 429, 5xx) */
  get isRetryable(): boolean {
    if (this.status === 0) return true
    if (this.status === 429) return true
    if (this.status >= 500 && this.status < 600) return true
    return false
  }
}

/**
 * 재시도 지연 시간 계산 (exponential backoff)
 */
export function calculateRetryDelay(attempt: number): number {
  return Math.min(INITIAL_RETRY_DELAY_MS * 2 ** attempt, 10000)
}

/**
 * OAuth 에러 응답 파싱
 */
export function parseOAuthErrorPayload(text: string | undefined): {
  code?: string
  description?: string
} {
  if (!text) {
    return {}
  }

  try {
    const payload = JSON.parse(text) as OAuthError
    let code: string | undefined

    if (typeof payload.error === 'string') {
      code = payload.error
    } else if (payload.error && typeof payload.error === 'object') {
      code = payload.error.status ?? payload.error.code
    }

    return {
      code,
      description: payload.error_description,
    }
  } catch {
    return { description: text }
  }
}

// ============================================================================
// 인증 상태
// ============================================================================

/**
 * 인증 상태
 */
export type AuthStatus = 'authenticated' | 'expired' | 'not_authenticated'

/**
 * 프로바이더 인증 상태
 */
export interface ProviderAuthStatus {
  provider: string
  status: AuthStatus
  expiresAt?: number
  email?: string
}

// ============================================================================
// Multi-Account Management
// ============================================================================

export type QuotaKey = 'claude' | 'gemini-antigravity' | 'gemini-cli'
export type ModelFamily = 'claude' | 'gemini'
export type HeaderStyle = 'antigravity' | 'gemini-cli'
export type SwitchReason = 'rate-limit' | 'initial' | 'rotation'

export interface ManagedAccount {
  index: number
  email?: string
  addedAt: number
  lastUsed: number
  refreshToken: string
  projectId?: string
  accessToken?: string
  expiresAt?: number
  rateLimitResetTimes: Partial<Record<QuotaKey, number>>
  lastSwitchReason?: SwitchReason
}

export interface AccountStorageData {
  version: number
  accounts: Array<{
    email?: string
    refreshToken: string
    projectId?: string
    addedAt: number
    lastUsed: number
    rateLimitResetTimes?: Partial<Record<QuotaKey, number>>
    lastSwitchReason?: SwitchReason
  }>
  activeIndex: number
  activeIndexByFamily: Record<ModelFamily, number>
}

export const MAX_ACCOUNTS = 10
export const DEFAULT_RATE_LIMIT_MS = 60_000
