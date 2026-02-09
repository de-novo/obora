import type { ActorFactory } from "../runtime/types";
import type { IBlackboard } from "../types/actor";
import type { IMessageBus, Message, MessageType, UnsubscribeFn } from "../types/message";

import { ActorPool, PoolConfig, PoolMetrics } from "./ActorPool";

/**
 * No-Op MessageBus - 기본값으로 사용되는 빈 구현
 */
class NoOpMessageBus implements IMessageBus {
  send(message: Message): void {}
  sendTo(to: any, message: Omit<Message, "to">): void {}
  broadcast(message: Omit<Message, "to">): void {}
  receive(handler: (message: Message) => void): void {}
  request<T>(message: Message, timeoutMs?: number): Promise<Message<T>> {
    return Promise.resolve(message as Message<T>);
  }
  subscribe(messageType: MessageType, handler: (message: Message) => void): UnsubscribeFn {
    return () => {};
  }
  getQueueSize(actorId: any): number {
    return 0;
  }
  clearQueue(actorId: any): void {}
  filter(predicate: (message: Message) => boolean): Message[] {
    return [];
  }
}

/**
 * Pool Manager
 *
 * 여러 Actor Pool을 관리하는 매니저입니다.
 */
export class PoolManager {
  private readonly board: IBlackboard;
  private readonly messageBus: IMessageBus;
  private readonly factory: ActorFactory;
  private readonly pools: Map<string, ActorPool>;
  private isRunning: boolean;

  constructor(
    board: IBlackboard,
    factory: ActorFactory,
    messageBus: IMessageBus = new NoOpMessageBus()
  ) {
    this.board = board;
    this.messageBus = messageBus;
    this.factory = factory;
    this.pools = new Map();
    this.isRunning = false;
  }

  /**
   * 매니저 시작
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("PoolManager is already running");
    }

    this.isRunning = true;

    // 모든 Pool 시작
    const startPromises = Array.from(this.pools.values()).map((pool) => pool.start());
    await Promise.all(startPromises);

    this.log("PoolManager started");
  }

  /**
   * 매니저 종료
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // 모든 Pool 종료
    const stopPromises = Array.from(this.pools.values()).map((pool) => pool.stop());
    await Promise.allSettled(stopPromises);

    this.isRunning = false;
    this.log("PoolManager stopped");
  }

  /**
   * Pool 등록
   * @param config Pool 설정
   * @returns 생성된 Pool
   */
  registerPool(config: PoolConfig): ActorPool {
    if (this.pools.has(config.name)) {
      throw new Error(`Pool already exists: ${config.name}`);
    }

    const pool = new ActorPool(config, this.board, this.factory, this.messageBus);
    this.pools.set(config.name, pool);

    // 이미 실행 중이면 Pool 시작
    if (this.isRunning) {
      pool.start().catch((err) => {
        console.error(`Failed to start pool: ${config.name}`, err);
      });
    }

    this.log(`Pool registered: ${config.name}`);
    return pool;
  }

  /**
   * Pool 등록 해제
   * @param name Pool 이름
   */
  async unregisterPool(name: string): Promise<void> {
    const pool = this.pools.get(name);
    if (!pool) {
      throw new Error(`Pool not found: ${name}`);
    }

    await pool.stop();
    this.pools.delete(name);
    this.log(`Pool unregistered: ${name}`);
  }

  /**
   * Pool 조회
   * @param name Pool 이름
   * @returns Pool 인스턴스
   */
  getPool(name: string): ActorPool {
    const pool = this.pools.get(name);
    if (!pool) {
      throw new Error(`Pool not found: ${name}`);
    }
    return pool;
  }

  /**
   * Pool 존재 여부 확인
   * @param name Pool 이름
   * @returns 존재 여부
   */
  hasPool(name: string): boolean {
    return this.pools.has(name);
  }

  /**
   * 모든 Pool 이름 조회
   * @returns Pool 이름 배열
   */
  listPools(): string[] {
    return Array.from(this.pools.keys());
  }

  /**
   * 모든 Pool의 메트릭 조회
   * @returns Pool 이름별 메트릭 맵
   */
  getAllMetrics(): Map<string, PoolMetrics> {
    const metrics = new Map<string, PoolMetrics>();
    for (const [name, pool] of this.pools.entries()) {
      metrics.set(name, pool.getMetrics());
    }
    return metrics;
  }

  /**
   * 특정 Pool의 메트릭 조회
   * @param name Pool 이름
   * @returns Pool 메트릭
   */
  getPoolMetrics(name: string): PoolMetrics {
    const pool = this.getPool(name);
    return pool.getMetrics();
  }

  /**
   * Pool 개수
   */
  size(): number {
    return this.pools.size;
  }

  /**
   * 실행 상태
   */
  getStatus(): { running: boolean; poolCount: number } {
    return {
      running: this.isRunning,
      poolCount: this.pools.size,
    };
  }

  private log(message: string): void {
    // PoolManager 로그는 디버그용으로만 사용
    // console.log(`[PoolManager] ${message}`);
  }
}
