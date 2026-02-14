import { ActorLifecycleStatus } from "../types/actor";
import type { Actor, ActorId, ActorRole } from "../types/actor";
import type { IBlackboard } from "../types/actor";
import type { IMessageBus } from "../types/message";

import type { ActorFactory, ActorConfig } from "./types";
import { delay } from "./utils/delay";

/**
 * Actor 런타임 설정
 */
export interface RuntimeConfig {
  /** 최대 동시 Actor 수 */
  maxActors?: number;

  /** Actor 생성 시 기본 타임아웃 (ms) */
  spawnTimeout?: number;

  /** Actor 종료 시 기본 타임아웃 (ms) */
  stopTimeout?: number;

  /** 재시작 최대 횟수 */
  maxRestarts?: number;

  /** 재시작 백오프 초기값 (ms) */
  initialBackoff?: number;

  /** 재시작 백오프 최대값 (ms) */
  maxBackoff?: number;

  /** 디버그 모드 */
  debug?: boolean;
}

/**
 * Actor 런타임
 *
 * Actor의 생성, 관리, 종료를 담당합니다.
 */
export class ActorRuntime {
  private readonly actors: Map<ActorId, Actor>;
  private readonly actorConfigs: Map<ActorId, ActorConfig>;
  private readonly board: IBlackboard;
  private readonly messageBus: IMessageBus;
  private readonly config: Required<RuntimeConfig>;
  private readonly factory: ActorFactory;
  private isRunning: boolean;

  constructor(
    board: IBlackboard,
    messageBus: IMessageBus,
    factory: ActorFactory,
    config?: RuntimeConfig
  ) {
    this.board = board;
    this.messageBus = messageBus;
    this.factory = factory;
    this.actors = new Map();
    this.actorConfigs = new Map();
    this.isRunning = false;

    // 기본 설정
    const defaults: Required<RuntimeConfig> = {
      maxActors: 100,
      spawnTimeout: 5000,
      stopTimeout: 5000,
      maxRestarts: 3,
      initialBackoff: 1000,
      maxBackoff: 30000,
      debug: false,
    };
    this.config = { ...defaults, ...config };

    // RuntimeConfig 검증
    this.validateRuntimeConfig(this.config);
  }

  /**
   * 런타임 시작
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Runtime is already running");
    }
    this.isRunning = true;
    this.log("Runtime started");
  }

  /**
   * 런타임 종료
   */
  async stop(): Promise<void> {
    // 런타임 종료 - idempotent
    if (!this.isRunning) {
      return;
    }

    this.log("Stopping runtime...");
    const stopPromises = Array.from(this.actors.values()).map((actor) => this.stopActor(actor.id));
    await Promise.allSettled(stopPromises);
    this.actors.clear();
    this.isRunning = false;
    this.log("Runtime stopped");
  }

  /**
   * 특정 Actor 중지
   * @param actorId Actor ID
   */
  async stopById(actorId: ActorId): Promise<void> {
    if (!this.isRunning) {
      throw new Error("Runtime is not running");
    }

    const actor = this.getActor(actorId);
    await this.stopActor(actor.id);
  }

  /**
   * 새 Actor 생성 (spawn)
   * @param config Actor 설정
   * @returns 생성된 Actor
   */
  async spawn(config: ActorConfig): Promise<Actor> {
    if (!this.isRunning) {
      throw new Error("Runtime is not running");
    }

    // ActorConfig 입력 검증
    this.validateConfig(config);

    // 최대 Actor 수 체크
    if (this.actors.size >= this.config.maxActors) {
      throw new Error(`Maximum actors limit reached: ${this.config.maxActors}`);
    }

    // 중복 ID 체크
    if (config.id && this.actors.has(config.id)) {
      throw new Error(`Actor already exists: ${config.id}`);
    }

    this.log(`Spawning actor: ${config.id || "auto-generated"} (${config.role})`);

    const startTime = Date.now();
    let actor: Actor | null = null;

    try {
      const spawnAbort = new AbortController();
      const createPromise = Promise.resolve(
        this.factory.create(config, this.board, this.messageBus)
      );
      createPromise.catch(() => {});

      try {
        actor = await Promise.race([
          createPromise,
          delay(this.config.spawnTimeout, spawnAbort.signal).then(() => {
            throw new Error(`Actor spawn timeout: ${config.id || "unknown"}`);
          }),
        ]);
        spawnAbort.abort();
      } catch (error) {
        spawnAbort.abort();
        throw error;
      }

      const startAbort = new AbortController();
      const startPromise = Promise.resolve(actor!.start());
      startPromise.catch(() => {});

      try {
        await Promise.race([
          startPromise,
          delay(this.config.spawnTimeout, startAbort.signal).then(() => {
            throw new Error(`Actor start timeout: ${actor!.id}`);
          }),
        ]);
        startAbort.abort();
      } catch (error) {
        startAbort.abort();
        throw error;
      }

      // 등록 전 중복 체크 (auto-generated ID 포함)
      if (this.actors.has(actor.id)) {
        throw new Error(`Actor ID collision: ${actor.id}`);
      }
      this.actors.set(actor.id, actor);
      this.actorConfigs.set(actor.id, config);

      const duration = Date.now() - startTime;
      this.log(`Actor spawned: ${actor.id} (${duration}ms)`);

      return actor;
    } catch (error) {
      // 타임아웃이나 에러 발생 시 cleanup
      if (actor) {
        try {
          await actor.stop();
        } catch {
          // cleanup 실패는 무시
        }
      }
      const duration = Date.now() - startTime;
      this.log(`Actor spawn failed: ${config.id || "unknown"} (${duration}ms)`, error);
      throw error;
    }
  }

  /**
   * Actor 재시작
   * @param actorId Actor ID
   * @param restartCount 현재 재시작 횟수 (내부용)
   */
  async restart(actorId: ActorId, restartCount = 0): Promise<Actor> {
    if (restartCount >= this.config.maxRestarts) {
      throw new Error(`Max restarts (${this.config.maxRestarts}) exceeded for actor: ${actorId}`);
    }

    const actor = this.actors.get(actorId);
    const config = this.actorConfigs.get(actorId);

    if (!actor || !config) {
      throw new Error(`Actor or config not found: ${actorId}`);
    }

    const savedConfig = { ...config, id: actorId };

    this.log(`Restarting actor: ${actorId} (attempt ${restartCount + 1})`);

    try {
      await this.stopActor(actor.id);

      const backoff = this.calculateBackoff(restartCount);
      if (backoff > 0) {
        await delay(backoff);
      }

      const newActor = await this.spawn(savedConfig);
      this.log(`Actor restarted: ${actorId}`);
      return newActor;
    } catch (error) {
      this.log(`Actor restart failed: ${actorId}`, error);
      if (restartCount + 1 < this.config.maxRestarts) {
        return this.retryRestart(actorId, savedConfig, restartCount + 1);
      }
      throw error;
    }
  }

  private async retryRestart(
    actorId: ActorId,
    config: ActorConfig,
    restartCount: number
  ): Promise<Actor> {
    if (restartCount >= this.config.maxRestarts) {
      throw new Error(`Max restarts (${this.config.maxRestarts}) exceeded for actor: ${actorId}`);
    }

    const backoff = this.calculateBackoff(restartCount);
    if (backoff > 0) {
      await delay(backoff);
    }

    try {
      const newActor = await this.spawn(config);
      this.log(`Actor restarted: ${actorId}`);
      return newActor;
    } catch (error) {
      this.log(`Actor retry restart failed: ${actorId}`, error);
      if (restartCount + 1 < this.config.maxRestarts) {
        return this.retryRestart(actorId, config, restartCount + 1);
      }
      throw error;
    }
  }

  /**
   * Actor 조회
   * @param actorId Actor ID
   * @returns Actor 인스턴스
   */
  getActor(actorId: ActorId): Actor {
    const actor = this.actors.get(actorId);
    if (!actor) {
      throw new Error(`Actor not found: ${actorId}`);
    }
    return actor;
  }

  /**
   * Actor 존재 여부 확인
   * @param actorId Actor ID
   * @returns 존재 여부
   */
  hasActor(actorId: ActorId): boolean {
    return this.actors.has(actorId);
  }

  /**
   * 모든 Actor ID 반환
   * @returns Actor ID 배열
   */
  listActors(): ActorId[] {
    return Array.from(this.actors.keys());
  }

  /**
   * 역할별 Actor 목록
   * @param role Actor 역할
   * @returns Actor ID 배열
   */
  listActorsByRole(role: ActorRole): ActorId[] {
    return Array.from(this.actors.values())
      .filter((actor) => actor.role === role)
      .map((actor) => actor.id);
  }

  /**
   * 특정 상태의 Actor 목록
   * @param status Actor 상태
   * @returns Actor ID 배열
   */
  listActorsByStatus(status: ActorLifecycleStatus): ActorId[] {
    return Array.from(this.actors.values())
      .filter((actor) => actor.status.status === status)
      .map((actor) => actor.id);
  }

  /**
   * 현재 Actor 수
   */
  size(): number {
    return this.actors.size;
  }

  /**
   * 런타임 상태
   */
  getStatus(): { running: boolean; actorCount: number } {
    return {
      running: this.isRunning,
      actorCount: this.actors.size,
    };
  }

  // ==================== 내부 메서드 ====================

  private async stopActor(actorId: ActorId): Promise<void> {
    const actor = this.actors.get(actorId);
    if (!actor) return;

    this.log(`Stopping actor: ${actorId}`);

    try {
      const stopAbort = new AbortController();
      const stopPromise = Promise.resolve(actor.stop());
      stopPromise.catch(() => {});

      try {
        await Promise.race([
          stopPromise,
          delay(this.config.stopTimeout, stopAbort.signal).then(() => {
            throw new Error(`Actor stop timeout: ${actorId}`);
          }),
        ]);
        stopAbort.abort();
      } catch (error) {
        stopAbort.abort();
        throw error;
      }

      this.log(`Actor stopped: ${actorId}`);
    } catch (error) {
      this.log(`Actor stop failed or timed out: ${actorId}`, error);
      throw error;
    } finally {
      this.actors.delete(actorId);
      this.actorConfigs.delete(actorId);
      this.log(`Actor removed: ${actorId}`);
    }
  }

  private calculateBackoff(restartCount: number): number {
    const factor = Math.pow(2, restartCount);
    const backoff = this.config.initialBackoff * factor;
    return Math.min(backoff, this.config.maxBackoff);
  }

  /**
   * ActorConfig 입력 검증
   * @param config 검증할 ActorConfig
   */
  private validateConfig(config: ActorConfig): void {
    if (!config.role) {
      throw new Error("Actor role is required");
    }
    if (!config.type || config.type.trim() === "") {
      throw new Error("Actor type is required");
    }
  }

  /**
   * RuntimeConfig 검증
   * @param config 검증할 RuntimeConfig
   */
  private validateRuntimeConfig(config: Required<RuntimeConfig>): void {
    if (config.maxActors <= 0) {
      throw new Error("maxActors must be positive");
    }
    if (config.spawnTimeout <= 0) {
      throw new Error("spawnTimeout must be positive");
    }
    if (config.stopTimeout <= 0) {
      throw new Error("stopTimeout must be positive");
    }
    if (config.maxRestarts < 0) {
      throw new Error("maxRestarts must be non-negative");
    }
    if (config.initialBackoff <= 0) {
      throw new Error("initialBackoff must be positive");
    }
    if (config.maxBackoff <= 0) {
      throw new Error("maxBackoff must be positive");
    }
  }

  private log(message: string, error?: unknown): void {
    if (!this.config.debug) return;

    if (error) {
      console.error(`[ActorRuntime] ${message}`, error);
    } else {
      console.log(`[ActorRuntime] ${message}`);
    }
  }
}
