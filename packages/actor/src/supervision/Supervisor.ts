import { EventEmitter } from 'events';
import type { ActorId, Actor } from '../types/actor';
import type { ActorRuntime } from '../runtime/ActorRuntime';
import {
  SupervisorConfig,
  RestartStrategy,
  RestartDirective,
  BackoffPolicy,
  RestartHistory,
  DeadLetter,
  SupervisorEvents,
} from './types';

/**
 * 기본 Supervisor 설정
 */
const DEFAULT_CONFIG: SupervisorConfig = {
  strategy: RestartStrategy.ONE_FOR_ONE,
  backoff: {
    policy: BackoffPolicy.EXPONENTIAL,
    initialDelay: 1000,
    maxDelay: 30000,
    multiplier: 2,
  },
  maxRestarts: 3,
  restartWindow: 60000, // 1분
  enableDeadLetterQueue: true,
  deadLetterQueueSize: 100,
  debug: false,
};

/**
 * Supervisor
 *
 * Actor의 실패를 감지하고 재시작 전략에 따라 복구합니다.
 */
export class Supervisor extends EventEmitter {
  private readonly config: SupervisorConfig;
  private readonly runtime: ActorRuntime;
  private readonly restartCounts: Map<ActorId, number>;
  private readonly restartTimestamps: Map<ActorId, Date[]>;
  private readonly restartHistory: RestartHistory[];
  private readonly deadLetterQueue: DeadLetter[];
  private readonly watchedActors: Set<ActorId>;
  private isRunning: boolean;

  constructor(runtime: ActorRuntime, config?: Partial<SupervisorConfig>) {
    super();
    this.runtime = runtime;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.restartCounts = new Map();
    this.restartTimestamps = new Map();
    this.restartHistory = [];
    this.deadLetterQueue = [];
    this.watchedActors = new Set();
    this.isRunning = false;
  }

  /**
   * Supervisor 시작
   */
  start(): void {
    if (this.isRunning) {
      throw new Error('Supervisor is already running');
    }
    this.isRunning = true;
    this.log('Supervisor started');
  }

  /**
   * Supervisor 종료
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }
    this.isRunning = false;
    this.watchedActors.clear();
    this.log('Supervisor stopped');
  }

  /**
   * Actor 감시 시작
   * @param actorId 감시할 Actor ID
   */
  watch(actorId: ActorId): void {
    if (!this.isRunning) {
      throw new Error('Supervisor is not running');
    }

    this.watchedActors.add(actorId);
    this.restartCounts.set(actorId, 0);
    this.restartTimestamps.set(actorId, []);

    this.log(`Watching actor: ${actorId}`);
  }

  /**
   * Actor 감시 종료
   * @param actorId 감시 종료할 Actor ID
   */
  unwatch(actorId: ActorId): void {
    this.watchedActors.delete(actorId);
    this.restartCounts.delete(actorId);
    this.restartTimestamps.delete(actorId);

    this.log(`Unwatched actor: ${actorId}`);
  }

  /**
   * Actor 실패 처리
   * @param actorId 실패한 Actor ID
   * @param error 실패 원인
   */
  async handleFailure(actorId: ActorId, error: Error): Promise<void> {
    if (!this.isRunning || !this.watchedActors.has(actorId)) {
      return;
    }

    this.log(`Actor failed: ${actorId} - ${error.message}`);
    this.emit('actor:failed', actorId, error);

    // 재시작 결정
    const directive = this.decideRestart(actorId, error);

    switch (directive) {
      case RestartDirective.RESTART:
        await this.performRestart(actorId, error);
        break;

      case RestartDirective.STOP:
        await this.performStop(actorId, 'Decider returned STOP');
        break;

      case RestartDirective.ESCALATE:
        this.escalate(actorId, error);
        break;
    }
  }

  /**
   * Dead Letter Queue 조회
   */
  getDeadLetters(): DeadLetter[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Dead Letter Queue 비우기
   */
  clearDeadLetters(): void {
    this.deadLetterQueue.length = 0;
  }

  /**
   * 재시작 이력 조회
   */
  getRestartHistory(actorId?: ActorId): RestartHistory[] {
    if (actorId) {
      return this.restartHistory.filter((h) => h.actorId === actorId);
    }
    return [...this.restartHistory];
  }

  /**
   * 감시 중인 Actor 목록
   */
  getWatchedActors(): ActorId[] {
    return Array.from(this.watchedActors);
  }

  // ==================== 내부 메서드 ====================

  /**
   * 재시작 결정
   */
  private decideRestart(actorId: ActorId, error: Error): RestartDirective {
    // 커스텀 decider가 있으면 사용
    if (this.config.decider) {
      try {
        const actor = this.runtime.getActor(actorId);
        if (actor) {
          return this.config.decider(error, actor);
        }
      } catch {
        // Actor를 찾을 수 없는 경우
      }
    }

    // 재시작 윈도우 내 횟수 확인
    const timestamps = this.restartTimestamps.get(actorId) || [];
    const now = Date.now();
    const windowStart = now - this.config.restartWindow;

    // 윈도우 내 재시작 횟수 계산
    const recentRestarts = timestamps.filter(
      (t) => t.getTime() > windowStart
    ).length;

    if (recentRestarts >= this.config.maxRestarts) {
      this.log(
        `Max restarts exceeded for ${actorId}: ${recentRestarts}/${this.config.maxRestarts}`
      );
      this.emit('max-restarts-exceeded', actorId);
      return RestartDirective.STOP;
    }

    return RestartDirective.RESTART;
  }

  /**
   * 재시작 수행
   */
  private async performRestart(actorId: ActorId, error: Error): Promise<void> {
    const attempt = (this.restartCounts.get(actorId) || 0) + 1;
    this.restartCounts.set(actorId, attempt);

    // 타임스탬프 기록
    const timestamps = this.restartTimestamps.get(actorId) || [];
    timestamps.push(new Date());
    this.restartTimestamps.set(actorId, timestamps);

    // 백오프 대기
    const delay = this.calculateBackoff(attempt);
    this.log(`Waiting ${delay}ms before restart (attempt ${attempt})`);
    await this.delay(delay);

    try {
      // 전략에 따른 재시작
      switch (this.config.strategy) {
        case RestartStrategy.ONE_FOR_ONE:
          await this.restartOne(actorId);
          break;

        case RestartStrategy.ALL_FOR_ONE:
          await this.restartAll();
          break;

        case RestartStrategy.REST_FOR_ONE:
          await this.restartRest(actorId);
          break;
      }

      // 이력 기록
      this.recordHistory(actorId, error, attempt, true);
      this.emit('actor:restarted', actorId, attempt);

      this.log(`Actor restarted: ${actorId} (attempt ${attempt})`);
    } catch (restartError) {
      // 재시작 실패
      this.recordHistory(actorId, error, attempt, false);

      // Dead Letter Queue에 추가
      if (this.config.enableDeadLetterQueue) {
        this.addDeadLetter(actorId, restartError as Error, attempt);
      }

      // 재귀적으로 다시 시도
      await this.handleFailure(actorId, restartError as Error);
    }
  }

  /**
   * OneForOne: 해당 Actor만 재시작
   */
  private async restartOne(actorId: ActorId): Promise<void> {
    await this.runtime.restart(actorId);
  }

  /**
   * AllForOne: 모든 감시 중인 Actor 재시작
   */
  private async restartAll(): Promise<void> {
    const restartPromises = Array.from(this.watchedActors).map((id) =>
      this.runtime.restart(id).catch((err) => {
        this.log(`Failed to restart ${id}: ${err.message}`);
      })
    );

    await Promise.all(restartPromises);
  }

  /**
   * RestForOne: 해당 Actor와 이후 생성된 Actor들 재시작
   */
  private async restartRest(actorId: ActorId): Promise<void> {
    const actorIds = Array.from(this.watchedActors);
    const index = actorIds.indexOf(actorId);

    if (index === -1) {
      return;
    }

    // 해당 Actor와 이후 Actor들 재시작
    const toRestart = actorIds.slice(index);
    const restartPromises = toRestart.map((id) =>
      this.runtime.restart(id).catch((err) => {
        this.log(`Failed to restart ${id}: ${err.message}`);
      })
    );

    await Promise.all(restartPromises);
  }

  /**
   * 정지 수행
   */
  private async performStop(actorId: ActorId, reason: string): Promise<void> {
    this.log(`Stopping actor permanently: ${actorId} - ${reason}`);

    try {
      await this.runtime.stop(actorId);
    } catch {
      // 이미 정지됨
    }

    this.unwatch(actorId);
    this.emit('actor:stopped', actorId, reason);
  }

  /**
   * 에스컬레이션
   */
  private escalate(actorId: ActorId, error: Error): void {
    this.log(`Escalating failure for ${actorId}: ${error.message}`);

    // 상위 Supervisor에게 전달 (구현에 따라 다름)
    // 여기서는 이벤트로 처리
    this.emit('escalate', actorId, error);
  }

  /**
   * 백오프 계산
   */
  private calculateBackoff(attempt: number): number {
    const {
      policy,
      initialDelay,
      maxDelay,
      multiplier = 2,
      jitterFactor = 0.1,
    } = this.config.backoff;

    let delay: number;

    switch (policy) {
      case BackoffPolicy.FIXED:
        delay = initialDelay;
        break;

      case BackoffPolicy.LINEAR:
        delay = initialDelay * attempt;
        break;

      case BackoffPolicy.EXPONENTIAL:
        delay = initialDelay * Math.pow(multiplier, attempt - 1);
        break;

      case BackoffPolicy.EXPONENTIAL_JITTER: {
        const base = initialDelay * Math.pow(multiplier, attempt - 1);
        const jitter = base * jitterFactor * (Math.random() * 2 - 1);
        delay = base + jitter;
        break;
      }

      default:
        delay = initialDelay;
    }

    return Math.min(delay, maxDelay);
  }

  /**
   * 이력 기록
   */
  private recordHistory(
    actorId: ActorId,
    error: Error,
    attempt: number,
    success: boolean
  ): void {
    this.restartHistory.push({
      actorId,
      timestamp: new Date(),
      error,
      attempt,
      success,
    });

    // 최근 100개만 유지
    if (this.restartHistory.length > 100) {
      this.restartHistory.shift();
    }
  }

  /**
   * Dead Letter 추가
   */
  private addDeadLetter(
    actorId: ActorId,
    error: Error,
    retryCount: number
  ): void {
    const letter: DeadLetter = {
      payload: null, // 실제 구현에서는 실패한 메시지 포함
      actorId,
      error,
      timestamp: new Date(),
      retryCount,
    };

    this.deadLetterQueue.push(letter);

    // 최대 크기 유지
    const maxSize = this.config.deadLetterQueueSize || 100;
    while (this.deadLetterQueue.length > maxSize) {
      this.deadLetterQueue.shift();
    }

    this.emit('dead-letter', letter);
    this.log(`Dead letter added for ${actorId}`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private log(message: string): void {
    if (!this.config.debug) return;
    console.log(`[Supervisor] ${message}`);
  }
}
