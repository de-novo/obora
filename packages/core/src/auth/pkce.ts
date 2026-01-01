/**
 * PKCE (Proof Key for Code Exchange) 유틸리티
 *
 * OAuth 2.0 확장으로, public client의 인증 코드 가로채기 공격을 방지합니다.
 */

import type { PKCEChallenge } from './types.ts'

/**
 * PKCE 코드 검증자 생성
 *
 * 43-128자의 랜덤 URL-safe 문자열을 생성합니다.
 */
export function generateCodeVerifier(length: number = 64): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const randomValues = crypto.getRandomValues(new Uint8Array(length))

  let result = ''
  for (const value of randomValues) {
    result += charset[value % charset.length]
  }

  return result
}

/**
 * 코드 챌린지 생성 (SHA256 해시)
 *
 * code_verifier의 SHA256 해시를 base64url로 인코딩합니다.
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(codeVerifier)
  const hash = await crypto.subtle.digest('SHA-256', data)

  // Base64URL 인코딩 (+ → -, / → _, = 제거)
  const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * PKCE 챌린지 쌍 생성
 *
 * 코드 검증자와 코드 챌린지를 함께 생성합니다.
 */
export async function generatePKCEChallenge(): Promise<PKCEChallenge> {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  }
}

/**
 * 랜덤 state 생성
 *
 * CSRF 공격 방지를 위한 랜덤 문자열입니다.
 */
export function generateState(length: number = 32): string {
  const randomValues = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(randomValues)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
