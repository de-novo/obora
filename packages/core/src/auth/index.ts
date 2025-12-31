/**
 * OAuth 인증 모듈
 *
 * Claude Pro/Max 구독을 API로 직접 사용할 수 있도록 합니다.
 */

// Types
export type {
  OAuthTokens,
  AuthCredentials,
  OAuthProviderConfig,
  PKCEChallenge,
  TokenResponse,
  OAuthError,
  AuthStatus,
  ProviderAuthStatus,
} from "./types.ts";

export { ANTHROPIC_OAUTH_CONFIG, ANTHROPIC_REDIRECT_URI } from "./types.ts";

// PKCE
export {
  generateCodeVerifier,
  generateCodeChallenge,
  generatePKCEChallenge,
  generateState,
} from "./pkce.ts";

// Storage
export {
  loadCredentials,
  saveCredentials,
  loadProviderTokens,
  saveProviderTokens,
  deleteProviderTokens,
  isTokenExpired,
  getAuthPath,
} from "./storage.ts";

// Anthropic OAuth
export {
  createAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getValidAccessToken,
  isAuthenticated,
  logout,
  createAnthropicHeaders,
  getAnthropicApiUrl,
  getDefaultModel,
  type AuthorizationResult,
  type AnthropicRequestOptions,
  type AuthMode,
} from "./anthropic.ts";

// OAuth Server
export {
  startCallbackServer,
  findAvailablePort,
  type CallbackResult,
} from "./oauth-server.ts";

// OpenCode-Compatible Provider
export {
  createAuthenticatedFetch,
  createOAuthAnthropicProvider,
  getProviderInfo,
  withClaudeCodeHeader,
  USER_AGENT,
  VERSION,
  CHANNEL,
  CLIENT,
  CLAUDE_CODE_HEADER,
} from "./provider.ts";

// ============================================================================
// 편의 함수: 전체 로그인 플로우
// ============================================================================

import { createAuthorizationUrl, exchangeCodeForTokens, type AuthMode } from "./anthropic.ts";
import { ANTHROPIC_REDIRECT_URI } from "./types.ts";

/**
 * 대화형 OAuth 로그인 수행 (코드 복사/붙여넣기 방식)
 *
 * 1. 브라우저에서 인증 URL 열기
 * 2. 사용자가 인증 후 표시되는 코드를 복사
 * 3. 터미널에 코드 붙여넣기
 * 4. 토큰 교환 및 저장
 *
 * @param mode - "max" (claude.ai, Claude Pro/Max) 또는 "console" (API 키 생성)
 */
export async function performInteractiveLogin(mode: AuthMode = "max"): Promise<void> {
  // 1. 인증 URL 생성
  const { authorizationUrl, pkce } = await createAuthorizationUrl(mode);

  // 2. 브라우저 열기
  const modeDesc = mode === "console"
    ? "Anthropic Console (API Key generation)"
    : "Claude.ai (Pro/Max subscription)";
  console.log(`\n🔐 Opening browser for ${modeDesc} authentication...\n`);
  console.log("After authorizing, you'll see a code on the page.");
  console.log("Copy that code and paste it below.\n");
  console.log(`If browser doesn't open, visit:\n${authorizationUrl}\n`);

  // 플랫폼별 브라우저 열기
  const openCommand =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";

  try {
    Bun.spawn([openCommand, authorizationUrl]);
  } catch {
    // 브라우저 열기 실패해도 URL은 출력됨
  }

  // 3. 코드 입력 받기
  process.stdout.write("Enter the authorization code: ");

  const code = await new Promise<string>((resolve) => {
    let input = "";
    process.stdin.setRawMode?.(false);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const onData = (chunk: string) => {
      input += chunk;
      if (input.includes("\n")) {
        process.stdin.removeListener("data", onData);
        process.stdin.pause();
        resolve(input.trim());
      }
    };

    process.stdin.on("data", onData);
  });

  if (!code) {
    throw new Error("No authorization code provided");
  }

  // 4. 토큰 교환 (OpenCode 방식: 전체 코드 전달, 내부에서 #state 파싱)
  console.log("\nExchanging authorization code for tokens...\n");
  await exchangeCodeForTokens(code.trim(), pkce.codeVerifier);

  console.log(`✅ Successfully authenticated with ${modeDesc}!\n`);
}
