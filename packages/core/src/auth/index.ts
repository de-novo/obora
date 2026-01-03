// Anthropic OAuth
export {
  type AnthropicRequestOptions,
  type AuthMode,
  type AuthorizationResult,
  createAnthropicHeaders,
  createAuthorizationUrl,
  exchangeCodeForTokens,
  getAnthropicApiUrl,
  getDefaultModel,
  getValidAccessToken,
  isAuthenticated,
  logout,
  refreshAccessToken,
} from './anthropic.ts'
// Google OAuth
export {
  addGoogleAccount,
  createGoogleAuthorizationUrl,
  exchangeGoogleCodeForTokens,
  getGoogleAccountManager,
  getNextAvailableAccount,
  getValidGoogleAccessToken,
  type GoogleAuthorizationResult,
  isGoogleAuthenticated,
  listGoogleAccounts,
  logoutGoogle,
  markAccountRateLimited,
  performGoogleLogin,
  performGoogleLoginWithMultiAccount,
  refreshAccountToken,
  refreshGoogleAccessToken,
  removeGoogleAccount,
} from './google.ts'
// Account Manager
export { AccountManager } from './account-manager.ts'
export { clearAccounts, getAccountsPath, loadAccounts, saveAccounts } from './account-storage.ts'
// OAuth Server
export {
  type CallbackResult,
  findAvailablePort,
  startCallbackServer,
} from './oauth-server.ts'
// OpenAI OAuth
export {
  createOpenAIAuthorizationUrl,
  exchangeOpenAICodeForTokens,
  getValidOpenAIAccessToken,
  isOpenAIAuthenticated,
  logoutOpenAI,
  type OpenAIAuthorizationResult,
  performOpenAILogin,
  refreshOpenAIAccessToken,
} from './openai.ts'

// PKCE
export {
  generateCodeChallenge,
  generateCodeVerifier,
  generatePKCEChallenge,
  generateState,
} from './pkce.ts'
// OpenCode-Compatible Provider
export {
  CHANNEL,
  CLAUDE_CODE_HEADER,
  CLIENT,
  createAuthenticatedFetch,
  createOAuthAnthropicProvider,
  getProviderInfo,
  USER_AGENT,
  VERSION,
  withClaudeCodeHeader,
} from './provider.ts'
// Storage
export {
  deleteProviderTokens,
  getAuthPath,
  isTokenExpired,
  loadCredentials,
  loadProviderTokens,
  saveCredentials,
  saveProviderTokens,
} from './storage.ts'
// Types
export type {
  AccountStorageData,
  AuthCredentials,
  AuthStatus,
  HeaderStyle,
  ManagedAccount,
  ModelFamily,
  OAuthError,
  OAuthProviderConfig,
  OAuthTokens,
  PKCEChallenge,
  ProviderAuthStatus,
  QuotaKey,
  SwitchReason,
  TokenResponse,
} from './types.ts'
export {
  ANTHROPIC_OAUTH_CONFIG,
  ANTHROPIC_REDIRECT_URI,
  calculateRetryDelay,
  DEFAULT_RATE_LIMIT_MS,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_OAUTH_CONFIG,
  GOOGLE_REDIRECT_URI,
  INITIAL_RETRY_DELAY_MS,
  MAX_ACCOUNTS,
  MAX_REFRESH_RETRIES,
  OPENAI_OAUTH_CONFIG,
  OPENAI_REDIRECT_URI,
  parseOAuthErrorPayload,
  TOKEN_REFRESH_BUFFER_MS,
  TokenRefreshError,
} from './types.ts'

// ============================================================================
// 편의 함수: 전체 로그인 플로우
// ============================================================================

import { type AuthMode, createAuthorizationUrl, exchangeCodeForTokens } from './anthropic.ts'

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
export async function performInteractiveLogin(mode: AuthMode = 'max'): Promise<void> {
  // 1. 인증 URL 생성
  const { authorizationUrl, pkce } = await createAuthorizationUrl(mode)

  // 2. 브라우저 열기
  const modeDesc = mode === 'console' ? 'Anthropic Console (API Key generation)' : 'Claude.ai (Pro/Max subscription)'
  console.log(`\n🔐 Opening browser for ${modeDesc} authentication...\n`)
  console.log("After authorizing, you'll see a code on the page.")
  console.log('Copy that code and paste it below.\n')
  console.log(`If browser doesn't open, visit:\n${authorizationUrl}\n`)

  // 플랫폼별 브라우저 열기
  const openCommand = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'

  try {
    Bun.spawn([openCommand, authorizationUrl])
  } catch {
    // 브라우저 열기 실패해도 URL은 출력됨
  }

  // 3. 코드 입력 받기
  process.stdout.write('Enter the authorization code: ')

  const code = await new Promise<string>((resolve) => {
    let input = ''
    process.stdin.setRawMode?.(false)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    const onData = (chunk: string) => {
      input += chunk
      if (input.includes('\n')) {
        process.stdin.removeListener('data', onData)
        process.stdin.pause()
        resolve(input.trim())
      }
    }

    process.stdin.on('data', onData)
  })

  if (!code) {
    throw new Error('No authorization code provided')
  }

  // 4. 토큰 교환 (OpenCode 방식: 전체 코드 전달, 내부에서 #state 파싱)
  console.log('\nExchanging authorization code for tokens...\n')
  await exchangeCodeForTokens(code.trim(), pkce.codeVerifier)

  console.log(`✅ Successfully authenticated with ${modeDesc}!\n`)
}
