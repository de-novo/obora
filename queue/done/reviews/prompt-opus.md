<review>
  <mode>checklist_verification</mode>
  <task>
    <name>TASK-026-actor-pool</name>
    <spec><![CDATA[
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
]]></spec>
  </task>

  <instructions>
    아래 체크리스트의 항목만 검증하세요. 새로운 이슈를 찾지 마세요.
    각 항목에 대해 PASS 또는 FAIL + 근거(파일:라인) 출력.
    모든 항목이 PASS면 10점, 각 FAIL마다 감점.

    ## 검증 규칙
    - 각 항목에 대해 "이전 리뷰에서 발견된 이 이슈가 **현재 코드에서 수정되었는지**" 검증하세요.
    - [PASS] = 이슈가 수정되었거나, 현재 코드에 해당 문제가 없음
    - [FAIL] = 이슈가 여전히 존재하며 수정되지 않음
    - "문제 패턴이 존재하지만 의도된 설계" → [PASS] (스펙에 명시된 경우)
    - 수정 여부를 판단할 때는 **실제 코드**를 확인하세요. 추측하지 마세요.
  </instructions>

  <checklist>
# 자동 생성 체크리스트
# 생성 시각: 2026-02-09 19:24:15

1. 만료된 task가 submitAndWait 호출자에게 전파되지 않음
2. submitAndWait의 폴링 interval이 Pool 종료 시 정리되지 않음
3. dispatchTask()에서 Actor 없으면 무한 재삽입 사이클
4. getActorStatus()에서 actor.status 대신 actor.getStatus() 사용해야 함
5. selectLeastBusy()에서 actor.status.messageQueue 직접 접근
6. Pool 모듈이 패키지 엔트리포인트에서 내보내지 않음
7. 단위 테스트 파일 전체 누락
8. IBlackboard.write()는 void를 반환하나 await로 호출
9. ActorPool/PoolManager 생성자 시그니처가 스펙과 불일치
  </checklist>

  <source_files>

  </source_files>

  <test_files>

  </test_files>

  <output_format>
# 체크리스트 검증 결과

## 항목별 결과
- [PASS/FAIL] 항목1: 근거 (파일:라인)
- [PASS/FAIL] 항목2: 근거 (파일:라인)
...

## 점수
- 통과: N/M
- **총점: X/10**

## FAIL 항목 수정 방법
### [P1] FAIL 항목 제목
- **파일**: 파일경로:라인
- **문제점**: 설명
- **수정 전 코드**:
```코드```
- **수정 후 코드**:
```코드```
  </output_format>
</review>

위의 XML 프롬프트를 따라서 체크리스트 검증을 수행하고 결과를 마크다운 형식으로 출력하세요.
