import { AccountManager } from './account-manager.ts'
import { generatePKCEChallenge } from './pkce.ts'
import { deleteProviderTokens, isTokenExpired, loadProviderTokens, saveProviderTokens } from './storage.ts'
import type { ManagedAccount, OAuthTokens, PKCEChallenge, TokenResponse } from './types.ts'
import {
  calculateRetryDelay,
  DEFAULT_RATE_LIMIT_MS,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_OAUTH_CONFIG,
  GOOGLE_REDIRECT_URI,
  MAX_REFRESH_RETRIES,
  parseOAuthErrorPayload,
  TokenRefreshError,
} from './types.ts'

export interface GoogleAuthorizationResult {
  authorizationUrl: string
  state: string
  pkce: PKCEChallenge
  redirectUri: string
}

export async function createGoogleAuthorizationUrl(): Promise<GoogleAuthorizationResult> {
  const config = GOOGLE_OAUTH_CONFIG
  const pkce = await generatePKCEChallenge()
  const state = pkce.codeVerifier

  const url = new URL(config.authorizationUrl)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI)
  url.searchParams.set('scope', config.scopes.join(' '))
  url.searchParams.set('code_challenge', pkce.codeChallenge)
  url.searchParams.set('code_challenge_method', pkce.codeChallengeMethod)
  url.searchParams.set('state', state)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')

  return {
    authorizationUrl: url.toString(),
    state,
    pkce,
    redirectUri: GOOGLE_REDIRECT_URI,
  }
}

export async function exchangeGoogleCodeForTokens(code: string, codeVerifier: string): Promise<OAuthTokens> {
  const config = GOOGLE_OAUTH_CONFIG

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: GOOGLE_REDIRECT_URI,
      client_id: config.clientId,
      client_secret: GOOGLE_CLIENT_SECRET,
      code_verifier: codeVerifier,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Google token exchange failed: ${errorText}`)
  }

  const data = (await response.json()) as TokenResponse

  const tokens: OAuthTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type,
    scope: data.scope,
  }

  await saveProviderTokens('google', tokens)
  return tokens
}

export async function refreshGoogleAccessToken(currentRefreshToken: string): Promise<OAuthTokens> {
  const config = GOOGLE_OAUTH_CONFIG
  let lastError: TokenRefreshError | undefined

  for (let attempt = 0; attempt <= MAX_REFRESH_RETRIES; attempt++) {
    try {
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: currentRefreshToken,
          client_id: config.clientId,
          client_secret: GOOGLE_CLIENT_SECRET,
        }),
      })

      if (response.ok) {
        const data = (await response.json()) as TokenResponse
        const tokens: OAuthTokens = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token || currentRefreshToken,
          expiresAt: Date.now() + data.expires_in * 1000,
          tokenType: data.token_type,
          scope: data.scope,
        }
        await saveProviderTokens('google', tokens)
        return tokens
      }

      const responseBody = await response.text().catch(() => undefined)
      const parsed = parseOAuthErrorPayload(responseBody)

      lastError = new TokenRefreshError({
        message: parsed.description || `Google token refresh failed: ${response.status}`,
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
      message: 'Google token refresh failed after all retries',
      status: 0,
      statusText: 'Max Retries Exceeded',
    })
  )
}

export async function getValidGoogleAccessToken(): Promise<string> {
  const tokens = await loadProviderTokens('google')

  if (!tokens) {
    throw new Error("Not authenticated with Google. Run 'obora auth login google' first.")
  }

  if (isTokenExpired(tokens)) {
    try {
      const newTokens = await refreshGoogleAccessToken(tokens.refreshToken)
      return newTokens.accessToken
    } catch (error) {
      if (error instanceof TokenRefreshError && error.isInvalidGrant) {
        await deleteProviderTokens('google')
        throw new Error("Google token has been revoked. Please run 'obora auth login google' again.")
      }
      throw error
    }
  }

  return tokens.accessToken
}

export async function isGoogleAuthenticated(): Promise<boolean> {
  try {
    await getValidGoogleAccessToken()
    return true
  } catch {
    return false
  }
}

export async function logoutGoogle(): Promise<void> {
  await deleteProviderTokens('google')
  const { clearAccounts } = await import('./account-storage.ts')
  await clearAccounts()
  accountManagerInstance = null
}

export function startGoogleCallbackServer(
  expectedState: string,
  timeoutMs: number = 5 * 60 * 1000,
): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    let server: ReturnType<typeof Bun.serve> | null = null
    let timeoutId: Timer | null = null

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId)
      if (server) server.stop()
    }

    timeoutId = setTimeout(() => {
      cleanup()
      reject(new Error('OAuth callback timeout'))
    }, timeoutMs)

    const port = GOOGLE_OAUTH_CONFIG.redirectPortRange[0]

    try {
      server = Bun.serve({
        port,
        fetch(req) {
          const url = new URL(req.url)

          if (url.pathname === '/oauth-callback') {
            const code = url.searchParams.get('code')
            const state = url.searchParams.get('state')
            const error = url.searchParams.get('error')

            if (error) {
              cleanup()
              reject(new Error(`OAuth error: ${error}`))
              return new Response(htmlResponse(false, `Authentication failed: ${error}`), {
                headers: { 'Content-Type': 'text/html' },
              })
            }

            if (state !== expectedState) {
              cleanup()
              reject(new Error('Invalid state'))
              return new Response(htmlResponse(false, 'Invalid state'), {
                headers: { 'Content-Type': 'text/html' },
              })
            }

            if (!code) {
              cleanup()
              reject(new Error('No code received'))
              return new Response(htmlResponse(false, 'No code'), {
                headers: { 'Content-Type': 'text/html' },
              })
            }

            cleanup()
            resolve({ code, state })
            return new Response(htmlResponse(true, 'Success! You can close this window.'), {
              headers: { 'Content-Type': 'text/html' },
            })
          }

          return new Response('Not Found', { status: 404 })
        },
      })
    } catch (err) {
      reject(new Error(`Failed to start callback server on port ${port}: ${err}`))
    }
  })
}

function htmlResponse(success: boolean, message: string): string {
  const color = success ? '#22c55e' : '#ef4444'
  return `<!DOCTYPE html><html><head><title>Obora Auth</title></head><body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0f172a;color:#e2e8f0"><div style="text-align:center"><div style="font-size:3rem;color:${color}">${success ? '✓' : '✕'}</div><p>${message}</p></div></body></html>`
}

export async function performGoogleLogin(): Promise<void> {
  const { authorizationUrl, pkce, state } = await createGoogleAuthorizationUrl()

  console.log('\nOpening browser for Google (Gemini) authentication...\n')
  console.log(`If browser doesn't open, visit:\n${authorizationUrl}\n`)

  const serverPromise = startGoogleCallbackServer(state)

  const openCommand = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  try {
    Bun.spawn([openCommand, authorizationUrl])
  } catch {}

  const { code } = await serverPromise
  await exchangeGoogleCodeForTokens(code, pkce.codeVerifier)

  console.log('Successfully authenticated with Google!\n')
}

let accountManagerInstance: AccountManager | null = null

export async function getGoogleAccountManager(): Promise<AccountManager> {
  if (!accountManagerInstance) {
    accountManagerInstance = await AccountManager.loadFromDisk()
  }
  return accountManagerInstance
}

async function fetchGoogleUserEmail(accessToken: string): Promise<string | undefined> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (response.ok) {
      const data = (await response.json()) as { email?: string }
      return data.email
    }
  } catch {}
  return undefined
}

export async function addGoogleAccount(
  refreshToken: string,
  email?: string,
  projectId?: string,
): Promise<{ account: ManagedAccount; isNew: boolean } | null> {
  const manager = await getGoogleAccountManager()
  const result = manager.addAccount(refreshToken, email, projectId)
  if (result) {
    await manager.saveToDisk()
  }
  return result
}

export async function removeGoogleAccount(index: number): Promise<boolean> {
  const manager = await getGoogleAccountManager()
  const accounts = manager.getAccounts()
  const account = accounts.find((a) => a.index === index)
  if (!account) return false

  const removed = manager.removeAccount(account)
  if (removed) {
    await manager.saveToDisk()
  }
  return removed
}

export async function listGoogleAccounts(): Promise<ManagedAccount[]> {
  const manager = await getGoogleAccountManager()
  return manager.getAccounts()
}

export async function refreshAccountToken(account: ManagedAccount): Promise<OAuthTokens> {
  const tokens = await refreshGoogleAccessToken(account.refreshToken)
  const manager = await getGoogleAccountManager()
  manager.updateTokens(account, tokens.accessToken, tokens.expiresAt)
  await manager.saveToDisk()
  return tokens
}

export async function getNextAvailableAccount(): Promise<ManagedAccount | null> {
  const manager = await getGoogleAccountManager()
  return manager.getCurrentOrNextForFamily('gemini')
}

export async function markAccountRateLimited(
  account: ManagedAccount,
  retryAfterMs: number = DEFAULT_RATE_LIMIT_MS,
): Promise<void> {
  const manager = await getGoogleAccountManager()
  manager.markRateLimited(account, retryAfterMs, 'gemini', 'antigravity')
  await manager.saveToDisk()
}

export async function performGoogleLoginWithMultiAccount(): Promise<{
  account: ManagedAccount
  isNew: boolean
} | null> {
  const { authorizationUrl, pkce, state } = await createGoogleAuthorizationUrl()

  console.log('\nOpening browser for Google (Gemini) authentication...\n')
  console.log(`If browser doesn't open, visit:\n${authorizationUrl}\n`)

  const serverPromise = startGoogleCallbackServer(state)

  const openCommand = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  try {
    Bun.spawn([openCommand, authorizationUrl])
  } catch {}

  const { code } = await serverPromise
  const tokens = await exchangeGoogleCodeForTokens(code, pkce.codeVerifier)

  const email = await fetchGoogleUserEmail(tokens.accessToken)
  const result = await addGoogleAccount(tokens.refreshToken, email)

  if (result) {
    const manager = await getGoogleAccountManager()
    manager.updateTokens(result.account, tokens.accessToken, tokens.expiresAt)
    await manager.saveToDisk()
  }

  return result
}
