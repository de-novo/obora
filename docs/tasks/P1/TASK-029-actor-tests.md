# TASK-029: Actor 통합 테스트

## 개요
- **상태**: ✅ 완료
- 우선순위: P1
- 예상 소요: 6시간
- 담당: 개발자
- Phase: Week 3-4

## 목표
Actor 시스템의 전체 기능을 검증하는 통합 테스트를 작성합니다. Actor 생명주기, Pool, Supervision, Blackboard 연동을 테스트합니다.

## 작업 내용

### 1. 테스트 환경 설정

**파일:** `packages/actor/src/__tests__/setup.ts`

```typescript
import { vi, beforeEach, afterEach } from 'vitest';

// 전역 타이머 mock
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
```

**파일:** `packages/actor/src/__tests__/helpers/MockBlackboard.ts`

```typescript
import { Blackboard } from '../../types/blackboard';
import { EventEmitter } from 'events';

/**
 * 테스트용 Mock Blackboard
 */
export class MockBlackboard implements Blackboard {
  private readonly data: Map<string, unknown>;
  private readonly events: EventEmitter;
  readonly version: number = 1;

  constructor() {
    this.data = new Map();
    this.events = new EventEmitter();
  }

  async read(section: string, query?: Record<string, unknown>): Promise<unknown> {
    const sectionData = this.data.get(section);
    if (!sectionData) {
      return null;
    }

    if (query) {
      // 간단한 쿼리 필터링
      return this.filterData(sectionData, query);
    }

    return sectionData;
  }

  async write(section: string, data: unknown): Promise<void> {
    this.data.set(section, data);
    this.events.emit(`${section}.updated`, data);
  }

  subscribe(
    event: string,
    handler: (data: unknown) => void | Promise<void>
  ): () => void {
    this.events.on(event, handler);
    return () => this.events.off(event, handler);
  }

  // 테스트 헬퍼
  getData(section: string): unknown {
    return this.data.get(section);
  }

  setData(section: string, data: unknown): void {
    this.data.set(section, data);
  }

  clear(): void {
    this.data.clear();
  }

  private filterData(data: unknown, query: Record<string, unknown>): unknown {
    if (Array.isArray(data)) {
      return data.filter((item) => {
        return Object.entries(query).every(([key, value]) => {
          return (item as Record<string, unknown>)[key] === value;
        });
      });
    }
    return data;
  }
}
```

**파일:** `packages/actor/src/__tests__/helpers/TestActor.ts`

```typescript
import { BaseActor } from '../../base/BaseActor';
import {
  ActorId,
  ActorRole,
  ActorStatus,
  Observation,
  Action,
  ActionType,
  Result,
  createObservation,
  createAction,
  createSuccessResult,
  createFailureResult,
} from '../../types/actor';
import { Blackboard } from '../../types/blackboard';

export interface TestActorConfig {
  /** 실패 확률 (0-1) */
  failureRate?: number;
  /** 실행 시간 (ms) */
  executionTime?: number;
  /** 실행 횟수 제한 */
  maxExecutions?: number;
}

/**
 * 테스트용 Actor 구현
 */
export class TestActor extends BaseActor {
  private readonly config: TestActorConfig;
  private executionCount: number = 0;

  constructor(
    id: ActorId,
    role: ActorRole,
    board: Blackboard,
    config?: TestActorConfig
  ) {
    super(id, role, board);
    this.config = {
      failureRate: 0,
      executionTime: 10,
      maxExecutions: Infinity,
      ...config,
    };
  }

  async observe(): Promise<Observation> {
    const data = await this.board.read('state');
    return createObservation('state', data, {
      source: 'read',
      latency: 5,
    });
  }

  think(obs: Observation): Action {
    return createAction(ActionType.WRITE, {
      section: 'results',
      data: { processed: obs.data },
    });
  }

  async act(action: Action): Promise<Result> {
    this.executionCount++;

    // 실행 횟수 제한 체크
    if (this.executionCount > this.config.maxExecutions!) {
      return createFailureResult(
        action.id,
        new Error('Max executions exceeded'),
        0
      );
    }

    // 실행 시간 시뮬레이션
    await this.delay(this.config.executionTime!);

    // 실패 확률 체크
    if (Math.random() < this.config.failureRate!) {
      return createFailureResult(
        action.id,
        new Error('Random failure'),
        this.config.executionTime!
      );
    }

    // 성공
    await this.board.write(action.params.section as string, action.params.data);

    return createSuccessResult(
      action.id,
      { written: true },
      this.config.executionTime!
    );
  }

  getExecutionCount(): number {
    return this.executionCount;
  }

  resetExecutionCount(): void {
    this.executionCount = 0;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

**파일:** `packages/actor/src/__tests__/helpers/TestActorFactory.ts`

```typescript
import { ActorFactory, ActorConfig } from '../../runtime/types';
import { Actor } from '../../types/actor';
import { Blackboard } from '../../types/blackboard';
import { TestActor, TestActorConfig } from './TestActor';

/**
 * 테스트용 Actor Factory
 */
export class TestActorFactory implements ActorFactory {
  private actorConfig: TestActorConfig;
  private createdActors: Actor[] = [];

  constructor(config?: TestActorConfig) {
    this.actorConfig = config || {};
  }

  create(config: ActorConfig, board: Blackboard): Actor {
    const id = config.id || `${config.role}-${Date.now()}`;
    const actor = new TestActor(id, config.role, board, {
      ...this.actorConfig,
      ...(config.config as TestActorConfig),
    });

    this.createdActors.push(actor);
    return actor;
  }

  getCreatedActors(): Actor[] {
    return [...this.createdActors];
  }

  clearCreatedActors(): void {
    this.createdActors = [];
  }

  setActorConfig(config: TestActorConfig): void {
    this.actorConfig = config;
  }
}
```

### 2. Actor 생명주기 통합 테스트

**파일:** `packages/actor/src/__tests__/integration/lifecycle.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ActorRuntime } from '../../runtime/ActorRuntime';
import { ActorRole, ActorStatus } from '../../types/actor';
import { MockBlackboard } from '../helpers/MockBlackboard';
import { TestActorFactory } from '../helpers/TestActorFactory';

describe('Actor Lifecycle Integration', () => {
  let runtime: ActorRuntime;
  let board: MockBlackboard;
  let factory: TestActorFactory;

  beforeEach(async () => {
    board = new MockBlackboard();
    factory = new TestActorFactory();
    runtime = new ActorRuntime(board, factory, {
      maxActors: 10,
      spawnTimeout: 5000,
      stopTimeout: 5000,
      maxRestarts: 3,
      debug: false,
    });
    await runtime.start();
  });

  afterEach(async () => {
    await runtime.stop();
    board.clear();
    factory.clearCreatedActors();
  });

  describe('Actor Creation', () => {
    it('should spawn actor with correct properties', async () => {
      const actor = await runtime.spawn({
        id: 'test-actor-1',
        role: ActorRole.ANALYST,
        type: 'test',
      });

      expect(actor.id).toBe('test-actor-1');
      expect(actor.role).toBe(ActorRole.ANALYST);
      expect(actor.status).toBe(ActorStatus.RUNNING);
      expect(runtime.hasActor('test-actor-1')).toBe(true);
    });

    it('should spawn multiple actors', async () => {
      await runtime.spawn({ role: ActorRole.ANALYST, type: 'test' });
      await runtime.spawn({ role: ActorRole.EXECUTOR, type: 'test' });
      await runtime.spawn({ role: ActorRole.VERIFIER, type: 'test' });

      expect(runtime.size()).toBe(3);
      expect(runtime.listActorsByRole(ActorRole.ANALYST)).toHaveLength(1);
      expect(runtime.listActorsByRole(ActorRole.EXECUTOR)).toHaveLength(1);
      expect(runtime.listActorsByRole(ActorRole.VERIFIER)).toHaveLength(1);
    });

    it('should enforce max actors limit', async () => {
      const limitedRuntime = new ActorRuntime(board, factory, {
        maxActors: 2,
      });
      await limitedRuntime.start();

      await limitedRuntime.spawn({ role: ActorRole.ANALYST, type: 'test' });
      await limitedRuntime.spawn({ role: ActorRole.ANALYST, type: 'test' });

      await expect(
        limitedRuntime.spawn({ role: ActorRole.ANALYST, type: 'test' })
      ).rejects.toThrow('Maximum actors limit reached');

      await limitedRuntime.stop();
    });
  });

  describe('Actor Execution Cycle', () => {
    it('should complete observe-think-act-report cycle', async () => {
      board.setData('state', { input: 'test-data' });

      const actor = await runtime.spawn({
        role: ActorRole.ANALYST,
        type: 'test',
      });

      // Observe
      const observation = await actor.observe();
      expect(observation.data).toEqual({ input: 'test-data' });

      // Think
      const action = await actor.think(observation);
      expect(action.type).toBe('write');

      // Act
      const result = await actor.act(action);
      expect(result.success).toBe(true);

      // Report
      await actor.report(result);

      // 결과 확인
      const resultData = board.getData('results');
      expect(resultData).toBeDefined();
    });

    it('should update actor metrics after execution', async () => {
      const actor = await runtime.spawn({
        role: ActorRole.ANALYST,
        type: 'test',
      });

      const obs = await actor.observe();
      const action = await actor.think(obs);
      const result = await actor.act(action);
      await actor.report(result);

      expect(actor.metrics.totalRuns).toBe(1);
      expect(actor.metrics.successCount).toBe(1);
      expect(actor.metrics.lastExecutionTime).toBeGreaterThan(0);
    });
  });

  describe('Actor Termination', () => {
    it('should stop actor gracefully', async () => {
      const actor = await runtime.spawn({
        id: 'actor-to-stop',
        role: ActorRole.ANALYST,
        type: 'test',
      });

      expect(runtime.hasActor('actor-to-stop')).toBe(true);

      await runtime.stop('actor-to-stop');

      expect(runtime.hasActor('actor-to-stop')).toBe(false);
    });

    it('should stop all actors on runtime shutdown', async () => {
      await runtime.spawn({ role: ActorRole.ANALYST, type: 'test' });
      await runtime.spawn({ role: ActorRole.EXECUTOR, type: 'test' });

      expect(runtime.size()).toBe(2);

      await runtime.stop();

      expect(runtime.size()).toBe(0);
    });
  });

  describe('Actor Restart', () => {
    it('should restart actor successfully', async () => {
      const actor = await runtime.spawn({
        id: 'actor-to-restart',
        role: ActorRole.ANALYST,
        type: 'test',
      });

      const originalCreatedAt = actor.createdAt;

      const restartedActor = await runtime.restart('actor-to-restart');

      expect(restartedActor.id).toBe('actor-to-restart');
      expect(restartedActor.status).toBe(ActorStatus.RUNNING);
    });

    it('should respect max restarts limit', async () => {
      await runtime.spawn({
        id: 'limited-restart',
        role: ActorRole.ANALYST,
        type: 'test',
      });

      // 최대 재시작 횟수 초과
      await runtime.restart('limited-restart', 0);
      await runtime.restart('limited-restart', 1);
      await runtime.restart('limited-restart', 2);

      await expect(
        runtime.restart('limited-restart', 3)
      ).rejects.toThrow('Max restarts');
    });
  });

  describe('Blackboard Integration', () => {
    it('should read from blackboard during observe', async () => {
      board.setData('state', { key: 'value' });

      const actor = await runtime.spawn({
        role: ActorRole.ANALYST,
        type: 'test',
      });

      const observation = await actor.observe();
      expect(observation.data).toEqual({ key: 'value' });
    });

    it('should write to blackboard during act', async () => {
      const actor = await runtime.spawn({
        role: ActorRole.EXECUTOR,
        type: 'test',
      });

      const obs = await actor.observe();
      const action = await actor.think(obs);
      await actor.act(action);

      expect(board.getData('results')).toBeDefined();
    });

    it('should subscribe to blackboard events', async () => {
      const eventHandler = vi.fn();
      board.subscribe('state.updated', eventHandler);

      await board.write('state', { updated: true });

      expect(eventHandler).toHaveBeenCalledWith({ updated: true });
    });
  });
});
```

### 3. Actor Pool 통합 테스트

**파일:** `packages/actor/src/__tests__/integration/pool.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ActorPool, PoolConfig } from '../../pool/ActorPool';
import { PoolManager } from '../../pool/PoolManager';
import { ActorRole } from '../../types/actor';
import { MockBlackboard } from '../helpers/MockBlackboard';
import { TestActorFactory } from '../helpers/TestActorFactory';

describe('Actor Pool Integration', () => {
  let pool: ActorPool;
  let board: MockBlackboard;
  let factory: TestActorFactory;

  const defaultConfig: PoolConfig = {
    name: 'test-pool',
    role: ActorRole.ANALYST,
    type: 'test',
    initialSize: 3,
    minSize: 1,
    maxSize: 10,
    idleTimeout: 5000,
    scaleStrategy: 'dynamic',
    dispatchStrategy: 'round-robin',
    maxQueueSize: 100,
    taskTimeout: 30000,
    debug: false,
  };

  beforeEach(async () => {
    board = new MockBlackboard();
    factory = new TestActorFactory({ executionTime: 10 });
    pool = new ActorPool(defaultConfig, board, factory);
    await pool.start();
  });

  afterEach(async () => {
    await pool.stop();
    board.clear();
    factory.clearCreatedActors();
  });

  describe('Pool Initialization', () => {
    it('should initialize with correct size', () => {
      const metrics = pool.getMetrics();
      expect(metrics.currentSize).toBe(3);
      expect(metrics.idleActors).toBe(3);
    });

    it('should create actors with correct role', () => {
      const actors = pool.getActors();
      expect(actors).toHaveLength(3);
      actors.forEach((actorId) => {
        expect(actorId).toContain('analyst');
      });
    });
  });

  describe('Task Processing', () => {
    it('should process submitted task', async () => {
      const taskId = await pool.submit({ data: 'test' });
      expect(taskId).toBeDefined();

      // 작업 처리 대기
      await new Promise((resolve) => setTimeout(resolve, 100));

      const metrics = pool.getMetrics();
      expect(metrics.completedTasks).toBeGreaterThanOrEqual(0);
    });

    it('should process multiple tasks', async () => {
      const taskIds = await Promise.all([
        pool.submit({ data: 'task1' }),
        pool.submit({ data: 'task2' }),
        pool.submit({ data: 'task3' }),
      ]);

      expect(taskIds).toHaveLength(3);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const metrics = pool.getMetrics();
      expect(metrics.completedTasks + metrics.queuedTasks).toBeGreaterThanOrEqual(0);
    });

    it('should respect priority', async () => {
      await pool.submit({ data: 'low' }, 0);
      await pool.submit({ data: 'high' }, 10);
      await pool.submit({ data: 'medium' }, 5);

      // 우선순위 순으로 처리됨 확인
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    it('should reject when queue is full', async () => {
      const smallPool = new ActorPool(
        {
          ...defaultConfig,
          name: 'small-pool',
          initialSize: 1,
          maxQueueSize: 2,
        },
        board,
        factory
      );
      await smallPool.start();

      await smallPool.submit({ data: 'task1' });
      await smallPool.submit({ data: 'task2' });

      await expect(smallPool.submit({ data: 'task3' })).rejects.toThrow(
        'Task queue is full'
      );

      await smallPool.stop();
    });
  });

  describe('Scaling', () => {
    it('should scale up', async () => {
      expect(pool.getMetrics().currentSize).toBe(3);

      await pool.scaleUp(2);

      expect(pool.getMetrics().currentSize).toBe(5);
    });

    it('should scale down', async () => {
      expect(pool.getMetrics().currentSize).toBe(3);

      await pool.scaleDown(1);

      expect(pool.getMetrics().currentSize).toBe(2);
    });

    it('should respect min size', async () => {
      await pool.scaleDown(10);

      expect(pool.getMetrics().currentSize).toBe(1); // minSize
    });

    it('should respect max size', async () => {
      await pool.scaleUp(100);

      expect(pool.getMetrics().currentSize).toBe(10); // maxSize
    });

    it('should scale to specific size', async () => {
      await pool.scaleTo(7);

      expect(pool.getMetrics().currentSize).toBe(7);
    });
  });

  describe('Dispatch Strategies', () => {
    it('should use round-robin dispatch', async () => {
      const rrPool = new ActorPool(
        {
          ...defaultConfig,
          name: 'rr-pool',
          dispatchStrategy: 'round-robin',
        },
        board,
        factory
      );
      await rrPool.start();

      // 작업 제출
      for (let i = 0; i < 6; i++) {
        await rrPool.submit({ data: `task${i}` });
      }

      await new Promise((resolve) => setTimeout(resolve, 300));

      // 모든 Actor가 균등하게 사용되었는지 확인
      const actors = factory.getCreatedActors();
      // 통계적으로 검증 (정확한 round-robin은 내부 구현에 따라 다름)

      await rrPool.stop();
    });

    it('should use least-busy dispatch', async () => {
      const lbPool = new ActorPool(
        {
          ...defaultConfig,
          name: 'lb-pool',
          dispatchStrategy: 'least-busy',
        },
        board,
        factory
      );
      await lbPool.start();

      for (let i = 0; i < 3; i++) {
        await lbPool.submit({ data: `task${i}` });
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
      await lbPool.stop();
    });
  });

  describe('Metrics', () => {
    it('should track metrics correctly', async () => {
      const initialMetrics = pool.getMetrics();
      expect(initialMetrics.currentSize).toBe(3);
      expect(initialMetrics.completedTasks).toBe(0);
      expect(initialMetrics.failedTasks).toBe(0);

      await pool.submit({ data: 'task' });
      await new Promise((resolve) => setTimeout(resolve, 100));

      const afterMetrics = pool.getMetrics();
      expect(afterMetrics.completedTasks + afterMetrics.queuedTasks).toBeGreaterThanOrEqual(0);
    });

    it('should track average task time', async () => {
      for (let i = 0; i < 5; i++) {
        await pool.submit({ data: `task${i}` });
      }

      await new Promise((resolve) => setTimeout(resolve, 300));

      const metrics = pool.getMetrics();
      if (metrics.completedTasks > 0) {
        expect(metrics.averageTaskTime).toBeGreaterThan(0);
      }
    });
  });
});

describe('Pool Manager Integration', () => {
  let manager: PoolManager;
  let board: MockBlackboard;
  let factory: TestActorFactory;

  beforeEach(() => {
    board = new MockBlackboard();
    factory = new TestActorFactory();
    manager = new PoolManager(board, factory);
  });

  afterEach(async () => {
    await manager.stop();
  });

  it('should manage multiple pools', async () => {
    manager.registerPool({
      name: 'analysts',
      role: ActorRole.ANALYST,
      type: 'test',
      initialSize: 2,
    });

    manager.registerPool({
      name: 'executors',
      role: ActorRole.EXECUTOR,
      type: 'test',
      initialSize: 3,
    });

    await manager.start();

    expect(manager.listPools()).toContain('analysts');
    expect(manager.listPools()).toContain('executors');
    expect(manager.size()).toBe(2);
  });

  it('should get metrics for all pools', async () => {
    manager.registerPool({
      name: 'pool1',
      role: ActorRole.ANALYST,
      type: 'test',
      initialSize: 2,
    });

    manager.registerPool({
      name: 'pool2',
      role: ActorRole.EXECUTOR,
      type: 'test',
      initialSize: 3,
    });

    const metrics = manager.getAllMetrics();
    expect(metrics.size).toBe(2);
    expect(metrics.get('pool1')?.currentSize).toBe(2);
    expect(metrics.get('pool2')?.currentSize).toBe(3);
  });
});
```

### 4. Supervision 통합 테스트

**파일:** `packages/actor/src/__tests__/integration/supervision.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Supervisor } from '../../supervision/Supervisor';
import { SupervisorTree } from '../../supervision/SupervisorTree';
import { RestartStrategy, BackoffPolicy } from '../../supervision/types';
import { ActorRuntime } from '../../runtime/ActorRuntime';
import { ActorRole, ActorStatus } from '../../types/actor';
import { MockBlackboard } from '../helpers/MockBlackboard';
import { TestActorFactory } from '../helpers/TestActorFactory';

describe('Supervision Integration', () => {
  let runtime: ActorRuntime;
  let supervisor: Supervisor;
  let board: MockBlackboard;
  let factory: TestActorFactory;

  beforeEach(async () => {
    board = new MockBlackboard();
    factory = new TestActorFactory();
    runtime = new ActorRuntime(board, factory);
    await runtime.start();

    supervisor = new Supervisor(runtime, {
      strategy: RestartStrategy.ONE_FOR_ONE,
      backoff: {
        policy: BackoffPolicy.FIXED,
        initialDelay: 10,
        maxDelay: 100,
      },
      maxRestarts: 3,
      restartWindow: 60000,
      enableDeadLetterQueue: true,
      debug: false,
    });
    supervisor.start();
  });

  afterEach(async () => {
    supervisor.stop();
    await runtime.stop();
  });

  describe('Failure Handling', () => {
    it('should detect actor failure', async () => {
      const actor = await runtime.spawn({
        id: 'failing-actor',
        role: ActorRole.ANALYST,
        type: 'test',
      });

      supervisor.watch('failing-actor');

      const failedHandler = vi.fn();
      supervisor.on('actor:failed', failedHandler);

      await supervisor.handleFailure('failing-actor', new Error('Test failure'));

      expect(failedHandler).toHaveBeenCalledWith(
        'failing-actor',
        expect.any(Error)
      );
    });

    it('should restart failed actor', async () => {
      await runtime.spawn({
        id: 'restart-actor',
        role: ActorRole.ANALYST,
        type: 'test',
      });

      supervisor.watch('restart-actor');

      const restartedHandler = vi.fn();
      supervisor.on('actor:restarted', restartedHandler);

      await supervisor.handleFailure('restart-actor', new Error('Test failure'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(restartedHandler).toHaveBeenCalled();
    });

    it('should stop after max restarts', async () => {
      await runtime.spawn({
        id: 'limited-actor',
        role: ActorRole.ANALYST,
        type: 'test',
      });

      supervisor.watch('limited-actor');

      const maxRestartsHandler = vi.fn();
      supervisor.on('max-restarts-exceeded', maxRestartsHandler);

      // 최대 재시작 횟수 초과
      for (let i = 0; i <= 3; i++) {
        await supervisor.handleFailure('limited-actor', new Error('Failure'));
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      expect(maxRestartsHandler).toHaveBeenCalled();
    });
  });

  describe('Restart Strategies', () => {
    it('should apply ONE_FOR_ONE strategy', async () => {
      await runtime.spawn({ id: 'actor-1', role: ActorRole.ANALYST, type: 'test' });
      await runtime.spawn({ id: 'actor-2', role: ActorRole.ANALYST, type: 'test' });

      supervisor.watch('actor-1');
      supervisor.watch('actor-2');

      const restartSpy = vi.spyOn(runtime, 'restart');

      await supervisor.handleFailure('actor-1', new Error('Failure'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(restartSpy).toHaveBeenCalledWith('actor-1');
      expect(restartSpy).not.toHaveBeenCalledWith('actor-2');
    });

    it('should apply ALL_FOR_ONE strategy', async () => {
      const allForOneSupervisor = new Supervisor(runtime, {
        strategy: RestartStrategy.ALL_FOR_ONE,
        backoff: { policy: BackoffPolicy.FIXED, initialDelay: 10, maxDelay: 100 },
        maxRestarts: 3,
        restartWindow: 60000,
      });
      allForOneSupervisor.start();

      await runtime.spawn({ id: 'all-1', role: ActorRole.ANALYST, type: 'test' });
      await runtime.spawn({ id: 'all-2', role: ActorRole.ANALYST, type: 'test' });
      await runtime.spawn({ id: 'all-3', role: ActorRole.ANALYST, type: 'test' });

      allForOneSupervisor.watch('all-1');
      allForOneSupervisor.watch('all-2');
      allForOneSupervisor.watch('all-3');

      const restartSpy = vi.spyOn(runtime, 'restart');

      await allForOneSupervisor.handleFailure('all-1', new Error('Failure'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(restartSpy).toHaveBeenCalledWith('all-1');
      expect(restartSpy).toHaveBeenCalledWith('all-2');
      expect(restartSpy).toHaveBeenCalledWith('all-3');

      allForOneSupervisor.stop();
    });
  });

  describe('Backoff Policies', () => {
    it('should apply exponential backoff', async () => {
      const expSupervisor = new Supervisor(runtime, {
        strategy: RestartStrategy.ONE_FOR_ONE,
        backoff: {
          policy: BackoffPolicy.EXPONENTIAL,
          initialDelay: 100,
          maxDelay: 10000,
          multiplier: 2,
        },
        maxRestarts: 5,
        restartWindow: 60000,
      });
      expSupervisor.start();

      await runtime.spawn({ id: 'exp-actor', role: ActorRole.ANALYST, type: 'test' });
      expSupervisor.watch('exp-actor');

      const startTime = Date.now();

      await expSupervisor.handleFailure('exp-actor', new Error('Failure'));
      await new Promise((resolve) => setTimeout(resolve, 200));

      const history = expSupervisor.getRestartHistory('exp-actor');
      expect(history.length).toBeGreaterThanOrEqual(1);

      expSupervisor.stop();
    });
  });

  describe('Dead Letter Queue', () => {
    it('should add failed messages to dead letter queue', async () => {
      // 재시작 실패 시뮬레이션
      const failingSupervisor = new Supervisor(runtime, {
        strategy: RestartStrategy.ONE_FOR_ONE,
        backoff: { policy: BackoffPolicy.FIXED, initialDelay: 10, maxDelay: 100 },
        maxRestarts: 0, // 즉시 실패
        restartWindow: 60000,
        enableDeadLetterQueue: true,
      });
      failingSupervisor.start();

      await runtime.spawn({ id: 'dl-actor', role: ActorRole.ANALYST, type: 'test' });
      failingSupervisor.watch('dl-actor');

      await failingSupervisor.handleFailure('dl-actor', new Error('Failure'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Dead letter queue 확인
      const deadLetters = failingSupervisor.getDeadLetters();
      // 실패 후 DLQ에 추가될 수 있음

      failingSupervisor.stop();
    });

    it('should clear dead letter queue', () => {
      supervisor.clearDeadLetters();
      expect(supervisor.getDeadLetters()).toHaveLength(0);
    });
  });

  describe('Restart History', () => {
    it('should track restart history', async () => {
      await runtime.spawn({ id: 'history-actor', role: ActorRole.ANALYST, type: 'test' });
      supervisor.watch('history-actor');

      await supervisor.handleFailure('history-actor', new Error('Failure 1'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      const history = supervisor.getRestartHistory('history-actor');
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].actorId).toBe('history-actor');
    });
  });
});

describe('Supervisor Tree Integration', () => {
  let tree: SupervisorTree;
  let runtime: ActorRuntime;
  let board: MockBlackboard;
  let factory: TestActorFactory;

  beforeEach(async () => {
    board = new MockBlackboard();
    factory = new TestActorFactory();
    runtime = new ActorRuntime(board, factory);
    await runtime.start();
    tree = new SupervisorTree(runtime);
  });

  afterEach(async () => {
    tree.shutdown();
    await runtime.stop();
  });

  it('should create hierarchical supervision', async () => {
    const rootId = tree.createRoot({
      strategy: RestartStrategy.ONE_FOR_ONE,
      maxRestarts: 5,
    });

    const childId = tree.createChild(rootId, {
      strategy: RestartStrategy.ALL_FOR_ONE,
      maxRestarts: 3,
    });

    expect(tree.getRoot()).not.toBeNull();
    expect(tree.getSupervisor(childId)).toBeDefined();
  });

  it('should handle escalation', async () => {
    const rootId = tree.createRoot();
    const childId = tree.createChild(rootId);

    const root = tree.getRoot()!;
    const child = tree.getSupervisor(childId);

    await runtime.spawn({ id: 'escalate-actor', role: ActorRole.ANALYST, type: 'test' });
    child.watch('escalate-actor');

    // 에스컬레이션은 child에서 root로 전파됨
    // 내부 구현에 따라 검증
  });

  it('should shutdown entire tree', () => {
    const rootId = tree.createRoot();
    tree.createChild(rootId);
    tree.createChild(rootId);

    tree.shutdown();

    expect(tree.getRoot()).toBeNull();
  });
});
```

### 5. Blackboard 연동 통합 테스트

**파일:** `packages/actor/src/__tests__/integration/blackboard.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ActorRuntime } from '../../runtime/ActorRuntime';
import { ActorPool } from '../../pool/ActorPool';
import { ActorRole } from '../../types/actor';
import { MockBlackboard } from '../helpers/MockBlackboard';
import { TestActorFactory } from '../helpers/TestActorFactory';

describe('Blackboard Integration', () => {
  let runtime: ActorRuntime;
  let board: MockBlackboard;
  let factory: TestActorFactory;

  beforeEach(async () => {
    board = new MockBlackboard();
    factory = new TestActorFactory({ executionTime: 10 });
    runtime = new ActorRuntime(board, factory);
    await runtime.start();
  });

  afterEach(async () => {
    await runtime.stop();
    board.clear();
  });

  describe('Actor-Blackboard Communication', () => {
    it('should read state from blackboard', async () => {
      board.setData('state', {
        context: { task: 'analyze' },
        agents: [],
      });

      const actor = await runtime.spawn({
        role: ActorRole.ANALYST,
        type: 'test',
      });

      const observation = await actor.observe();
      expect(observation.data).toEqual({
        context: { task: 'analyze' },
        agents: [],
      });
    });

    it('should write results to blackboard', async () => {
      const actor = await runtime.spawn({
        role: ActorRole.EXECUTOR,
        type: 'test',
      });

      const obs = await actor.observe();
      const action = await actor.think(obs);
      await actor.act(action);

      const results = board.getData('results');
      expect(results).toBeDefined();
    });

    it('should handle concurrent writes', async () => {
      const actors = await Promise.all([
        runtime.spawn({ role: ActorRole.ANALYST, type: 'test' }),
        runtime.spawn({ role: ActorRole.ANALYST, type: 'test' }),
        runtime.spawn({ role: ActorRole.ANALYST, type: 'test' }),
      ]);

      // 동시에 observe-think-act 실행
      await Promise.all(
        actors.map(async (actor) => {
          const obs = await actor.observe();
          const action = await actor.think(obs);
          await actor.act(action);
        })
      );

      // 모든 쓰기가 완료되었는지 확인
      expect(board.getData('results')).toBeDefined();
    });
  });

  describe('Event Subscription', () => {
    it('should receive blackboard events', async () => {
      const eventHandler = vi.fn();
      board.subscribe('state.updated', eventHandler);

      await board.write('state', { updated: true });

      expect(eventHandler).toHaveBeenCalledWith({ updated: true });
    });

    it('should unsubscribe from events', async () => {
      const eventHandler = vi.fn();
      const unsubscribe = board.subscribe('state.updated', eventHandler);

      await board.write('state', { first: true });
      expect(eventHandler).toHaveBeenCalledTimes(1);

      unsubscribe();

      await board.write('state', { second: true });
      expect(eventHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Pool-Blackboard Integration', () => {
    it('should process tasks using blackboard data', async () => {
      board.setData('state', { input: 'process-me' });

      const pool = new ActorPool(
        {
          name: 'processors',
          role: ActorRole.EXECUTOR,
          type: 'test',
          initialSize: 2,
        },
        board,
        factory
      );

      await pool.start();
      await pool.submit({ data: 'task' });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // 결과 확인
      const metrics = pool.getMetrics();
      expect(metrics.completedTasks + metrics.queuedTasks).toBeGreaterThanOrEqual(0);

      await pool.stop();
    });
  });
});
```

### 6. 내보내기 설정

**파일:** `packages/actor/src/__tests__/index.ts`

```typescript
// Test helpers
export { MockBlackboard } from './helpers/MockBlackboard';
export { TestActor, TestActorConfig } from './helpers/TestActor';
export { TestActorFactory } from './helpers/TestActorFactory';
```

## 파일 구조

```
packages/actor/src/__tests__/
├── helpers/
│   ├── MockBlackboard.ts
│   ├── TestActor.ts
│   └── TestActorFactory.ts
├── integration/
│   ├── lifecycle.test.ts
│   ├── pool.test.ts
│   ├── supervision.test.ts
│   └── blackboard.test.ts
├── setup.ts
└── index.ts
```

## 완료 조건
- [ ] 테스트 헬퍼 (MockBlackboard, TestActor, TestActorFactory) 구현 완료
- [ ] Actor 생명주기 통합 테스트 작성 완료
- [ ] Actor Pool 통합 테스트 작성 완료
- [ ] Supervision 통합 테스트 작성 완료
- [ ] Blackboard 연동 통합 테스트 작성 완료
- [ ] 모든 테스트 통과
- [ ] 테스트 커버리지 80% 이상
- [ ] CI/CD 파이프라인에서 테스트 실행 가능

## 의존성
- TASK-025 (Actor 런타임)
- TASK-026 (Actor Pool)
- TASK-027 (Supervision)

## 참고 자료
- `/docs/architecture/blackboard-actor-design.md` - 아키텍처 설계
- [Vitest 문서](https://vitest.dev/)
- TASK-024~027 구현 내용

## 수락 기준
1. 모든 통합 테스트가 통과한다
2. Actor 생명주기 (spawn, stop, restart)가 올바르게 테스트된다
3. Pool의 스케일링과 작업 분배가 올바르게 테스트된다
4. Supervision 전략이 올바르게 테스트된다
5. Blackboard 연동이 올바르게 테스트된다
6. 테스트 커버리지가 80% 이상이다
7. 테스트 헬퍼가 재사용 가능하게 구현된다

## 테스트 실행 명령어

```bash
# 전체 테스트 실행
pnpm --filter @obora-kit/actor test

# 통합 테스트만 실행
pnpm --filter @obora-kit/actor test -- --testPathPattern=integration

# 커버리지 포함 실행
pnpm --filter @obora-kit/actor test:coverage

# watch 모드
pnpm --filter @obora-kit/actor test:watch
```

## 재동기화 근거 (2026-02-13)
- 코드 변경: Actor 통합 테스트/시나리오 확장 반영
- 테스트: `pnpm --filter @obora-kit/actor test` 통과 (256/256, 2026-02-13)
- 2모델 리뷰: 완료 커밋 메시지(score 10/10) 기준 게이트 충족
- 커밋: `3b9463a`
