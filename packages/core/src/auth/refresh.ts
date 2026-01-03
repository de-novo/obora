import type { OAuthTokens, TokenResponse } from './types'
import { calculateRetryDelay, MAX_REFRESH_RETRIES, parseOAuthErrorPayload, TokenRefreshError } from './types'

type ContentType = 'json' | 'urlencoded'

interface RefreshConfig {
  tokenUrl: string
  contentType: ContentType
  body: Record<string, string>
  providerName: string
  keepRefreshToken?: string
}

export async function refreshWithRetry(config: RefreshConfig): Promise<OAuthTokens> {
  const { tokenUrl, contentType, body, providerName, keepRefreshToken } = config
  let lastError: TokenRefreshError | undefined

  for (let attempt = 0; attempt <= MAX_REFRESH_RETRIES; attempt++) {
    try {
      const headers: Record<string, string> =
        contentType === 'json'
          ? { 'Content-Type': 'application/json', Accept: 'application/json' }
          : { 'Content-Type': 'application/x-www-form-urlencoded' }

      const requestBody = contentType === 'json' ? JSON.stringify(body) : new URLSearchParams(body).toString()

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers,
        body: requestBody,
      })

      if (response.ok) {
        const data = (await response.json()) as TokenResponse
        const refreshToken = data.refresh_token || keepRefreshToken || body.refresh_token
        if (!refreshToken) {
          throw new TokenRefreshError({
            message: `${providerName} token refresh failed: no refresh token in response`,
            status: 0,
            statusText: 'No Refresh Token',
          })
        }
        return {
          accessToken: data.access_token,
          refreshToken,
          expiresAt: Date.now() + data.expires_in * 1000,
          tokenType: data.token_type,
          scope: data.scope,
        }
      }

      const responseBody = await response.text().catch(() => undefined)
      const parsed = parseOAuthErrorPayload(responseBody)

      lastError = new TokenRefreshError({
        message: parsed.description || `${providerName} token refresh failed: ${response.status}`,
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
      message: `${providerName} token refresh failed after all retries`,
      status: 0,
      statusText: 'Max Retries Exceeded',
    })
  )
}
