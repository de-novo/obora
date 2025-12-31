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
  accessToken: string;
  /** 리프레시 토큰 */
  refreshToken: string;
  /** 만료 시간 (Unix timestamp, ms) */
  expiresAt: number;
  /** 토큰 타입 (보통 "Bearer") */
  tokenType?: string;
  /** 스코프 */
  scope?: string;
}

/**
 * 프로바이더별 인증 정보
 */
export interface AuthCredentials {
  anthropic?: OAuthTokens;
  google?: OAuthTokens;
  openai?: OAuthTokens;
}

// ============================================================================
// OAuth 설정
// ============================================================================

/**
 * OAuth 프로바이더 설정
 */
export interface OAuthProviderConfig {
  /** 프로바이더 이름 */
  name: string;
  /** Client ID */
  clientId: string;
  /** Authorization URL */
  authorizationUrl: string;
  /** Token URL */
  tokenUrl: string;
  /** 스코프 */
  scopes: string[];
  /** 리다이렉트 URI 포트 범위 */
  redirectPortRange: [number, number];
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
  name: "anthropic",
  // OpenCode에서 사용하는 public client ID
  clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  // Claude Pro/Max 직접 사용
  authorizationUrl: "https://claude.ai/oauth/authorize",
  tokenUrl: "https://console.anthropic.com/v1/oauth/token",
  scopes: ["org:create_api_key", "user:profile", "user:inference"],
  // 리다이렉트는 Anthropic 콜백 페이지 사용 (코드 복사 방식)
  redirectPortRange: [49152, 65535],
};

/**
 * Console OAuth 설정 (API 키 생성용)
 */
export const ANTHROPIC_CONSOLE_OAUTH_CONFIG: OAuthProviderConfig = {
  name: "anthropic-console",
  clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  // Console을 통한 API 키 생성
  authorizationUrl: "https://console.anthropic.com/oauth/authorize",
  tokenUrl: "https://console.anthropic.com/v1/oauth/token",
  scopes: ["org:create_api_key", "user:profile", "user:inference"],
  redirectPortRange: [49152, 65535],
};

/**
 * Anthropic OAuth 리다이렉트 URI
 * console.anthropic.com의 콜백 페이지를 사용하여 코드를 표시
 */
export const ANTHROPIC_REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";

// ============================================================================
// PKCE
// ============================================================================

/**
 * PKCE 챌린지 데이터
 */
export interface PKCEChallenge {
  /** 코드 검증자 (랜덤 문자열) */
  codeVerifier: string;
  /** 코드 챌린지 (SHA256 해시) */
  codeChallenge: string;
  /** 챌린지 메서드 */
  codeChallengeMethod: "S256";
}

// ============================================================================
// OAuth 응답
// ============================================================================

/**
 * 토큰 응답
 */
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

/**
 * OAuth 에러 응답
 */
export interface OAuthError {
  error: string;
  error_description?: string;
}

// ============================================================================
// 인증 상태
// ============================================================================

/**
 * 인증 상태
 */
export type AuthStatus = "authenticated" | "expired" | "not_authenticated";

/**
 * 프로바이더 인증 상태
 */
export interface ProviderAuthStatus {
  provider: string;
  status: AuthStatus;
  expiresAt?: number;
  email?: string;
}
