<debate>
  <role>
    당신은 4개 AI 모델의 코드 리뷰 결과를 종합하는 최종 심판입니다.
    각 모델의 리뷰를 분석하고, 이슈별로 유효성을 판정하세요.
  </role>

  <instructions>
    1. 모든 모델의 리뷰를 읽고 발견된 이슈를 전부 나열하세요
    2. 이슈별로:
       - 어떤 모델이 발견했는지
       - 근거가 타당한지 (코드를 직접 확인)
       - 최종 판정: P0/P1/P2 확정 또는 기각
    3. 1개 모델만 발견한 이슈도 근거가 타당하면 채택하세요
    4. 근거 부족한 이슈는 기각하세요
    5. 확정된 P0/P1 이슈에 대해 구체적 수정 지시를 생성하세요
    6. 4모델의 점수를 종합하여 최종 점수를 산출하세요
  </instructions>

  <output_format>
# 토론 결과

## 최종 점수
- **종합 점수: X/10**

## 확정된 이슈

### [P0/P1/P2] 이슈 제목
- **판정 근거**: 어떤 모델이 발견, 왜 유효한지
- **동의 모델**: opus, codex 등
- **함수**: 클래스명.메서드명()
- **문제점**: 구체적 설명
- **수정 지시**:
  1. 구체적 수정 단계
  2. 수정 후 예상 동작
- **수정 전 코드**:
```
현재 코드
```
- **수정 후 코드**:
```
수정된 코드
```

## 기각된 이슈

### 이슈 제목
- **기각 이유**: 왜 유효하지 않은지
- **발견 모델**: 어떤 모델이 제기했는지

## Fixer 지시사항
확정된 P0/P1 이슈만 아래 순서대로 수정하세요:
1. (첫 번째 수정할 이슈)
2. (두 번째 수정할 이슈)
...
P2 이슈는 수정하지 마세요.
  </output_format>

  <task_spec><![CDATA[
# TASK-026: Actor Pool 관리

## 개요
- **상태**: 📋 대기
- 우선순위: P1
- 예상 소요: 8시간
- 담당: 개발자
- Phase: Week 3-4

## 목표
Actor Pool을 구현하여 동적 확장/축소와 작업 분배를 통해 효율적인 리소스 관리를 제공합니다.

## 작업 내용

### 1. ActorPool 클래스 정의

**파일:** `packages/actor/src/pool/ActorPool.ts`

#### 기본 인터페이스

```typescript
import { Actor, ActorId, ActorRole, ActorLifecycleStatus, ActorStatus } from '../types/actor';
import { Blackboard } from '../types/blackboard';
import { ActorConfig, ActorFactory } from '../runtime/types';

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
  scaleStrategy?: 'fixed' | 'dynamic' | 'adaptive';

  /** 작업 분배 전략 */
  dispatchStrategy?: 'round-robin' | 'least-busy' | 'random';

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
 * Actor Pool 메트릭 (스펙 기준)
 *
 * 참고: [[spec/13-actor.md|13-actor.md]]
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
  private readonly board: Blackboard;
  private readonly factory: ActorFactory;
  private readonly actors: Map<ActorId, Actor>;
  private readonly taskQueue: Task[];
  private readonly inProgress: Map<string, Task>;
  private readonly completedTasks: TaskResult[];
  private readonly metrics: PoolMetrics;
  private readonly actorConfigs: Map<ActorId, ActorConfig>;
  private isRunning: boolean;
  private roundRobinIndex: number;
  private idleTimers: Map<ActorId, NodeJS.Timeout>;
  private scaleTimer?: NodeJS.Timeout;
  private dispatchTimer?: NodeJS.Timeout;

  constructor(config: PoolConfig, board: Blackboard, factory: ActorFactory) {
    this.board = board;
    this.factory = factory;
    this.actors = new Map();
    this.taskQueue = [];
    this.inProgress = new Map();
    this.completedTasks = [];
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
      idleTimeout: config.idleTimeout ?? 30000, // 30초
      scaleStrategy: config.scaleStrategy ?? 'dynamic',
      dispatchStrategy: config.dispatchStrategy ?? 'round-robin',
      maxQueueSize: config.maxQueueSize ?? 100,
      taskTimeout: config.taskTimeout ?? 30000,
      debug: config.debug ?? false,
    };
    this.config = defaults;

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
      throw new Error('Pool is already running');
    }

    this.isRunning = true;

    // 초기 Actor 생성
    await this.scaleTo(this.config.initialSize);

    // 작업 분배 시작
    this.startDispatch();

    // 자동 스케일링 시작 (dynamic/adaptive 모드)
    if (this.config.scaleStrategy !== 'fixed') {
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
    const stopPromises = Array.from(this.actors.values()).map((actor) =>
      actor.stop()
    );
    await Promise.allSettled(stopPromises);

    // 큐 정리
    this.taskQueue.length = 0;
    this.inProgress.clear();

    this.log(`Pool stopped: ${this.config.name}`);
  }

  /**
   * 작업 제출
   * @param data 작업 데이터
   * @param priority 우선순위 (높을수록 우선)
   * @returns 작업 ID
   */
  async submit<T = unknown>(
    data: T,
    priority: number = 0
  ): Promise<string> {
    if (!this.isRunning) {
      throw new Error('Pool is not running');
    }

    // 큐 크기 체크
    if (this.taskQueue.length >= this.config.maxQueueSize) {
      throw new Error(`Task queue is full: ${this.config.maxQueueSize}`);
    }

    const task: Task<T> = {
      id: crypto.randomUUID(),
      data,
      createdAt: new Date(),
      priority,
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
  async submitAndWait<T = unknown, R = unknown>(
    data: T,
    priority: number = 0
  ): Promise<R> {
    const taskId = await this.submit(data, priority);

    return new Promise<R>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.inProgress.delete(taskId);
        reject(new Error(`Task timeout: ${taskId}`));
      }, this.config.taskTimeout);

      // 결과 기다림 (실제로는 이벤트 기반으로 구현)
      this.waitForTaskResult(taskId, timeout, resolve, reject);
    });
  }

  /**
   * 풀 크기 조정
   * @param size 목표 크기
   */
  async scaleTo(size: number): Promise<void> {
    const currentSize = this.actors.size;

    if (size === currentSize) {
      return;
    }

    this.log(`Scaling pool: ${currentSize} → ${size}`);

    if (size > currentSize) {
      // 확장
      const diff = size - currentSize;
      for (let i = 0; i < diff; i++) {
        await this.spawnActor();
      }
    } else {
      // 축소 (최소 크기 보장)
      const targetSize = Math.max(size, this.config.minSize);
      if (targetSize < currentSize) {
        const diff = currentSize - targetSize;
        await this.removeIdleActors(diff);
      }
    }
  }

  /**
   * 풀 크기 증가
   * @param count 증가할 Actor 수
   */
  async scaleUp(count: number = 1): Promise<void> {
    const newSize = Math.min(
      this.actors.size + count,
      this.config.maxSize
    );
    await this.scaleTo(newSize);
  }

  /**
   * 풀 크기 감소
   * @param count 감소할 Actor 수
   */
  async scaleDown(count: number = 1): Promise<void> {
    const newSize = Math.max(
      this.actors.size - count,
      this.config.minSize
    );
    await this.scaleTo(newSize);
  }

  /**
   * 풀 메트릭 조회
   */
  getMetrics(): PoolMetrics {
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

  // ==================== 내부 메서드 ====================

  private async spawnActor(): Promise<Actor> {
    const id = this.generateActorId();
    const config: ActorConfig = {
      id,
      role: this.config.role,
      type: this.config.type,
    };

    this.actorConfigs.set(id, config);

    const actor = this.factory.create(config, this.board);
    this.actors.set(id, actor);

    // Actor 시작
    actor['setStatus']('running' as ActorLifecycleStatus);

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

    for (const [id, actor] of this.actors.entries()) {
      if (removed >= count) break;

      // Idle 상태인 Actor만 제거
      if (actor.status === 'running' && !this.isActorBusy(id)) {
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
    this.metrics.idleActors--;

    this.log(`Actor removed: ${actorId}`);
  }

  private selectActor(): Actor | null {
    const idleActors = Array.from(this.actors.values()).filter((actor) =>
      this.isActorAvailable(actor.id)
    );

    if (idleActors.length === 0) {
      return null;
    }

    switch (this.config.dispatchStrategy) {
      case 'round-robin':
        return this.selectRoundRobin(idleActors);
      case 'least-busy':
        return this.selectLeastBusy(idleActors);
      case 'random':
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

  /**
   * Least Loaded 전략 (스펙 기준: Least Loaded)
   *
   * 대기열 크기가 가장 적은 Actor를 선택합니다.
   *
   * 참고: [[spec/13-actor.md|13-actor.md]] - LoadBalancingStrategy
   */
  private selectLeastBusy(actors: Actor[]): Actor {
    return actors.reduce((least, actor) => {
      const leastQueue = least.getStatus().messageQueue.pending;
      const actorQueue = actor.getStatus().messageQueue.pending;
      return actorQueue < leastQueue ? actor : least;
    });
  }

  private selectRandom(actors: Actor[]): Actor {
    const index = Math.floor(Math.random() * actors.length);
    return actors[index];
  }

  private async dispatchTask(task: Task): Promise<void> {
    const actor = this.selectActor();
    if (!actor) {
      // 사용 가능한 Actor 없음 - 대기
      return;
    }

    this.inProgress.set(task.id, task);

    // Idle 타이머 리셋
    this.resetIdleTimer(actor.id);

    // 메트릭 업데이트
    this.metrics.idleActors--;
    this.metrics.activeActors++;

    this.log(`Task ${task.id} → Actor ${actor.id}`);

    try {
      const startTime = Date.now();

      // 작업 실행
      const obs = await actor.observe();
      const action = await actor.think(obs);
      const result = await actor.act(action);
      await actor.report(result);

      const duration = Date.now() - startTime;

      // 결과 기록
      const taskResult: TaskResult = {
        taskId: task.id,
        actorId: actor.id,
        result: result.data,
        error: result.error || undefined,
        startedAt: new Date(startTime),
        completedAt: new Date(),
        duration,
      };

      this.recordTaskResult(taskResult);

      // 콜백 호출
      task.onComplete?.(result.data, result.error || undefined);
    } catch (error) {
      const err = error as Error;
      this.log(`Task ${task.id} failed: ${err.message}`);

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
      this.metrics.activeActors--;
      this.metrics.idleActors++;
      this.resetIdleTimer(actor.id);
    }
  }

  private recordTaskResult(result: TaskResult): void {
    this.completedTasks.push(result);

    // 메트릭 업데이트 - throughput 계산
    const now = Date.now();
    const oneSecondAgo = now - 1000;

    // 최근 1초 내 완료된 작업 수 계산
    const recentCompletions = this.completedTasks.filter(
      r => r.completedAt.getTime() >= oneSecondAgo
    ).length;

    this.metrics.throughput.actionsPerSecond = recentCompletions;

    // 완료된 작업 결과 기록 (최근 1000개 유지)
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

    this.metrics.queuedTasks = this.taskQueue.length;
  }

  private startDispatch(): void {
    this.dispatchTimer = setInterval(() => {
      if (this.taskQueue.length > 0) {
        const task = this.taskQueue.shift();
        if (task) {
          this.metrics.queueSize = this.taskQueue.length;
          this.dispatchTask(task);
        }
      }
    }, 100); // 100ms마다 체크
  }

  private startAutoScale(): void {
    this.scaleTimer = setInterval(() => {
      this.autoScale();
    }, 5000); // 5초마다 체크
  }

  private autoScale(): void {
    if (this.config.scaleStrategy === 'fixed') {
      return;
    }

    const queueLength = this.taskQueue.length;
    const idleRatio = this.metrics.idleActors / this.metrics.currentSize;

    if (this.config.scaleStrategy === 'dynamic') {
      // 간단한 동적 스케일링
      if (queueLength > 2 && this.metrics.currentSize < this.config.maxSize) {
        this.scaleUp();
      } else if (idleRatio > 0.5 && this.metrics.currentSize > this.config.minSize) {
        this.scaleDown();
      }
    } else if (this.config.scaleStrategy === 'adaptive') {
      // 적응형 스케일링 (CPU, 메모리 등 메트릭 기반)
      // TODO: 더 복잡한 로직 구현
      if (queueLength > 5 && this.metrics.currentSize < this.config.maxSize) {
        this.scaleUp();
      } else if (idleRatio > 0.7 && this.metrics.currentSize > this.config.minSize) {
        this.scaleDown();
      }
    }
  }

  private startIdleTimer(actorId: ActorId): void {
    const timer = setTimeout(() => {
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

  private isActorAvailable(actorId: ActorId): boolean {
    const actor = this.actors.get(actorId);
    if (!actor) return false;
    return actor.status === 'running' && !this.isActorBusy(actorId);
  }

  private isActorBusy(actorId: ActorId): boolean {
    // 현재 작업 중인지 확인
    for (const task of this.inProgress.values()) {
      // 실제 구현에서는 작업-Actor 매핑을 추적해야 함
    }
    return false;
  }

  private waitForTaskResult<T>(
    taskId: string,
    timeout: NodeJS.Timeout,
    resolve: (value: T) => void,
    reject: (reason?: unknown) => void
  ): void {
    // TODO: 이벤트 기반 결과 대기 구현
    // 간단한 폴링 방식으로 구현 (실제로는 EventEmitter 사용)
    const checkInterval = setInterval(() => {
      const result = this.completedTasks.find((r) => r.taskId === taskId);
      if (result) {
        clearInterval(checkInterval);
        clearTimeout(timeout);

        if (result.error) {
          reject(result.error);
        } else {
          resolve(result.result as T);
        }
      }
    }, 100);
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

  private generateActorId(): string {
    const uuid = crypto.randomUUID();
    return `${this.config.role}-${uuid}`;
  }

  private log(message: string): void {
    if (!this.config.debug) return;
    console.log(`[ActorPool:${this.config.name}] ${message}`);
  }
}
```

### 2. PoolManager (여러 Pool 관리)

**파일:** `packages/actor/src/pool/PoolManager.ts`

```typescript
import { ActorPool, PoolConfig, PoolMetrics } from './ActorPool';
import { Blackboard } from '../types/blackboard';
import { ActorFactory } from '../runtime/types';

/**
 * Pool Manager
 *
 * 여러 Actor Pool을 관리하는 매니저입니다.
 */
export class PoolManager {
  private readonly board: Blackboard;
  private readonly factory: ActorFactory;
  private readonly pools: Map<string, ActorPool>;
  private isRunning: boolean;

  constructor(board: Blackboard, factory: ActorFactory) {
    this.board = board;
    this.factory = factory;
    this.pools = new Map();
    this.isRunning = false;
  }

  /**
   * 매니저 시작
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('PoolManager is already running');
    }

    this.isRunning = true;

    // 모든 Pool 시작
    const startPromises = Array.from(this.pools.values()).map((pool) =>
      pool.start()
    );
    await Promise.all(startPromises);
  }

  /**
   * 매니저 종료
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // 모든 Pool 종료
    const stopPromises = Array.from(this.pools.values()).map((pool) =>
      pool.stop()
    );
    await Promise.all(stopPromises);

    this.isRunning = false;
  }

  /**
   * Pool 등록
   * @param config Pool 설정
   * @returns 생성된 Pool
   */
  registerPool(config: PoolConfig): ActorPool {
    const pool = new ActorPool(config, this.board, this.factory);
    this.pools.set(config.name, pool);

    // 이미 실행 중이면 Pool 시작
    if (this.isRunning) {
      pool.start().catch((err) => {
        console.error(`Failed to start pool: ${config.name}`, err);
      });
    }

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
   * Pool 개수
   */
  size(): number {
    return this.pools.size;
  }
}
```

### 3. 단위 테스트 작성

**파일:** `packages/actor/src/pool/__tests__/ActorPool.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Actor, ActorRole, ActorLifecycleStatus } from '../../types/actor';
import { Blackboard } from '../../types/blackboard';
import { ActorPool, PoolConfig } from '../ActorPool';
import { ActorFactory, ActorConfig } from '../../runtime/types';

class MockActor implements Actor {
  readonly id: string;
  readonly name: string = 'mock';
  readonly role: ActorRole;
  board: Blackboard;
  readonly status: ActorLifecycleStatus = ActorLifecycleStatus.RUNNING;
  lastActivity: Date = new Date();
  createdAt: Date = new Date();
  metrics = { totalRuns: 0, successCount: 0, failureCount: 0, lastError: null, averageExecutionTime: 0, lastExecutionTime: null, totalCpuTime: 0, memoryUsage: 0 };

  constructor(id: string, role: ActorRole, board: Blackboard) {
    this.id = id;
    this.role = role;
    this.board = board;
  }

  observe() { return { actorId: this.id, timestamp: new Date() }; }
  think() { return { id: '1', actorId: this.id, type: 'execute', timestamp: new Date() }; }
  act() { return { id: '1', actionId: '1', actorId: this.id, timestamp: new Date(), status: 'success' }; }
  report() { /* mock */ }
  async stop() { /* mock */ }
  getStatus() { return { id: this.id, name: this.name, role: this.role, status: this.status, messageQueue: { pending: 0, processing: false }, metrics: { totalMessagesProcessed: 0, totalActionsExecuted: 0, totalErrors: 0, averageResponseTime: 0, uptime: 0 }, lastSeen: new Date(), errorCount: 0 }; }
}

class MockFactory implements ActorFactory {
  create(config: ActorConfig, board: Blackboard): Actor {
    return new MockActor(config.id || 'test-id', config.role, board);
  }
}

describe('ActorPool', () => {
  let pool: ActorPool;
  let board: Blackboard;
  let factory: ActorFactory;

  beforeEach(() => {
    board = {
      read: vi.fn(),
      write: vi.fn(),
      subscribe: vi.fn(),
      version: 1,
    };
    factory = new MockFactory();

    const config: PoolConfig = {
      name: 'test-pool',
      role: 'analyst',
      type: 'mock',
      initialSize: 2,
      minSize: 1,
      maxSize: 5,
      idleTimeout: 5000,
      debug: false,
    };

    pool = new ActorPool(config, board, factory);
  });

  describe('start/stop', () => {
    it('should start pool with initial actors', async () => {
      await pool.start();
      const metrics = pool.getMetrics();
      expect(metrics.currentSize).toBe(2);
      expect(metrics.idleActors).toBe(2);
    });

    it('should stop pool', async () => {
      await pool.start();
      await pool.stop();
      const metrics = pool.getMetrics();
      expect(metrics.currentSize).toBe(0);
    });

    it('should throw when starting already running pool', async () => {
      await pool.start();
      await expect(pool.start()).rejects.toThrow('Pool is already running');
    });
  });

  describe('scale', () => {
    beforeEach(async () => {
      await pool.start();
    });

    it('should scale up', async () => {
      await pool.scaleUp(2);
      const metrics = pool.getMetrics();
      expect(metrics.currentSize).toBe(4);
    });

    it('should scale down', async () => {
      await pool.scaleDown();
      const metrics = pool.getMetrics();
      expect(metrics.currentSize).toBe(1);
    });

    it('should respect min size', async () => {
      await pool.scaleDown();
      await pool.scaleDown();
      const metrics = pool.getMetrics();
      expect(metrics.currentSize).toBe(1); // minSize = 1
    });

    it('should respect max size', async () => {
      await pool.scaleUp(10); // maxSize = 5
      const metrics = pool.getMetrics();
      expect(metrics.currentSize).toBe(5);
    });

    it('should scale to specific size', async () => {
      await pool.scaleTo(3);
      const metrics = pool.getMetrics();
      expect(metrics.currentSize).toBe(3);
    });
  });

  describe('task submission', () => {
    beforeEach(async () => {
      await pool.start();
    });

    it('should submit task', async () => {
      const taskId = await pool.submit({ data: 'test' });
      expect(taskId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should queue tasks when no idle actors', async () => {
      // 최대 크기보다 많은 작업 제출
      const config: PoolConfig = {
        name: 'test-pool',
        role: 'analyst',
        type: 'mock',
        initialSize: 1,
        maxSize: 1,
        debug: false,
      };
      const smallPool = new ActorPool(config, board, factory);
      await smallPool.start();

      const taskId1 = await smallPool.submit({ data: 'task1' });
      const taskId2 = await smallPool.submit({ data: 'task2' });
      const taskId3 = await smallPool.submit({ data: 'task3' }, 10); // 우선순위 높음

      const metrics = smallPool.getMetrics();
      expect(metrics.queuedTasks).toBeGreaterThan(0);

      await smallPool.stop();
    });

    it('should respect priority', async () => {
      const taskId1 = await pool.submit({ data: 'low' }, 0);
      const taskId2 = await pool.submit({ data: 'high' }, 10);
      const taskId3 = await pool.submit({ data: 'medium' }, 5);

      // 우선순위 순으로 처리되어야 함
      // 실제 검증은 작업 완료 이벤트를 통해 수행
      expect(taskId2).toBeDefined();
    });

    it('should throw when queue is full', async () => {
      const config: PoolConfig = {
        name: 'test-pool',
        role: 'analyst',
        type: 'mock',
        initialSize: 1,
        maxQueueSize: 2,
        debug: false,
      };
      const smallPool = new ActorPool(config, board, factory);
      await smallPool.start();

      await smallPool.submit({ data: 'task1' });
      await smallPool.submit({ data: 'task2' });

      await expect(smallPool.submit({ data: 'task3' })).rejects.toThrow(
        'Task queue is full'
      );

      await smallPool.stop();
    });
  });

  describe('dispatch strategies', () => {
    beforeEach(async () => {
      await pool.start();
    });

    it('should use round-robin dispatch', async () => {
      const config: PoolConfig = {
        name: 'test-pool',
        role: 'analyst',
        type: 'mock',
        initialSize: 3,
        dispatchStrategy: 'round-robin',
        debug: false,
      };
      const rrPool = new ActorPool(config, board, factory);
      await rrPool.start();

      // 여러 작업 제출 - 순환 분배 확인
      for (let i = 0; i < 6; i++) {
        await rrPool.submit({ data: `task${i}` });
      }

      // 검증 방식: 각 Actor의 메트릭 확인
      const actors = rrPool.getActors();
      expect(actors.length).toBe(3);

      await rrPool.stop();
    });

    it('should use least-busy dispatch', async () => {
      const config: PoolConfig = {
        name: 'test-pool',
        role: 'analyst',
        type: 'mock',
        initialSize: 3,
        dispatchStrategy: 'least-busy',
        debug: false,
      };
      const lbPool = new ActorPool(config, board, factory);
      await lbPool.start();

      for (let i = 0; i < 3; i++) {
        await lbPool.submit({ data: `task${i}` });
      }

      await lbPool.stop();
    });

    it('should use random dispatch', async () => {
      const config: PoolConfig = {
        name: 'test-pool',
        role: 'analyst',
        type: 'mock',
        initialSize: 3,
        dispatchStrategy: 'random',
        debug: false,
      };
      const randomPool = new ActorPool(config, board, factory);
      await randomPool.start();

      for (let i = 0; i < 3; i++) {
        await randomPool.submit({ data: `task${i}` });
      }

      await randomPool.stop();
    });
  });

  describe('metrics', () => {
    beforeEach(async () => {
      await pool.start();
    });

    it('should track metrics correctly', async () => {
      const initialMetrics = pool.getMetrics();
      expect(initialMetrics.currentSize).toBe(2);
      expect(initialMetrics.idleActors).toBe(2);
      expect(initialMetrics.activeActors).toBe(0);

      await pool.scaleUp();
      const afterScaleMetrics = pool.getMetrics();
      expect(afterScaleMetrics.currentSize).toBe(3);
    });
  });

  describe('idle timeout', () => {
    it('should remove idle actors after timeout', async () => {
      const config: PoolConfig = {
        name: 'test-pool',
        role: 'analyst',
        type: 'mock',
        initialSize: 3,
        minSize: 1,
        idleTimeout: 100, // 100ms
        scaleStrategy: 'fixed',
        debug: false,
      };
      const fastPool = new ActorPool(config, board, factory);
      await fastPool.start();

      expect(fastPool.getMetrics().currentSize).toBe(3);

      // 타임아웃 대기
      await new Promise((resolve) => setTimeout(resolve, 500));

      // minSize 유지
      expect(fastPool.getMetrics().currentSize).toBe(1);

      await fastPool.stop();
    }, 10000);
  });
});
```

**파일:** `packages/actor/src/pool/__tests__/PoolManager.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ActorPool, PoolConfig } from '../ActorPool';
import { PoolManager } from '../PoolManager';
import { ActorRole } from '../../types/actor';
import { ActorFactory, ActorConfig } from '../../runtime/types';

class MockFactory implements ActorFactory {
  create(config: ActorConfig, board: any): any {
    return {
      id: config.id || 'test-id',
      role: config.role,
      board,
      status: 'running',
      lastActivity: new Date(),
      createdAt: new Date(),
      metrics: { totalRuns: 0, successCount: 0, failureCount: 0, lastError: null, averageExecutionTime: 0, lastExecutionTime: null, totalCpuTime: 0, memoryUsage: 0 },
      async observe() { return { timestamp: new Date(), section: 'test', data: null, metadata: { source: 'read', latency: 0 } }; },
      async think() { return { id: '1', type: 'read', params: {}, priority: 0, createdAt: new Date() }; },
      async act() { return { actionId: '1', success: true, data: null, error: null, executionTime: 10, completedAt: new Date(), metadata: { retryCount: 0, resources: { cpu: 0, memory: 0 } } }; },
      async report() { /* mock */ },
      async stop() { /* mock */ },
      getStatus() { return 'running'; },
    };
  }
}

describe('PoolManager', () => {
  let manager: PoolManager;
  let factory: ActorFactory;

  beforeEach(() => {
    factory = new MockFactory();
    manager = new PoolManager({ version: 1 }, factory);
  });

  describe('start/stop', () => {
    it('should start manager', async () => {
      const config1: PoolConfig = {
        name: 'pool1',
        role: 'analyst',
        type: 'mock',
      };
      const config2: PoolConfig = {
        name: 'pool2',
        role: 'executor',
        type: 'mock',
      };

      manager.registerPool(config1);
      manager.registerPool(config2);
      await manager.start();

      expect(manager.size()).toBe(2);
    });

    it('should stop manager', async () => {
      const config: PoolConfig = {
        name: 'pool1',
        role: ActorRole.ANALYST,
        type: 'mock',
      };

      manager.registerPool(config);
      await manager.start();
      await manager.stop();

      expect(manager.size()).toBe(2); // Pool은 등록된 상태 유지
    });
  });

  describe('pool management', () => {
    it('should register pool', () => {
      const config: PoolConfig = {
        name: 'pool1',
        role: ActorRole.ANALYST,
        type: 'mock',
      };

      const pool = manager.registerPool(config);
      expect(pool).toBeInstanceOf(ActorPool);
      expect(manager.listPools()).toContain('pool1');
    });

    it('should unregister pool', async () => {
      const config: PoolConfig = {
        name: 'pool1',
        role: ActorRole.ANALYST,
        type: 'mock',
      };

      manager.registerPool(config);
      await manager.unregisterPool('pool1');

      expect(manager.listPools()).not.toContain('pool1');
    });

    it('should get pool by name', () => {
      const config: PoolConfig = {
        name: 'pool1',
        role: ActorRole.ANALYST,
        type: 'mock',
      };

      const registered = manager.registerPool(config);
      const retrieved = manager.getPool('pool1');

      expect(retrieved).toBe(registered);
    });

    it('should throw when pool not found', () => {
      expect(() => manager.getPool('non-existent')).toThrow('Pool not found');
    });

    it('should get all metrics', async () => {
      const config1: PoolConfig = {
        name: 'pool1',
        role: 'analyst',
        type: 'mock',
        initialSize: 2,
      };
      const config2: PoolConfig = {
        name: 'pool2',
        role: 'executor',
        type: 'mock',
        initialSize: 3,
      };

      manager.registerPool(config1);
      manager.registerPool(config2);

      const metrics = manager.getAllMetrics();
      expect(metrics.size).toBe(2);
      expect(metrics.get('pool1')?.currentSize).toBe(2);
      expect(metrics.get('pool2')?.currentSize).toBe(3);
    });
  });
});
```

### 4. 내보내기 설정

**파일:** `packages/actor/src/pool/index.ts`

```typescript
export * from './ActorPool';
export * from './PoolManager';
```

**파일:** `packages/actor/src/index.ts` (업데이트)

```typescript
export * from './types';
export * from './base/BaseActor';
export * from './runtime';
export * from './pool';
```

## 파일 구조

```
packages/actor/src/
├── pool/
│   ├── __tests__/
│   │   ├── ActorPool.test.ts
│   │   └── PoolManager.test.ts
│   ├── ActorPool.ts       # Actor Pool
│   └── PoolManager.ts     # Pool Manager
├── runtime/
├── types/
├── base/
└── index.ts
```

## 완료 조건
- [ ] ActorPool 클래스 구현 완료
- [ ] PoolManager 클래스 구현 완료
- [ ] 동적 확장/축소 기능 구현 완료
- [ ] 작업 분배 전략 (round-robin, least-busy, random) 구현 완료
- [ ] 우선순위 기반 작업 큐 구현 완료
- [ ] Idle 타임아웃 기능 구현 완료
- [ ] 로드 밸런싱 메트릭 추적 완료
- [ ] 단위 테스트 작성 완료
- [ ] 테스트 커버리지 85% 이상
- [ ] TypeScript 타입 체크 통과

## 의존성
- TASK-025 (Actor 런타임)

## 참고 자료
- `/docs/architecture/blackboard-actor-design.md` - 아키텍처 설계
- TASK-024 - Actor 인터페이스
- TASK-025 - Actor 런타임

## 수락 기준
1. Actor Pool이 초기 크기로 올바르게 생성된다
2. scaleUp/scaleDown이 minSize/maxSize를 준수한다
3. 작업이 우선순위 순으로 처리된다
4. 작업 분배 전략이 올바르게 동작한다
5. Idle Actor가 타임아웃 후 제거된다
6. 메트릭이 정확하게 추적된다
7. PoolManager가 여러 Pool을 올바르게 관리한다
8. 단위 테스트가 모든 주요 시나리오를 커버한다
]]></task_spec>

  <source_code>

  </source_code>

  <reviews>
    <opus_review><![CDATA[


I'll verify each checklist item against the actual code. Let me start by exploring the codebase.
Now let me read the actual source files in detail to verify each checklist item:
Now let me also check the type definitions for `IBlackboard.write()` and `ActorFactory.create()` signatures:
Now I have all the information I need. Let me verify each checklist item against the actual code.

# 체크리스트 검증 결과

## 항목별 결과

- **[PASS] 1. 만료된 task가 submitAndWait 호출자에게 전파되지 않음**
  - 근거: `ActorPool.ts:719-737` — `startDispatch()`에서 만료된 task를 감지하면 `recordTaskResult()`를 호출하여 에러 결과를 `pendingResults`에 저장하고, `submitAndWait`의 `waitForTaskResult` 폴링이 이를 감지하여 reject합니다. 만료된 task 에러가 `submitAndWait` 호출자에게 정상적으로 전파됩니다.

- **[PASS] 2. submitAndWait의 폴링 interval이 Pool 종료 시 정리되지 않음**
  - 근거: `ActorPool.ts:822-828` — `waitForTaskResult()`에서 `if (!this.isRunning)` 체크를 통해 Pool 종료 시 `clearInterval(checkInterval)`을 호출하고 reject합니다. 또한 `submitAndWait` 내에서 `waiter.cleanup()`이 반환되어(`ActorPool.ts:849-851`) 타임아웃이나 settle 시에도 정리됩니다.

- **[PASS] 3. dispatchTask()에서 Actor 없으면 무한 재삽입 사이클**
  - 근거: `ActorPool.ts:740-742` — `startDispatch()`에서 Actor가 없으면 (`if (!actor) break;`) while 루프를 탈출합니다. 스펙의 원래 코드는 task를 큐에서 꺼낸 후 actor가 없으면 다시 넣는 구조였지만, 현재 코드는 actor 선택 실패 시 task를 큐에서 꺼내기 전에 break하므로 재삽입 사이클이 없습니다.

- **[PASS] 4. getActorStatus()에서 actor.status 대신 actor.getStatus() 사용해야 함**
  - 근거: `ActorPool.ts:456-462` — `getActorStatus()`가 `actor.getStatus()`를 호출하여 `ActorStatus`를 반환합니다. `actor.status`를 직접 접근하지 않습니다.

- **[PASS] 5. selectLeastBusy()에서 actor.status.messageQueue 직접 접근**
  - 근거: `ActorPool.ts:587-594` — `selectLeastBusy()`에서 `least.getStatus()`와 `actor.getStatus()`를 호출한 후 반환값의 `messageQueue.pending`에 접근합니다. `actor.status.messageQueue`를 직접 접근하지 않습니다.

- **[PASS] 6. Pool 모듈이 패키지 엔트리포인트에서 내보내지 않음**
  - 근거: `packages/actor/src/index.ts:11` — `export * from "./pool";`이 존재하며, `packages/actor/src/pool/index.ts`에서 `ActorPool`과 `PoolManager`를 모두 re-export합니다.

- **[PASS] 7. 단위 테스트 파일 전체 누락**
  - 근거: `packages/actor/src/pool/__tests__/ActorPool.test.ts` (586줄)과 `packages/actor/src/pool/__tests__/PoolManager.test.ts` (421줄)이 모두 존재하며, 주요 시나리오를 커버하는 테스트 스위트가 포함되어 있습니다.

- **[PASS] 8. IBlackboard.write()는 void를 반환하나 await로 호출**
  - 근거: `ActorPool.ts:620` — `this.board.write(taskSection, {...})`를 `await` 없이 동기적으로 호출합니다. `IBlackboard.write()`의 시그니처(`blackboard.ts:32`)는 `void`를 반환하며, 코드에서 이를 올바르게 동기 호출합니다.

- **[PASS] 9. ActorPool/PoolManager 생성자 시그니처가 스펙과 불일치**
  - 근거: 스펙에서는 `constructor(config: PoolConfig, board: Blackboard, factory: ActorFactory)`이고 현재 코드는 `constructor(config: PoolConfig, board: IBlackboard, factory: ActorFactory, messageBus: IMessageBus = new NoOpMessageBus())`(`ActorPool.ts:176-180`). `Blackboard` 대신 `IBlackboard`를 사용하고 `messageBus`가 추가되었지만, 이는 실제 타입 시스템에 맞게 개선된 것이며 `messageBus`는 기본값이 있어 하위 호환됩니다. `PoolManager`도 동일하게 `IBlackboard`와 optional `messageBus`를 사용(`PoolManager.ts:42-46`). `ActorFactory.create()` 시그니처가 `messageBus`를 받도록 변경(`runtime/types.ts:39`)되었으므로 전체적으로 일관성 있게 수정되었습니다.

## 점수
- 통과: 9/9
- **총점: 10/10**
]]></opus_review>
    <codex_review><![CDATA[
# Checklist Verification Result

## Item Results
- [PASS] Item1: Expired tasks are recorded and returned to waiting submitters via pendingResults (packages/actor/src/pool/ActorPool.ts:724)
- [PASS] Item2: Polling interval is cleared when pool stops via isRunning guard in waiter (packages/actor/src/pool/ActorPool.ts:822)
- [PASS] Item3: Dispatch loop breaks when no actor available; no reinsert loop (packages/actor/src/pool/ActorPool.ts:740)
- [PASS] Item4: getActorStatus uses actor.getStatus() (packages/actor/src/pool/ActorPool.ts:456)
- [PASS] Item5: selectLeastBusy reads queue from getStatus() (packages/actor/src/pool/ActorPool.ts:887)
- [PASS] Item6: Pool module exported from package entrypoint (packages/actor/src/index.ts:8)
- [PASS] Item7: Unit test files present (packages/actor/src/pool/__tests__/ActorPool.test.ts:1)
- [PASS] Item8: IBlackboard.write called without await (packages/actor/src/pool/ActorPool.ts:620)
- [PASS] Item9: Constructors accept spec signatures with optional messageBus default (packages/actor/src/pool/ActorPool.ts:176)

## Score
- Passed: 9/9
- **Total: 10/10**

## Fix for FAIL Items
- None
]]></codex_review>
    <glm_review><![CDATA[
# 체크리스트 검증 결과

## 항목별 결과
- [PASS] 항목1 (만료된 task가 submitAndWait 호출자에게 전파되지 않음): 만료된 task가 recordTaskResult()를 통해 pendingResults에 저장되고, submitAndWait에서 대기 중인 작업으로 에러가 전파됨 (ActorPool.ts:680-682, 735-736)
- [FAIL] 항목2 (submitAndWait의 폴링 interval이 Pool 종료 시 정리되지 않음): waitForTaskResult가 반환하는 cleanup 객체가 submitAndWait에서 사용되지 않아 Pool 종료 시 모든 폴링 interval이 정리되지 않음 (ActorPool.ts:345-390, 848-851)
- [PASS] 항목3 (dispatchTask()에서 Actor 없으면 무한 재삽입 사이클): Actor가 없으면 break하여 무한 루프를 방지함 (ActorPool.ts:740-742)
- [PASS] 항목4 (getActorStatus()에서 actor.status 대신 actor.getStatus() 사용해야 함): actor.getStatus()를 올바르게 사용함 (ActorPool.ts:461)
- [PASS] 항목5 (selectLeastBusy()에서 actor.status.messageQueue 직접 접근): actor.getStatus().messageQueue를 올바르게 사용함 (ActorPool.ts:589-592)
- [PASS] 항목6 (Pool 모듈이 패키지 엔트리포인트에서 내보내지 않음): index.ts에서 pool을 내보냄 (packages/actor/src/index.ts:11)
- [PASS] 항목7 (단위 테스트 파일 전체 누락): 테스트 파일들이 존재함 (packages/actor/src/pool/__tests__/)
- [FAIL] 항목8 (IBlackboard.write()는 void를 반환하나 await로 호출): write()는 void 반환인데 await로 호출됨 (ActorPool.ts:620, blackboard.ts:32)
- [PASS] 항목9 (ActorPool/PoolManager 생성자 시그니처가 스펙과 불일치): 스펙과 일치함 (ActorPool.ts:176-181, PoolManager.ts:42-46)

## 점수
- 통과: 7/9
- **총점: 7/10**

## FAIL 항목 수정 방법
### [P2] submitAndWait의 폴링 interval이 Pool 종료 시 정리되지 않음
- **파일**: packages/actor/src/pool/ActorPool.ts:345-390
- **문제점**: waitForTaskResult가 반환하는 cleanup 객체가 submitAndWait에서 사용되지 않아, Pool이 종료되더라도 모든 폴링 interval이 정리되지 않음
- **수정 전 코드**:
```typescript
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
```
- **수정 후 코드**:
```typescript
waiter = this.waitForTaskResult(
  taskId,
  () => {
    if (settled) return;
    settled = true;
    waiter?.cleanup(); // waiter가 정의된 후 cleanup 사용
  },
  resolve,
  reject
);
```

### [P2] IBlackboard.write()는 void를 반환하나 await로 호출
- **파일**: packages/actor/src/pool/ActorPool.ts:620
- **문제점**: write()는 void 반환 메서드인데 불필요하게 await를 사용함
- **수정 전 코드**:
```typescript
this.board.write(taskSection, {
  taskId: task.id,
  actorId: actor.id,
  data: task.data,
  priority: task.priority,
  createdAt: task.createdAt,
});
```
- **수정 후 코드**:
```typescript
this.board.write(taskSection, {
  taskId: task.id,
  actorId: actor.id,
  data: task.data,
  priority: task.priority,
  createdAt: task.createdAt,
});
// await 제거 (write()는 void 반환)
```
]]></glm_review>
    <gemini_review><![CDATA[
I will now verify the checklist items by examining the codebase.

First, I'll list the files in the `packages/actor` directory to verify the structure and existence of the relevant files.
I will now read the core files to verify the checklist items.
I will now search for any occurrences of `await this.board.write` to confirm if the issue has been resolved.
I will now read the `ActorPool.ts` file again to verify the usage of `board.write`.
I will now check the `packages/actor/src/types/blackboard.ts` file to see the definition of `Blackboard`.
I will now check the `packages/actor/src/types/actor.ts` file to see the definition of `ActorStatus`.
I will now read the `ActorPool.test.ts` file to ensure it is not empty and covers the required scenarios.
# Checklist Verification Result

## Item Results
- [PASS] Item1: Expired tasks are recorded via `recordTaskResult` and propagated to `submitAndWait` callers through the `pendingResults` cache and `waitForTaskResult` polling mechanism (ActorPool.ts:736, 830).
- [PASS] Item2: The polling interval in `waitForTaskResult` is explicitly cleared if the pool stops (`!this.isRunning`) and via a returned `cleanup` function called by `submitAndWait` (ActorPool.ts:825, 849, 356).
- [PASS] Item3: `startDispatch` now uses a `break` statement when no actor is available, preventing the infinite loop of shifting and re-inserting tasks (ActorPool.ts:742).
- [PASS] Item4: `getActorStatus` correctly uses the `actor.getStatus()` method instead of the `status` property (ActorPool.ts:461).
- [PASS] Item5: `selectLeastBusy` uses `getStatus()` to retrieve the actor's status before accessing `messageQueue.pending` (ActorPool.ts:589-592).
- [PASS] Item6: The `pool` module is correctly exported from the package entry point (packages/actor/src/index.ts:11).
- [PASS] Item7: Comprehensive unit tests for `ActorPool` and `PoolManager` are present in the `pool/__tests__` directory.
- [PASS] Item8: `IBlackboard.write()` is called synchronously as it returns `void`, with no `await` keyword used (ActorPool.ts:620).
- [PASS] Item9: Constructor signatures for `ActorPool` and `PoolManager` align with the spec for required arguments while providing an optional `messageBus` for dependency injection (ActorPool.ts:176, PoolManager.ts:42).

## Score
- Passed: 9/9
- **Total: 10/10**
]]></gemini_review>
  </reviews>
</debate>

위의 XML을 따라서 4개 모델의 리뷰를 종합 판정하고 결과를 마크다운으로 출력하세요.
