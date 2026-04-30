/**
 * @module blackboard
 * @description Blackboard 인터페이스 - Actor 연결용
 */

/**
 * Actor와 상호작용하는 Blackboard 인터페이스 (스펙 기준: IBlackboard)
 *
 * Actor 시스템에서 필요한 Blackboard의 기능을 정의합니다.
 * 전체 구현은 @obora-kit/blackboard 패키지에서 제공됩니다.
 *
 * 참고: [[spec/13-actor.md|13-actor.md]]
 */
export interface IBlackboard {
  /**
   * 현재 Blackboard 버전
   */
  readonly version: number;

  /**
   * Blackboard에서 데이터 읽기
   * @param key - 읽을 키 또는 경로
   * @returns 읽은 데이터
   */
  read(key: string): unknown | undefined;

  /**
   * Blackboard에 데이터 쓰기
   * @param key - 쓸 키 또는 경로
   * @param value - 쓸 데이터
   */
  write(key: string, value: unknown): void;

  /**
   * Blackboard에서 데이터 삭제
   * @param key - 삭제할 키 또는 경로
   */
  delete(key: string): void;

  /**
   * 모든 키 조회
   * @returns 모든 키 배열
   */
  keys(): string[];

  /**
   * 특정 패턴의 키 조회
   * @param pattern - 검색할 패턴
   * @returns 일치하는 키 배열
   */
  find(pattern: string): string[];
}
