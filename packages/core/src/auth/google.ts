import { generatePKCEChallenge } from './pkce.ts'
import { deleteProviderTokens, isTokenExpired, loadProviderTokens, saveProviderTokens } from './storage.ts'
import type { OAuthTokens, PKCEChallenge, TokenResponse } from './types.ts'
import { GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_CONFIG, GOOGLE_REDIRECT_URI } from './types.ts'

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

export async function refreshGoogleAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const config = GOOGLE_OAUTH_CONFIG

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: GOOGLE_CLIENT_SECRET,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Google token refresh failed: ${errorText}`)
  }

  const data = (await response.json()) as TokenResponse

  const tokens: OAuthTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type,
    scope: data.scope,
  }

  await saveProviderTokens('google', tokens)
  return tokens
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
    } catch {
      await deleteProviderTokens('google')
      throw new Error("Google token refresh failed. Please run 'obora auth login google' again.")
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
