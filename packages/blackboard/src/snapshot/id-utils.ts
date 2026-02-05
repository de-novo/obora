/**
 * @module snapshot/id-utils
 * @description ID 생성 유틸리티 (브라우저/Node.js 호환)
 */

/**
 * 기본 ID 생성 함수
 * @returns 고유 ID 문자열
 * @description Node.js 환경에서는 crypto.randomUUID(), 브라우저 환경에서는 fallback 사용
 */
export function createDefaultId(): string {
  // Node.js 환경
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // 브라우저 환경 fallback
  return `snap-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * ID 생성자 타입
 */
export type IdGenerator = () => string;

/**
 * 기본 ID 생성자 생성
 * @param customGenerator - 사용자 정의 ID 생성 함수 (선택)
 * @returns ID 생성 함수
 */
export function createIdGenerator(
  customGenerator?: IdGenerator
): IdGenerator {
  return customGenerator ?? createDefaultId;
}
