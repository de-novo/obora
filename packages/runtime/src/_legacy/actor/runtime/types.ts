import type { Actor, ActorId, ActorRole } from "../types/actor";
import type { IBlackboard } from "../types/actor";
import type { IMessageBus } from "../types/message";

/**
 * Actor 생성 설정
 */
export interface ActorConfig {
  /** Actor ID (생략 시 자동 생성) */
  id?: ActorId;

  /** Actor 이름 */
  name: string;

  /** Actor 역할 */
  role: ActorRole;

  /** Actor 유형 (구체적인 Actor 클래스 식별자) */
  type: string;

  /** Actor 초기 설정 */
  config?: Record<string, unknown>;
}

/**
 * Actor 팩토리
 *
 * Actor 인스턴스 생성을 담당하는 인터페이스입니다.
 * 구체적인 Actor 구현은 이 팩토리를 통해 생성됩니다.
 */
export interface ActorFactory {
  /**
   * Actor 인스턴스 생성
   *
   * Factory implementations SHOULD abort actor creation when `options.signal`
   * is aborted.
   *
   * @param config Actor 설정
   * @param board Blackboard 인스턴스
   * @param messageBus MessageBus 인스턴스
   * @param options 생성 옵션
   * @returns 생성된 Actor 인스턴스
   */
  create(
    config: ActorConfig,
    board: IBlackboard,
    messageBus: IMessageBus,
    options?: { signal?: AbortSignal }
  ): Promise<Actor>;
}
