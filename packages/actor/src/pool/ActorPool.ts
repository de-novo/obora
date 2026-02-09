import type { ActorFactory, ActorConfig } from "../runtime/types";
import type { Actor, ActorId, ActorRole, ActorStatus } from "../types/actor";
import type { IBlackboard } from "../types/actor";
import type { IMessageBus, Message, MessageType, UnsubscribeFn } from "../types/message";

/**
 * No-Op MessageBus - 기본값으로 사용되는 빈 구현
 */
class NoOpMessageBus implements IMessageBus {
  send(message: Message): void {}
  sendTo(to: ActorId, message: Omit<Message, "to">): void {}
  broadcast(message: Omit<Message, "to">): void {}
  receive(handler: (message: Message) => void): void {}
  request<T>(message: Message, timeoutMs?: number): Promise<Message<T>> {
    return Promise.resolve(message as Message<T>);
  }
  subscribe(messageType: MessageType, handler: (message: Message) => void): UnsubscribeFn {
    return () => {};
  }
  getQueueSize(actorId: ActorId): number {
    return 0;
  }
  clearQueue(actorId: ActorId): void {}
  filter(predicate: (message: Message) => boolean): Message[] {
    return [];
  }
}

/**
 * Actor Pool 설정
 */
export interface PoolConfig {
  /** 풀 이름 */
  name: string;

  /** Actor 역할 (풀 내 모든 Actor는 동일 역할) */
  role: ActorRole;

  /** Actor 유형 */
  type: string;

  /** 초기 Actor 수 */
  initialSize?: number;

  /** 최소 Actor 수 */
  minSize?: number;

  /** 최대 Actor 수 */
  maxSize?: number;

  /** Idle 타임아웃 (ms) - 지정 시간 동안 작업 없으면 Actor 종료 */
  idleTimeout?: number;

  /** 확장 전략 */
  scaleStrategy?: "fixed" | "dynamic" | "adaptive";

  /** 작업 분배 전략 */
  dispatchStrategy?: "round-robin" | "least-busy" | "random";

  /** 작업 큐 최대 크기 */
  maxQueueSize?: number;

  /** 작업 대기 타임아웃 (ms) */
  taskTimeout?: number;

  /** 디버그 모드 */
  debug?: boolean;
}

/**
 * 작업
 */
export interface Task<T = unknown> {
  /** 작업 ID */
  id: string;

  /** 작업 데이터 */
  data: T;

  /** 생성 시간 */
  createdAt: Date;

  /** 우선순위 (높을수록 우선) */
  priority: number;

  /** 만료 시간 */
  expiresAt?: Date;

  /** 완료 콜백 */
  onComplete?: (result: unknown, error?: Error) => void;
}

/**
 * 작업 결과
 */
export interface TaskResult {
  /** 작업 ID */
  taskId: string;

  /** 처리한 Actor ID */
  actorId: ActorId;

  /** 결과 데이터 */
  result: unknown;

  /** 에러 (실패 시) */
  error?: Error;

  /** 시작 시간 */
  startedAt: Date;

  /** 완료 시간 */
  completedAt: Date;

  /** 실행 시간 (ms) */
  duration: number;
}

/**
 * Actor Pool 메트릭
 */
export interface PoolMetrics {
  /** 총 Actor 수 */
  totalActors: number;

  /** 활성 Actor 수 */
  activeActors: number;

  /** Idle 상태 Actor 수 */
  idleActors: number;

  /** 에러 상태 Actor 수 */
  errorActors: number;

  /** 대기열 크기 */
  queueSize: number;

  /** 평균 대기 시간 (ms) */
  averageQueueTime: number;

  /** 처리량 */
  throughput: {
    messagesPerSecond: number;
    actionsPerSecond: number;
  };

  /** 이용률 (0.0 ~ 1.0) */
  utilization: number;
}

/**
 * Actor Pool
 *
 * 동적으로 확장/축소 가능한 Actor 풀을 관리하고,
 * 작업을 분배하여 효율적인 리소스 사용을 제공합니다.
 */
export class ActorPool {
  private readonly config: Required<PoolConfig>;
  private readonly board: IBlackboard;
  private readonly messageBus: IMessageBus;
  private readonly factory: ActorFactory;
  private readonly actors: Map<ActorId, Actor>;
  private readonly taskQueue: Task[];
  private readonly inProgress: Map<string, { task: Task; actorId: ActorId }>;
  private readonly completedTasks: TaskResult[];
  private readonly pendingResults: Map<string, TaskResult>;
  private readonly waitingTasks: Set<string>;
  private readonly actorConfigs: Map<ActorId, ActorConfig>;
  private readonly idleTimers: Map<ActorId, ReturnType<typeof setTimeout>>;
  private readonly metrics: PoolMetrics;
  private isRunning: boolean;
  private roundRobinIndex: number;
  private scaleTimer?: ReturnType<typeof setInterval>;
  private dispatchTimer?: ReturnType<typeof setInterval>;

  constructor(
    config: PoolConfig,
    board: IBlackboard,
    factory: ActorFactory,
    messageBus: IMessageBus = new NoOpMessageBus()
  ) {
    this.board = board;
    this.messageBus = messageBus;
    this.factory = factory;
    this.actors = new Map();
    this.taskQueue = [];
    this.inProgress = new Map();
    this.completedTasks = [];
    this.pendingResults = new Map();
    this.waitingTasks = new Set();
    this.actorConfigs = new Map();
    this.idleTimers = new Map();
    this.isRunning = false;
    this.roundRobinIndex = 0;

    // 기본 설정
    const defaults: Required<PoolConfig> = {
      name: config.name,
      role: config.role,
      type: config.type,
      initialSize: config.initialSize ?? 3,
      minSize: config.minSize ?? 1,
      maxSize: config.maxSize ?? 10,
      idleTimeout: config.idleTimeout ?? 30000,
      scaleStrategy: config.scaleStrategy ?? "dynamic",
      dispatchStrategy: config.dispatchStrategy ?? "round-robin",
      maxQueueSize: config.maxQueueSize ?? 100,
      taskTimeout: config.taskTimeout ?? 30000,
      debug: config.debug ?? false,
    };
    this.config = defaults;

    // 설정 검증
    this.validateConfig(defaults);

    // 메트릭 초기화
    this.metrics = {
      totalActors: 0,
      activeActors: 0,
      idleActors: 0,
      errorActors: 0,
      queueSize: 0,
      averageQueueTime: 0,
      throughput: {
        messagesPerSecond: 0,
        actionsPerSecond: 0,
      },
      utilization: 0,
    };
  }

  /**
   * 풀 시작
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Pool is already running");
    }

    this.isRunning = true;

    // 초기 Actor 생성
    await this.scaleTo(this.config.initialSize);

    // 작업 분배 시작
    this.startDispatch();

    // 자동 스케일링 시작 (dynamic/adaptive 모드)
    if (this.config.scaleStrategy !== "fixed") {
      this.startAutoScale();
    }

    this.log(`Pool started: ${this.config.name} (${this.config.initialSize} actors)`);
  }

  /**
   * 풀 종료
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // 타이머 정리
    this.clearTimers();

    // Idle 타이머 정리
    this.idleTimers.forEach((timer) => clearTimeout(timer));
    this.idleTimers.clear();

    // 모든 Actor 중지
    const stopPromises = Array.from(this.actors.values()).map((actor) => actor.stop());
    await Promise.allSettled(stopPromises);

    // 정리
    this.actors.clear();
    this.actorConfigs.clear();
    this.taskQueue.length = 0;
    this.inProgress.clear();
    this.pendingResults.clear();
    this.waitingTasks.clear();

    // 메트릭 리셋
    this.metrics.totalActors = 0;
    this.metrics.activeActors = 0;
    this.metrics.idleActors = 0;

    this.log(`Pool stopped: ${this.config.name}`);
  }

  /**
   * 작업 제출
   * @param data 작업 데이터
   * @param priority 우선순위 (높을수록 우선)
   * @param expiresIn 만료 시간 (ms, 선택)
   * @returns 작업 ID
   */
  async submit<T = unknown>(data: T, priority: number = 0, expiresIn?: number): Promise<string> {
    if (!this.isRunning) {
      throw new Error("Pool is not running");
    }

    // 큐 크기 체크
    if (this.taskQueue.length >= this.config.maxQueueSize) {
      throw new Error(`Task queue is full: ${this.config.maxQueueSize}`);
    }

    const now = new Date();
    const expiresAt = expiresIn
      ? new Date(now.getTime() + expiresIn)
      : this.config.taskTimeout > 0
        ? new Date(now.getTime() + this.config.taskTimeout)
        : undefined;

    const task: Task<T> = {
      id: crypto.randomUUID(),
      data,
      createdAt: now,
      priority,
      expiresAt,
    };

    // 우선순위 순으로 삽입
    this.enqueueTask(task);

    this.log(`Task submitted: ${task.id} (priority: ${priority})`);

    return task.id;
  }

  /**
   * 작업 제출 및 결과 대기
   * @param data 작업 데이터
   * @param priority 우선순위
   * @returns 작업 결과
   */
  async submitAndWait<T = unknown, R = unknown>(data: T, priority: number = 0): Promise<R> {
    const taskId = await this.submit(data, priority);

    // 대기 중인 작업으로 등록 (recordTaskResult에서 pendingResults에 저장하도록)
    this.waitingTasks.add(taskId);

    return new Promise<R>((resolve, reject) => {
      let waiter: { cleanup: () => void } | null = null;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      let settled = false;

      // 모든 리소스 정리
      const cleanup = () => {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        waiter?.cleanup();
        // 대기 목록에서 제거
        this.waitingTasks.delete(taskId);
      };

      // taskTimeout <= 0이면 무제한 대기 (타임아웃 없음)
      if (this.config.taskTimeout > 0) {
        timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();

          // 타임아웃 시 큐에서도 제거
          const queueIndex = this.taskQueue.findIndex((t) => t.id === taskId);
          if (queueIndex !== -1) {
            this.taskQueue.splice(queueIndex, 1);
            this.metrics.queueSize = this.taskQueue.length;
          }
          // inProgress에서는 제거하지 않음 (작업 중인 경우 완료까지 대기)
          // 대신 타임아웃 에러를 reject
          reject(new Error(`Task timeout: ${taskId}`));
        }, this.config.taskTimeout);
      }

      waiter = this.waitForTaskResult(
        taskId,
        () => {
          if (settled) return;
          settled = true;
          cleanup();
        },
        resolve,
        reject
      );
    });
  }

  /**
   * 풀 크기 조정
   * @param size 목표 크기
   */
  async scaleTo(size: number): Promise<void> {
    const targetSize = Math.max(this.config.minSize, Math.min(size, this.config.maxSize));
    const currentSize = this.actors.size;

    if (targetSize === currentSize) {
      return;
    }

    this.log(`Scaling pool: ${currentSize} → ${targetSize}`);

    if (targetSize > currentSize) {
      // 확장
      const diff = targetSize - currentSize;
      for (let i = 0; i < diff; i++) {
        await this.spawnActor();
      }
    } else {
      // 축소
      const diff = currentSize - targetSize;
      await this.removeIdleActors(diff);
    }
  }

  /**
   * 풀 크기 증가
   * @param count 증가할 Actor 수
   */
  async scaleUp(count: number = 1): Promise<void> {
    const newSize = Math.min(this.actors.size + count, this.config.maxSize);
    await this.scaleTo(newSize);
  }

  /**
   * 풀 크기 감소
   * @param count 감소할 Actor 수
   */
  async scaleDown(count: number = 1): Promise<void> {
    const newSize = Math.max(this.actors.size - count, this.config.minSize);
    await this.scaleTo(newSize);
  }

  /**
   * 풀 메트릭 조회
   */
  getMetrics(): PoolMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Actor 목록 조회
   */
  getActors(): ActorId[] {
    return Array.from(this.actors.keys());
  }

  /**
   * Actor 상태 조회
   */
  getActorStatus(actorId: ActorId): ActorStatus {
    const actor = this.actors.get(actorId);
    if (!actor) {
      throw new Error(`Actor not found: ${actorId}`);
    }
    return actor.getStatus();
  }

  /**
   * 풀 이름
   */
  get name(): string {
    return this.config.name;
  }

  // ==================== 내부 메서드 ====================

  private validateConfig(config: Required<PoolConfig>): void {
    if (!config.name || config.name.trim() === "") {
      throw new Error("Pool name is required");
    }
    if (!config.role) {
      throw new Error("Pool role is required");
    }
    if (!config.type || config.type.trim() === "") {
      throw new Error("Pool type is required");
    }
    if (config.minSize < 0) {
      throw new Error("minSize must be non-negative");
    }
    if (config.maxSize < config.minSize) {
      throw new Error("maxSize must be >= minSize");
    }
    if (config.initialSize < config.minSize || config.initialSize > config.maxSize) {
      throw new Error("initialSize must be between minSize and maxSize");
    }
  }

  private async spawnActor(): Promise<Actor> {
    const uuid = crypto.randomUUID();
    const id = `${this.config.role}-${uuid}` as ActorId;
    const config: ActorConfig = {
      id,
      name: `${this.config.name}-${uuid.slice(0, 8)}`,
      role: this.config.role,
      type: this.config.type,
    };

    this.actorConfigs.set(id, config);

    const actor = await this.factory.create(config, this.board, this.messageBus);
    await actor.start();
    this.actors.set(id, actor);

    // Idle 타이머 시작
    this.startIdleTimer(id);

    // 메트릭 업데이트
    this.metrics.totalActors = this.actors.size;
    this.metrics.idleActors++;

    this.log(`Actor spawned: ${id}`);
    return actor;
  }

  private async removeIdleActors(count: number): Promise<void> {
    let removed = 0;

    for (const [id] of this.actors.entries()) {
      if (removed >= count) break;

      // Idle 상태인 Actor만 제거 (작업 중이 아닌)
      if (!this.isActorBusy(id)) {
        await this.removeActor(id);
        removed++;
      }
    }
  }

  private async removeActor(actorId: ActorId): Promise<void> {
    const actor = this.actors.get(actorId);
    if (!actor) return;

    // Idle 타이머 정리
    const timer = this.idleTimers.get(actorId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(actorId);
    }

    // Actor 종료
    await actor.stop();
    this.actors.delete(actorId);
    this.actorConfigs.delete(actorId);

    // 메트릭 업데이트
    this.metrics.totalActors = this.actors.size;
    if (!this.isActorBusy(actorId)) {
      this.metrics.idleActors = Math.max(0, this.metrics.idleActors - 1);
    }

    this.log(`Actor removed: ${actorId}`);
  }

  private selectActor(): Actor | null {
    const idleActors = Array.from(this.actors.entries())
      .filter(([id]) => !this.isActorBusy(id))
      .map(([, actor]) => actor);

    if (idleActors.length === 0) {
      return null;
    }

    switch (this.config.dispatchStrategy) {
      case "round-robin":
        return this.selectRoundRobin(idleActors);
      case "least-busy":
        return this.selectLeastBusy(idleActors);
      case "random":
        return this.selectRandom(idleActors);
      default:
        return idleActors[0];
    }
  }

  private selectRoundRobin(actors: Actor[]): Actor {
    const index = this.roundRobinIndex % actors.length;
    this.roundRobinIndex++;
    return actors[index];
  }

  private selectLeastBusy(actors: Actor[]): Actor {
    return actors.reduce((least, actor) => {
      const leastStatus = least.getStatus();
      const actorStatus = actor.getStatus();
      const leastQueue = leastStatus.messageQueue.pending;
      const actorQueue = actorStatus.messageQueue.pending;
      return actorQueue < leastQueue ? actor : least;
    });
  }

  private selectRandom(actors: Actor[]): Actor {
    const index = Math.floor(Math.random() * actors.length);
    return actors[index];
  }

  private async dispatchTaskToActor(task: Task, actor: Actor): Promise<void> {
    this.inProgress.set(task.id, { task, actorId: actor.id });

    // Idle 타이머 리셋
    this.resetIdleTimer(actor.id);

    // 메트릭 업데이트
    this.metrics.idleActors = Math.max(0, this.metrics.idleActors - 1);
    this.metrics.activeActors++;

    this.log(`Task ${task.id} → Actor ${actor.id}`);

    try {
      const startTime = Date.now();

      // 작업 데이터를 blackboard에 기록 (Actor가 observe()에서 읽을 수 있도록)
      // task별 고유 키 사용하여 병렬 처리 시 충돌 방지
      const taskSection = `pool:${this.config.name}:task:${task.id}`;
      this.board.write(taskSection, {
        taskId: task.id,
        actorId: actor.id,
        data: task.data,
        priority: task.priority,
        createdAt: task.createdAt,
      });

      // 작업 실행 (Actor의 OODA 루프)
      const obs = await actor.observe();
      const action = await actor.think(obs);
      const result = await actor.act(action);
      await actor.report(result);

      const duration = Date.now() - startTime;

      // 결과 기록
      const taskResult: TaskResult = {
        taskId: task.id,
        actorId: actor.id,
        result: result.output,
        error: result.error ? new Error(result.error) : undefined,
        startedAt: new Date(startTime),
        completedAt: new Date(),
        duration,
      };

      this.recordTaskResult(taskResult);

      // 콜백 호출
      task.onComplete?.(result.output, taskResult.error);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.log(`Task ${task.id} failed`, err);

      const taskResult: TaskResult = {
        taskId: task.id,
        actorId: actor.id,
        result: null,
        error: err,
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 0,
      };

      this.recordTaskResult(taskResult);
      task.onComplete?.(null, err);
    } finally {
      this.inProgress.delete(task.id);
      this.metrics.activeActors = Math.max(0, this.metrics.activeActors - 1);
      this.metrics.idleActors++;
      this.resetIdleTimer(actor.id);
    }
  }

  private recordTaskResult(result: TaskResult): void {
    // 메트릭용 히스토리에 저장 (최근 1000개 유지)
    this.completedTasks.push(result);

    // 대기 중인 작업만 결과 캐시에 저장 (submit만 호출된 경우 제외)
    if (this.waitingTasks.has(result.taskId)) {
      this.pendingResults.set(result.taskId, result);
    }

    // 최근 1초 내 완료된 작업 수로 throughput 계산
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const recentCompletions = this.completedTasks.filter(
      (r) => r.completedAt.getTime() >= oneSecondAgo
    ).length;

    this.metrics.throughput.actionsPerSecond = recentCompletions;

    // 메트릭용 히스토리 크기 제한 (최근 1000개 유지)
    if (this.completedTasks.length > 1000) {
      this.completedTasks.shift();
    }
  }

  private enqueueTask(task: Task): void {
    // 우선순위 순으로 삽입
    let inserted = false;
    for (let i = 0; i < this.taskQueue.length; i++) {
      if (task.priority > this.taskQueue[i].priority) {
        this.taskQueue.splice(i, 0, task);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.taskQueue.push(task);
    }

    this.metrics.queueSize = this.taskQueue.length;
  }

  private startDispatch(): void {
    this.dispatchTimer = setInterval(() => {
      while (this.taskQueue.length > 0) {
        // 먼저 만료된 작업을 큐 앞에서 제거
        const peek = this.taskQueue[0];
        if (peek.expiresAt && peek.expiresAt.getTime() < Date.now()) {
          this.taskQueue.shift();
          this.metrics.queueSize = this.taskQueue.length;
          this.log(`Task expired: ${peek.id}`);
          const expiredError = new Error(`Task expired: ${peek.id}`);
          const taskResult: TaskResult = {
            taskId: peek.id,
            actorId: "" as ActorId,
            result: null,
            error: expiredError,
            startedAt: new Date(),
            completedAt: new Date(),
            duration: 0,
          };
          this.recordTaskResult(taskResult);
          peek.onComplete?.(null, expiredError);
          continue;
        }

        // 사용 가능한 Actor가 없으면 중단
        const actor = this.selectActor();
        if (!actor) break;

        const task = this.taskQueue.shift()!;
        this.metrics.queueSize = this.taskQueue.length;
        this.dispatchTaskToActor(task, actor);
      }
    }, 100); // 100ms마다 체크
  }

  private startAutoScale(): void {
    this.scaleTimer = setInterval(() => {
      this.autoScale();
    }, 5000); // 5초마다 체크
  }

  private autoScale(): void {
    if (this.config.scaleStrategy === "fixed") {
      return;
    }

    const queueLength = this.taskQueue.length;
    const totalActors = this.metrics.totalActors;
    const idleRatio = totalActors > 0 ? this.metrics.idleActors / totalActors : 1;

    if (this.config.scaleStrategy === "dynamic") {
      if (queueLength > 2 && totalActors < this.config.maxSize) {
        this.scaleUp();
      } else if (idleRatio > 0.5 && totalActors > this.config.minSize) {
        this.scaleDown();
      }
    } else if (this.config.scaleStrategy === "adaptive") {
      if (queueLength > 5 && totalActors < this.config.maxSize) {
        this.scaleUp();
      } else if (idleRatio > 0.7 && totalActors > this.config.minSize) {
        this.scaleDown();
      }
    }
  }

  private startIdleTimer(actorId: ActorId): void {
    const timer = setTimeout(() => {
      // busy 상태면 제거하지 않음
      if (this.isActorBusy(actorId)) {
        // 타이머 재시작
        this.startIdleTimer(actorId);
        return;
      }

      // 최소 크기 유지 체크
      if (this.metrics.totalActors > this.config.minSize) {
        this.removeActor(actorId);
      }
    }, this.config.idleTimeout);

    this.idleTimers.set(actorId, timer);
  }

  private resetIdleTimer(actorId: ActorId): void {
    const timer = this.idleTimers.get(actorId);
    if (timer) {
      clearTimeout(timer);
    }
    this.startIdleTimer(actorId);
  }

  private isActorBusy(actorId: ActorId): boolean {
    for (const { actorId: busyId } of this.inProgress.values()) {
      if (busyId === actorId) {
        return true;
      }
    }
    return false;
  }

  private waitForTaskResult<T>(
    taskId: string,
    onSettled: () => void,
    resolve: (value: T) => void,
    reject: (reason?: unknown) => void
  ): { cleanup: () => void } {
    const checkInterval = setInterval(() => {
      // Pool이 종료되면 즉시 reject
      if (!this.isRunning) {
        clearInterval(checkInterval);
        onSettled();
        reject(new Error("Pool has been stopped"));
        return;
      }
      const result = this.pendingResults.get(taskId);
      if (result) {
        // 메모리 최적화: 사용된 결과 캐시에서 제거
        // (메트릭용 completedTasks는 유지됨)
        this.pendingResults.delete(taskId);

        clearInterval(checkInterval);
        onSettled();

        if (result.error) {
          reject(result.error);
        } else {
          resolve(result.result as T);
        }
      }
    }, 100);

    // cleanup 함수 반환
    return {
      cleanup: () => {
        clearInterval(checkInterval);
      },
    };
  }

  private clearTimers(): void {
    if (this.scaleTimer) {
      clearInterval(this.scaleTimer);
      this.scaleTimer = undefined;
    }
    if (this.dispatchTimer) {
      clearInterval(this.dispatchTimer);
      this.dispatchTimer = undefined;
    }
  }

  private updateMetrics(): void {
    this.metrics.totalActors = this.actors.size;
    this.metrics.queueSize = this.taskQueue.length;

    // 이용률 계산
    if (this.metrics.totalActors > 0) {
      this.metrics.utilization = this.metrics.activeActors / this.metrics.totalActors;
    } else {
      this.metrics.utilization = 0;
    }

    // 평균 대기 시간 계산
    // 최근 작업들의 duration으로 대략적인 처리 시간 추정
    if (this.completedTasks.length > 0) {
      const recentTasks = this.completedTasks.slice(-100);
      const avgDuration = recentTasks.reduce((sum, t) => sum + t.duration, 0) / recentTasks.length;
      // 큐 크기 기반 예상 대기 시간
      this.metrics.averageQueueTime = this.taskQueue.length * avgDuration;
    } else {
      // 완료된 작업이 없으면 0으로 리셋
      this.metrics.averageQueueTime = 0;
    }
  }

  private log(message: string, error?: unknown): void {
    // 에러는 항상 출력 (debug 옵션 무관)
    if (error) {
      console.error(`[ActorPool:${this.config.name}] ${message}`, error);
      return;
    }

    // 일반 로그는 debug 모드에서만
    if (!this.config.debug) return;
    console.log(`[ActorPool:${this.config.name}] ${message}`);
  }
}
