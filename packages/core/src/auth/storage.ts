/**
 * OAuth 토큰 저장소
 *
 * 파일 시스템에 인증 정보를 안전하게 저장합니다.
 */

import { join } from "node:path";
import { homedir } from "node:os";
import type { AuthCredentials, OAuthTokens } from "./types.ts";

// ============================================================================
// 설정
// ============================================================================

/**
 * 인증 파일 경로
 */
function getAuthFilePath(): string {
  const configDir =
    process.env.XDG_CONFIG_HOME || join(homedir(), ".config", "obora");
  return join(configDir, "auth.json");
}

/**
 * 설정 디렉토리 확인/생성
 */
async function ensureConfigDir(): Promise<void> {
  const authPath = getAuthFilePath();
  const dir = authPath.substring(0, authPath.lastIndexOf("/"));

  try {
    await Bun.file(dir).exists();
  } catch {
    await Bun.write(join(dir, ".keep"), "");
  }
}

// ============================================================================
// 저장/로드
// ============================================================================

/**
 * 모든 인증 정보 로드
 */
export async function loadCredentials(): Promise<AuthCredentials> {
  const authPath = getAuthFilePath();

  try {
    const file = Bun.file(authPath);
    if (await file.exists()) {
      const content = await file.text();
      return JSON.parse(content) as AuthCredentials;
    }
  } catch (error) {
    console.error("Failed to load credentials:", error);
  }

  return {};
}

/**
 * 인증 정보 저장
 */
export async function saveCredentials(
  credentials: AuthCredentials
): Promise<void> {
  await ensureConfigDir();
  const authPath = getAuthFilePath();

  await Bun.write(authPath, JSON.stringify(credentials, null, 2));

  // 파일 권한 설정 (소유자만 읽기/쓰기)
  try {
    const fs = await import("node:fs/promises");
    await fs.chmod(authPath, 0o600);
  } catch {
    // Windows에서는 chmod가 작동하지 않을 수 있음
  }
}

/**
 * 특정 프로바이더 토큰 로드
 */
export async function loadProviderTokens(
  provider: keyof AuthCredentials
): Promise<OAuthTokens | undefined> {
  const credentials = await loadCredentials();
  return credentials[provider];
}

/**
 * 특정 프로바이더 토큰 저장
 */
export async function saveProviderTokens(
  provider: keyof AuthCredentials,
  tokens: OAuthTokens
): Promise<void> {
  const credentials = await loadCredentials();
  credentials[provider] = tokens;
  await saveCredentials(credentials);
}

/**
 * 특정 프로바이더 토큰 삭제
 */
export async function deleteProviderTokens(
  provider: keyof AuthCredentials
): Promise<void> {
  const credentials = await loadCredentials();
  delete credentials[provider];
  await saveCredentials(credentials);
}

// ============================================================================
// 유틸리티
// ============================================================================

/**
 * 토큰 만료 여부 확인
 *
 * @param tokens OAuth 토큰
 * @param bufferMs 버퍼 시간 (기본 5분)
 */
export function isTokenExpired(
  tokens: OAuthTokens,
  bufferMs: number = 5 * 60 * 1000
): boolean {
  return Date.now() >= tokens.expiresAt - bufferMs;
}

/**
 * 인증 파일 경로 반환 (디버깅용)
 */
export function getAuthPath(): string {
  return getAuthFilePath();
}
