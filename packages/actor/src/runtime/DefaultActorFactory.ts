import type { Actor, ActorId, ActorRole, IBlackboard } from "../types/actor";
import type { IMessageBus } from "../types/message";
import type { ActorFactory, ActorConfig } from "./types";
import { generateActorId } from "./crypto";

/**
 * Actor 클래스 등록소
 */
type ActorConstructor = new (
  id: ActorId,
  name: string,
  role: ActorRole,
  board: IBlackboard,
  messageBus: IMessageBus,
  config?: Record<string, unknown>
) => Actor;

/**
 * 기본 Actor 팩토리
 *
 * Actor 클래스를 등록하고 생성할 수 있는 팩토리입니다.
 */
export class DefaultActorFactory implements ActorFactory {
  private readonly registry: Map<string, ActorConstructor>;

  constructor() {
    this.registry = new Map();
  }

  /**
   * Actor 클래스 등록
   * @param type Actor 유형 식별자
   * @param constructor Actor 생성자
   */
  register(type: string, constructor: ActorConstructor): void {
    this.registry.set(type, constructor);
  }

  /**
   * Actor 클래스 등록 해제
   * @param type Actor 유형 식별자
   */
  unregister(type: string): void {
    this.registry.delete(type);
  }

  /**
   * Actor 인스턴스 생성
   * @param config Actor 설정
   * @param board Blackboard 인스턴스
   * @param messageBus MessageBus 인스턴스
   * @returns 생성된 Actor 인스턴스
   */
  async create(config: ActorConfig, board: IBlackboard, messageBus: IMessageBus): Promise<Actor> {
    const { id, name, role, type, config: actorConfig } = config;

    // 등록된 생성자 조회
    const Constructor = this.registry.get(type);
    if (!Constructor) {
      throw new Error(`Unknown actor type: ${type}`);
    }

    // Actor ID 생성 또는 사용
    const actorId = id || this.generateId(role);

    // Actor 생성
    const actor = new Constructor(
      actorId,
      name || `actor-${role}`,
      role,
      board,
      messageBus,
      actorConfig
    );

    return actor;
  }

  /**
   * Actor ID 생성
   * @param role Actor 역할
   * @returns Actor ID
   */
  private generateId(role: string): ActorId {
    const id = generateActorId(role);
    return id as ActorId;
  }
}
