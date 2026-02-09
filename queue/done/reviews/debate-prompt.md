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
# TASK-025: Actor 런타임 구현

## 개요
- **상태**: 📋 대기
- 우선순위: P1
- 예상 소요: 8시간
- 담당: 개발자
- Phase: Week 3-4

## 목표
Actor 런타임을 구현하여 Actor의 생명주기(spawn, stop, restart)를 관리하고 Blackboard와 연동합니다.

## 작업 내용

### 1. ActorRuntime 클래스 정의

**파일:** `packages/actor/src/runtime/ActorRuntime.ts`

#### 기본 인터페이스

```typescript
import { Actor, ActorId, ActorLifecycleStatus, ActorRole } from '../types/actor';
import { IBlackboard } from '../types/blackboard';
import { IMessageBus } from '../types/message';
import { ActorFactory, ActorConfig } from './types';

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

  constructor(board: IBlackboard, messageBus: IMessageBus, factory: ActorFactory, config?: RuntimeConfig) {
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
  }

  /**
   * 런타임 시작
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Runtime is already running');
    }
    this.isRunning = true;
    this.log('Runtime started');
  }

  /**
   * 런타임 종료
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.log('Stopping runtime...');

    // 모든 Actor 중지
    const stopPromises = Array.from(this.actors.values()).map((actor) =>
      this.stopActor(actor.id)
    );

    await Promise.allSettled(stopPromises);
    this.actors.clear();
    this.isRunning = false;

    this.log('Runtime stopped');
  }

  /**
   * 새 Actor 생성 (spawn)
   * @param config Actor 설정
   * @returns 생성된 Actor
   */
  async spawn(config: ActorConfig): Promise<Actor> {
    if (!this.isRunning) {
      throw new Error('Runtime is not running');
    }

    // 최대 Actor 수 체크
    if (this.actors.size >= this.config.maxActors) {
      throw new Error(`Maximum actors limit reached: ${this.config.maxActors}`);
    }

    // 중복 ID 체크
    if (this.actors.has(config.id)) {
      throw new Error(`Actor already exists: ${config.id}`);
    }

    this.log(`Spawning actor: ${config.id} (${config.role})`);

    // 상태 변경: CREATED → STARTING
    const startTime = Date.now();

    try {
      // Actor 생성
      const actor = await this.factory.create(config, this.board, this.messageBus);

      // Actor 시작
      await actor.start();

      // 등록
      this.actors.set(actor.id, actor);
      this.actorConfigs.set(actor.id, config);

      const duration = Date.now() - startTime;
      this.log(`Actor spawned: ${config.id} (${duration}ms)`);

      return actor;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log(`Actor spawn failed: ${config.id} (${duration}ms)`, error);
      throw error;
    }
  }

  /**
   * Actor 중지
   * @param actorId Actor ID
   */
  async stop(actorId: ActorId): Promise<void> {
    const actor = this.getActor(actorId);
    await this.stopActor(actor);
  }

  /**
   * Actor 재시작
   * @param actorId Actor ID
   * @param restartCount 현재 재시작 횟수 (내부용)
   */
  async restart(actorId: ActorId, restartCount = 0): Promise<Actor> {
    if (restartCount >= this.config.maxRestarts) {
      throw new Error(
        `Max restarts (${this.config.maxRestarts}) exceeded for actor: ${actorId}`
      );
    }

    const actor = this.getActor(actorId);
    const config = this.actorConfigs.get(actorId);

    if (!config) {
      throw new Error(`Actor config not found: ${actorId}`);
    }

    this.log(`Restarting actor: ${actorId} (attempt ${restartCount + 1})`);

    // 상태 변경: ERROR/STOPPED → RESTARTING
    actor['setStatus'](ActorLifecycleStatus.RESTARTING);

    try {
      // 기존 Actor 중지
      await this.stopActor(actor);

      // 백오프 대기
      const backoff = this.calculateBackoff(restartCount);
      if (backoff > 0) {
        await this.delay(backoff);
      }

      // 새 Actor 생성
      const newActor = await this.spawn(config);

      this.log(`Actor restarted: ${actorId}`);

      return newActor;
    } catch (error) {
      this.log(`Actor restart failed: ${actorId}`, error);
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
      .filter((actor) => actor.status === status)
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

  private async stopActor(actor: Actor): Promise<void> {
    this.log(`Stopping actor: ${actor.id}`);

    // 상태 변경: RUNNING → STOPPING
    actor['setStatus'](ActorLifecycleStatus.STOPPING);

    try {
      // 타임아웃과 함께 stop 호출
      await Promise.race([
        actor.stop(),
        this.delay(this.config.stopTimeout),
      ]);

      // 상태 변경: STOPPING → STOPPED
      actor['setStatus'](ActorLifecycleStatus.STOPPED);

      // 등록 해제
      this.actors.delete(actor.id);
      this.actorConfigs.delete(actor.id);

      this.log(`Actor stopped: ${actor.id}`);
    } catch (error) {
      // 상태 변경: STOPPING → ERROR
      actor['setStatus'](ActorLifecycleStatus.ERROR);
      this.log(`Actor stop failed: ${actor.id}`, error);
      throw error;
    }
  }

  /**
   * getActorConfig() 구현 방법 (스펙 기준)
   *
   * ActorConfig는 Actor 생성 시 필요한 설정 정보입니다.
   * 구현 방법은 다음과 같습니다:
   *
   * 1. **Map에 저장**: Actor 생성 시 actorConfigs Map에 config 저장
   * 2. **조회 방법**: getActorConfig()에서 Map에서 조회
   * 3. **용도**: 재시작 시 동일한 설정으로 Actor 재생성
   *
   * 참고: [[spec/13-actor.md|13-actor.md]] - ActorConfig 인터페이스
   *
   * @param actorId Actor ID
   * @returns ActorConfig
   */
  private getActorConfig(actorId: ActorId): ActorConfig {
    const config = this.actorConfigs.get(actorId);
    if (!config) {
      throw new Error(`Actor config not found: ${actorId}`);
    }
    return config;
  }

  /**
   * getActorConfig() 구현 방법 (스펙 기준)
   *
   * ActorConfig는 Actor 생성 시 필요한 설정 정보입니다.
   * 구현 방법은 다음과 같습니다:
   *
   * 1. **Map에 저장**: Actor 생성 시 actorConfigs Map에 config 저장
   * 2. **조회 방법**: getActorConfig()에서 Map에서 조회
   * 3. **용도**: 재시작 시 동일한 설정으로 Actor 재생성
   *
   * 참고: [[spec/13-actor.md|13-actor.md]] - ActorConfig 인터페이스
   *
   * @param actorId Actor ID
   * @returns ActorConfig
   */
  private getActorConfig(actorId: ActorId): ActorConfig {
    const config = this.actorConfigs.get(actorId);
    if (!config) {
      throw new Error(`Actor config not found: ${actorId}`);
    }
    return config;
  }

  private calculateBackoff(restartCount: number): number {
    const factor = Math.pow(2, restartCount);
    const backoff = this.config.initialBackoff * factor;
    return Math.min(backoff, this.config.maxBackoff);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
```

### 2. ActorFactory 인터페이스

**파일:** `packages/actor/src/runtime/types.ts`

```typescript
import { Actor, ActorId, ActorRole } from '../types/actor';
import { IBlackboard } from '../types/blackboard';
import { IMessageBus } from '../types/message';

/**
 * Actor 생성 설정 (스펙 기준)
 *
 * 참고: [[spec/13-actor.md|13-actor.md]]
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
   * Actor 인스턴스 생성 (스펙 기준)
   * @param config Actor 설정
   * @param board Blackboard 인스턴스
   * @param messageBus MessageBus 인스턴스
   * @returns 생성된 Actor 인스턴스
   */
  create(config: ActorConfig, board: IBlackboard, messageBus: IMessageBus): Promise<Actor> | Actor;
}
```

### 3. 기본 ActorFactory 구현

**파일:** `packages/actor/src/runtime/DefaultActorFactory.ts`

```typescript
import { Actor } from '../types/actor';
import { Blackboard } from '../types/blackboard';
import { ActorFactory, ActorConfig } from './types';

/**
 * Actor 클래스 등록소
 */
type ActorConstructor = new (
  id: string,
  role: any,
  board: Blackboard,
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
   * Actor 인스턴스 생성 (스펙 기준)
   * @param config Actor 설정
   * @param board Blackboard 인스턴스
   * @param messageBus MessageBus 인스턴스
   * @returns 생성된 Actor 인스턴스
   */
  create(config: ActorConfig, board: IBlackboard, messageBus: IMessageBus): Actor {
    const { id, name, role, type, config: actorConfig } = config;

    // 등록된 생성자 조회
    const Constructor = this.registry.get(type);
    if (!Constructor) {
      throw new Error(`Unknown actor type: ${type}`);
    }

    // Actor 생성
    const actor = new Constructor(
      id || this.generateId(role),
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
  private generateId(role: string): string {
    const uuid = crypto.randomUUID();
    return `${role}-${uuid}`;
  }
}
```

### 4. Actor 실행 루프 (옵션)

**파일:** `packages/actor/src/runtime/ActorRunner.ts`

```typescript
import { Actor, ActorStatus, Observation, Action, Result } from '../types/actor';

/**
 * Actor 실행 루프 옵션
 */
export interface RunnerOptions {
  /** 실행 간격 (ms) */
  interval?: number;

  /** 최대 연속 실행 횟수 */
  maxIterations?: number;

  /** 에러 발생 시 중지 여부 */
  stopOnError?: boolean;

  /** 종료 조건 콜백 */
  stopCondition?: () => boolean | Promise<boolean>;
}

/**
 * Actor 실행 루프
 *
 * Actor의 observe-think-act-report 사이클을 반복 실행합니다.
 */
export class ActorRunner {
  private readonly actor: Actor;
  private readonly options: Required<RunnerOptions>;
  private isRunning: boolean = false;
  private iterationCount: number = 0;
  private abortController: AbortController | null = null;

  constructor(actor: Actor, options?: RunnerOptions) {
    this.actor = actor;
    this.options = {
      interval: 1000,
      maxIterations: Infinity,
      stopOnError: true,
      stopCondition: () => false,
      ...options,
    };
  }

  /**
   * 실행 루프 시작
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Runner is already running');
    }

    this.isRunning = true;
    this.iterationCount = 0;
    this.abortController = new AbortController();

    while (this.isRunning) {
      // 종료 조건 확인
      if (await this.shouldStop()) {
        break;
      }

      // 최대 반복 횟수 확인
      if (this.iterationCount >= this.options.maxIterations) {
        break;
      }

      // Actor 상태 확인
      if (this.actor.status !== ActorStatus.RUNNING) {
        break;
      }

      try {
        // 한 사이클 실행
        await this.runCycle();
        this.iterationCount++;
      } catch (error) {
        if (this.options.stopOnError) {
          throw error;
        }
        // 에러 무지하고 계속
      }

      // 대기
      await this.delay(this.options.interval);
    }

    this.isRunning = false;
    this.abortController = null;
  }

  /**
   * 실행 루프 중지
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.abortController?.abort();
  }

  /**
   * 현재 실행 중인지 확인
   */
  running(): boolean {
    return this.isRunning;
  }

  /**
   * 현재 반복 횟수
   */
  getIterationCount(): number {
    return this.iterationCount;
  }

  // ==================== 내부 메서드 ====================

  private async runCycle(): Promise<void> {
    // 1. Observe (동기)
    const obs = this.actor.observe();

    // 2. Think (동기)
    const action = this.actor.think(obs);

    // 3. Act (동기)
    const result = this.actor.act(action);

    // 4. Report (동기)
    this.actor.report(result);
  }

  private async shouldStop(): Promise<boolean> {
    // AbortController 확인
    if (this.abortController?.signal.aborted) {
      return true;
    }

    // 종료 조건 확인
    return await this.options.stopCondition();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

### 5. 단위 테스트 작성

**파일:** `packages/actor/src/runtime/__tests__/ActorRuntime.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Actor, ActorRole, ActorLifecycleStatus } from '../../types/actor';
import { Blackboard } from '../../types/blackboard';
import { ActorRuntime } from '../ActorRuntime';
import { ActorFactory, ActorConfig } from '../types';

class MockActor implements Actor {
  readonly id: string;
  readonly name: string = 'mock';
  readonly role: ActorRole;
  board: Blackboard;
  readonly status: ActorLifecycleStatus = ActorLifecycleStatus.RUNNING;
  lastActivity: Date = new Date();
  createdAt: Date = new Date();
  metrics = {
    totalRuns: 0,
    successCount: 0,
    failureCount: 0,
    lastError: null,
    averageExecutionTime: 0,
    lastExecutionTime: null,
    totalCpuTime: 0,
    memoryUsage: 0,
  };

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
  createAsync(_config: ActorConfig, _board: Blackboard, _messageBus: any): Promise<Actor> {
    return Promise.resolve(new MockActor('test-id', 'analyst', _board));
  }
}

describe('ActorRuntime', () => {
  let runtime: ActorRuntime;
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
    runtime = new ActorRuntime(board, factory, { debug: false });
  });

  describe('start/stop', () => {
    it('should start runtime', async () => {
      await runtime.start();
      const status = runtime.getStatus();
      expect(status.running).toBe(true);
    });

    it('should stop runtime', async () => {
      await runtime.start();
      await runtime.stop();
      const status = runtime.getStatus();
      expect(status.running).toBe(false);
    });

    it('should throw when starting already running runtime', async () => {
      await runtime.start();
      await expect(runtime.start()).rejects.toThrow('Runtime is already running');
    });
  });

  describe('spawn', () => {
    beforeEach(async () => {
      await runtime.start();
    });

    it('should spawn actor successfully', async () => {
      const config = {
        id: 'test-actor-1',
        role: ActorRole.ANALYST,
        type: 'mock',
      };
      const actor = await runtime.spawn(config);

      expect(actor).toBeInstanceOf(MockActor);
      expect(actor.id).toBe('test-actor-1');
      expect(actor.role).toBe(ActorRole.ANALYST);
      expect(runtime.hasActor('test-actor-1')).toBe(true);
      expect(runtime.size()).toBe(1);
    });

    it('should throw when runtime is not running', async () => {
      await runtime.stop();
      const config = {
        id: 'test-actor-1',
        role: ActorRole.ANALYST,
        type: 'mock',
      };

      await expect(runtime.spawn(config)).rejects.toThrow('Runtime is not running');
    });

    it('should throw when max actors limit reached', async () => {
      const runtimeWithLimit = new ActorRuntime(board, factory, { maxActors: 2, debug: false });
      await runtimeWithLimit.start();

      await runtimeWithLimit.spawn({ role: ActorRole.ANALYST, type: 'mock' });
      await runtimeWithLimit.spawn({ role: ActorRole.ANALYST, type: 'mock' });

      await expect(
        runtimeWithLimit.spawn({ role: ActorRole.ANALYST, type: 'mock' })
      ).rejects.toThrow('Maximum actors limit reached');
    });

    it('should throw when actor ID already exists', async () => {
      const config = {
        id: 'test-actor-1',
        role: ActorRole.ANALYST,
        type: 'mock',
      };
      await runtime.spawn(config);

      await expect(runtime.spawn(config)).rejects.toThrow('Actor already exists');
    });
  });

  describe('stop', () => {
    beforeEach(async () => {
      await runtime.start();
      await runtime.spawn({
        id: 'test-actor-1',
        role: ActorRole.ANALYST,
        type: 'mock',
      });
    });

    it('should stop actor successfully', async () => {
      await runtime.stop('test-actor-1');
      expect(runtime.hasActor('test-actor-1')).toBe(false);
      expect(runtime.size()).toBe(0);
    });

    it('should throw when actor not found', async () => {
      await expect(runtime.stop('non-existent')).rejects.toThrow('Actor not found');
    });
  });

  describe('restart', () => {
    beforeEach(async () => {
      await runtime.start();
      await runtime.spawn({
        id: 'test-actor-1',
        role: 'analyst',
        type: 'mock',
      });
    });

    it('should restart actor successfully', async () => {
      const newActor = await runtime.restart('test-actor-1');
      expect(newActor).toBeInstanceOf(MockActor);
      expect(newActor.id).toBe('test-actor-1');
    });

    it('should respect max restarts limit', async () => {
      const runtimeWithLimit = new ActorRuntime(board, factory, {
        maxRestarts: 2,
        debug: false,
      });
      await runtimeWithLimit.start();

      await runtimeWithLimit.spawn({
        id: 'test-actor-1',
        role: 'analyst',
        type: 'mock',
      });

      // First restart should succeed
      await runtimeWithLimit.restart('test-actor-1', 1);

      // Second restart should fail
      await expect(
        runtimeWithLimit.restart('test-actor-1', 2)
      ).rejects.toThrow('Max restarts');
    });
  });

  describe('query methods', () => {
    beforeEach(async () => {
      await runtime.start();
      await runtime.spawn({
        id: 'analyst-1',
        role: 'analyst',
        type: 'mock',
      });
      await runtime.spawn({
        id: 'analyst-2',
        role: 'analyst',
        type: 'mock',
      });
      await runtime.spawn({
        id: 'executor-1',
        role: 'executor',
        type: 'mock',
      });
    });

    it('should list all actors', () => {
      const actors = runtime.listActors();
      expect(actors).toHaveLength(3);
      expect(actors).toContain('analyst-1');
      expect(actors).toContain('analyst-2');
      expect(actors).toContain('executor-1');
    });

    it('should list actors by role', () => {
      const analysts = runtime.listActorsByRole('analyst');
      expect(analysts).toHaveLength(2);
      expect(analysts).toContain('analyst-1');
      expect(analysts).toContain('analyst-2');

      const executors = runtime.listActorsByRole('executor');
      expect(executors).toHaveLength(1);
      expect(executors).toContain('executor-1');
    });

    it('should list actors by status', () => {
      const running = runtime.listActorsByStatus(ActorLifecycleStatus.RUNNING);
      expect(running).toHaveLength(3);
    });

    it('should get actor by id', () => {
      const actor = runtime.getActor('analyst-1');
      expect(actor).toBeInstanceOf(MockActor);
      expect(actor.id).toBe('analyst-1');
    });

    it('should throw when getting non-existent actor', () => {
      expect(() => runtime.getActor('non-existent')).toThrow('Actor not found');
    });
  });
});
```

**파일:** `packages/actor/src/runtime/__tests__/DefaultActorFactory.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Actor, ActorRole } from '../../types/actor';
import { Blackboard } from '../../types/blackboard';
import { DefaultActorFactory } from '../DefaultActorFactory';

class TestActor implements Actor {
  readonly id: string;
  readonly role: ActorRole;
  board: Blackboard;
  readonly status = 'running' as any;
  lastActivity: Date = new Date();
  createdAt: Date = new Date();
  metrics = { totalRuns: 0, successCount: 0, failureCount: 0, lastError: null, averageExecutionTime: 0, lastExecutionTime: null, totalCpuTime: 0, memoryUsage: 0 };

  constructor(id: string, role: ActorRole, board: Blackboard) {
    this.id = id;
    this.role = role;
    this.board = board;
  }

  async observe() { return { timestamp: new Date(), section: 'test', data: null, metadata: { source: 'read', latency: 0 } }; }
  async think() { return { id: '1', type: 'read', params: {}, priority: 0, createdAt: new Date() }; }
  async act() { return { actionId: '1', success: true, data: null, error: null, executionTime: 10, completedAt: new Date(), metadata: { retryCount: 0, resources: { cpu: 0, memory: 0 } } }; }
  async report() { /* mock */ }
  async stop() { /* mock */ }
  getStatus() { return this.status; }
}

describe('DefaultActorFactory', () => {
  let factory: DefaultActorFactory;
  let board: Blackboard;

  beforeEach(() => {
    factory = new DefaultActorFactory();
    board = {
      read: async () => {},
      write: async () => {},
      subscribe: () => () => {},
      version: 1,
    };
  });

  it('should register and create actor', () => {
    factory.register('test', TestActor as any);

    const actor = factory.create(
      { id: 'test-id', role: ActorRole.ANALYST, type: 'test' },
      board
    );

    expect(actor).toBeInstanceOf(TestActor);
    expect(actor.id).toBe('test-id');
  });

  it('should auto-generate actor id if not provided', () => {
    factory.register('test', TestActor as any);

    const actor = factory.create(
      { role: ActorRole.ANALYST, type: 'test' },
      board
    );

    expect(actor.id).toMatch(/^analyst-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('should throw for unknown actor type', () => {
    expect(() => {
      factory.create(
        { role: ActorRole.ANALYST, type: 'unknown' },
        board
      );
    }).toThrow('Unknown actor type: unknown');
  });

  it('should unregister actor type', () => {
    factory.register('test', TestActor as any);
    factory.unregister('test');

    expect(() => {
      factory.create(
        { role: ActorRole.ANALYST, type: 'test' },
        board
      );
    }).toThrow('Unknown actor type: test');
  });
});
```

**파일:** `packages/actor/src/runtime/__tests__/ActorRunner.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActorRunner } from '../ActorRunner';
import { Actor, ActorStatus, ActorRole } from '../../types/actor';

class TestActor implements Actor {
  readonly id = 'test-actor';
  readonly role = ActorRole.ANALYST;
  board: any;
  readonly status = ActorStatus.RUNNING;
  lastActivity = new Date();
  createdAt = new Date();
  metrics = { totalRuns: 0, successCount: 0, failureCount: 0, lastError: null, averageExecutionTime: 0, lastExecutionTime: null, totalCpuTime: 0, memoryUsage: 0 };

  observe = vi.fn().mockResolvedValue({ timestamp: new Date(), section: 'test', data: null, metadata: { source: 'read', latency: 0 } });
  think = vi.fn().mockResolvedValue({ id: '1', type: 'read', params: {}, priority: 0, createdAt: new Date() });
  act = vi.fn().mockResolvedValue({ actionId: '1', success: true, data: null, error: null, executionTime: 10, completedAt: new Date(), metadata: { retryCount: 0, resources: { cpu: 0, memory: 0 } } });
  report = vi.fn().mockResolvedValue(undefined);
  stop = vi.fn().mockResolvedValue(undefined);
  getStatus = vi.fn().mockReturnValue(ActorStatus.RUNNING);
}

describe('ActorRunner', () => {
  let runner: ActorRunner;
  let actor: TestActor;

  beforeEach(() => {
    actor = new TestActor();
    runner = new ActorRunner(actor, {
      interval: 10, // 빠른 테스트를 위해 짧게 설정
      maxIterations: 3,
    });
  });

  it('should run cycles', async () => {
    await runner.start();

    expect(actor.observe).toHaveBeenCalledTimes(3);
    expect(actor.think).toHaveBeenCalledTimes(3);
    expect(actor.act).toHaveBeenCalledTimes(3);
    expect(actor.report).toHaveBeenCalledTimes(3);
    expect(runner.getIterationCount()).toBe(3);
  });

  it('should stop after max iterations', async () => {
    await runner.start();
    expect(runner.getIterationCount()).toBe(3);
    expect(runner.running()).toBe(false);
  });

  it('should stop manually', async () => {
    runner.start();
    await new Promise(resolve => setTimeout(resolve, 20));
    runner.stop();

    const count = runner.getIterationCount();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(runner.getIterationCount()).toBe(count);
  });

  it('should respect stop condition', async () => {
    let shouldStop = false;
    const runnerWithCondition = new ActorRunner(actor, {
      interval: 10,
      stopCondition: () => shouldStop,
    });

    setTimeout(() => { shouldStop = true; }, 25);
    await runnerWithCondition.start();

    expect(runnerWithCondition.getIterationCount()).toBeLessThan(5);
  });

  it('should throw when starting already running runner', async () => {
    const startPromise = runner.start();
    await expect(runner.start()).rejects.toThrow('Runner is already running');
    await startPromise;
  });
});
```

### 6. 내보내기 설정

**파일:** `packages/actor/src/runtime/index.ts`

```typescript
export * from './ActorRuntime';
export * from './types';
export * from './DefaultActorFactory';
export * from './ActorRunner';
```

**파일:** `packages/actor/src/index.ts` (업데이트)

```typescript
export * from './types';
export * from './base/BaseActor';
export * from './runtime';
```

## 파일 구조

```
packages/actor/src/
├── runtime/
│   ├── __tests__/
│   │   ├── ActorRuntime.test.ts
│   │   ├── DefaultActorFactory.test.ts
│   │   └── ActorRunner.test.ts
│   ├── ActorRuntime.ts       # Actor 런타임
│   ├── types.ts              # 런타임 타입
│   ├── DefaultActorFactory.ts # 기본 팩토리
│   └── ActorRunner.ts        # 실행 루프
├── types/
├── base/
└── index.ts
```

## 완료 조건
- [ ] ActorRuntime 클래스 구현 완료
- [ ] spawn(config) 메서드 구현 완료
- [ ] stop(actorId) 메서드 구현 완료
- [ ] restart(actorId) 메서드 구현 완료
- [ ] ActorFactory 인터페이스 정의 완료
- [ ] DefaultActorFactory 구현 완료
- [ ] ActorRunner (옵션) 구현 완료
- [ ] Blackboard 연동 완료
- [ ] 단위 테스트 작성 완료
- [ ] 테스트 커버리지 85% 이상
- [ ] TypeScript 타입 체크 통과

## 의존성
- TASK-024 (Actor 인터페이스)

## 참고 자료
- `/docs/architecture/blackboard-actor-design.md` - 아키텍처 설계
- TASK-024 - Actor 인터페이스

## 수락 기준
1. Actor 런타임이 Actor의 생명주기를 올바르게 관리한다
2. spawn/stop/restart 작업이 타임아웃을 준수한다
3. 재시작 시 백오프 정책이 적용된다
4. 최대 Actor 수 제한이 동작한다
5. Blackboard와 연결된 Actor가 데이터를 읽고 쓸 수 있다
6. 단위 테스트가 모든 주요 시나리오를 커버한다
]]></task_spec>

  <source_code>

  </source_code>

  <reviews>
    <opus_review><![CDATA[


I'll verify each checklist item against the actual code. Let me first explore the codebase to find the relevant files.
Good. Now let me read all the relevant source files and test files in parallel.
Now let me also check the delay utility:
Now I have all the code. Let me verify each checklist item systematically.

# 체크리스트 검증 결과

## 항목별 결과

- **[PASS] 1. stopActor에서 stop 실패/타임아웃 시에도 actor를 Map에서 항상 삭제**
  근거: `ActorRuntime.ts:375-377` — `stopActor` 메서드에서 `finally` 블록을 사용하여 성공/실패/타임아웃 여부와 무관하게 항상 `this.actors.delete(actorId)` 및 `this.actorConfigs.delete(actorId)`를 실행합니다.

- **[PASS] 2. stop() 메서드의 falsy ActorId 분기 문제**
  근거: `ActorRuntime.ts:93-94` — `stop(actorId?: ActorId)` 메서드에서 `actorId !== undefined`로 엄격하게 검사합니다. falsy 값(`""` 등)도 빈 문자열은 `ActorId` 브랜드 타입에 해당하지 않으므로, `undefined` 체크로 충분히 분기를 구분합니다.

- **[PASS] 3. ActorRunner의 주석-코드 불일치: 에러 로깅이 debug 모드에서만 동작**
  근거: `ActorRunner.ts:156-161` — `log` 메서드에서 에러가 있을 때(`if (error)`)는 `debug` 모드와 무관하게 `console.error`를 호출합니다. `debug` 조건은 에러가 없는 일반 로그에만 적용됩니다. 또한 `ActorRunner.test.ts:159-177`에 이를 검증하는 테스트(`"should log errors even when debug mode is disabled"`)가 추가되어 있습니다.

- **[PASS] 4. Method name collision — `stop()` 중복 정의 (Gemini)**
  근거: `ActorRuntime.ts:93` — `stop(actorId?: ActorId)` 메서드가 하나만 존재하며, 인자 유무에 따라 런타임 종료와 개별 Actor 중지를 분기합니다. 스펙에서 별도였던 `stop()` (런타임)과 `stop(actorId)` (Actor)가 하나의 오버로드된 메서드로 통합되었습니다. `stopActor`는 `private` 메서드(`ActorRuntime.ts:347`)로 내부에서만 사용됩니다. 중복 정의 문제는 해결되었습니다.

- **[PASS] 5. Constructor and Method signature mismatches in Tests (Gemini)**
  근거: 테스트의 `MockActor` 생성자 시그니처 (`ActorRuntime.test.ts:45-51`: `id, name, role, board, messageBus`)와 `MockFactory.create` (`ActorRuntime.test.ts:128-132`)가 올바르게 일치합니다. `DefaultActorFactory.test.ts`의 `TestActor`도 동일한 시그니처를 사용하며(`DefaultActorFactory.test.ts:44-49`), `ActorRuntime` 생성자도 `(board, messageBus, factory, config?)` 순서로 올바르게 호출됩니다(`ActorRuntime.test.ts:162`).

- **[PASS] 6. ActorRunner fails to await async Actor methods (Gemini)**
  근거: `ActorRunner.ts:132-143` — `runCycle` 메서드에서 모든 Actor 메서드 호출에 `await`를 사용합니다: `await this.actor.observe()`, `await this.actor.think(obs)`, `await this.actor.act(action)`, `await this.actor.report(result)`. Actor 인터페이스(`actor.ts:217-237`)에서 이 메서드들은 `T | Promise<T>` 반환 타입을 가지므로 `await`가 적절합니다.

- **[PASS] 7. DefaultActorFactory constructor arguments mismatch (Gemini)**
  근거: `DefaultActorFactory.ts:10-17` — `ActorConstructor` 타입이 `(id, name, role, board, messageBus, config?)` 순서로 정의되어 있고, `create` 메서드(`DefaultActorFactory.ts:68-74`)에서 `new Constructor(actorId, name || ..., role, board, messageBus, actorConfig)` 순서로 호출합니다. 인자 개수와 순서가 일치합니다.

- **[PASS] 8. 테스트 코드의 Actor.status 타입 불일치 (GLM)**
  근거: `Actor` 인터페이스(`actor.ts:194`)에서 `status`는 `ActorStatus` 타입(객체)으로 정의되어 있습니다. 테스트의 `MockActor`(`ActorRuntime.test.ts:25-40`, `57-72`)에서 `status`를 `ActorStatus` 구조체(id, name, role, status, messageQueue, metrics 등 포함)로 올바르게 정의하고 있습니다. `ActorRunner.test.ts:41-71`에서도 동일하게 올바른 타입으로 정의되어 있습니다. 이전 스펙에서 `status`를 enum 값으로 직접 사용하던 문제가 해결되었습니다.

## 점수
- 통과: 8/8
- **총점: 10/10**
]]></opus_review>
    <codex_review><![CDATA[
# Checklist Verification Result

## Item Results
- [PASS] Item1: `packages/actor/src/runtime/ActorRuntime.ts:75`
- [PASS] Item2: `packages/actor/src/runtime/ActorRuntime.ts:93`
- [PASS] Item3: `packages/actor/src/runtime/ActorRunner.ts:82`
- [PASS] Item4: `packages/actor/src/runtime/ActorRuntime.ts:93`
- [PASS] Item5: `packages/actor/src/runtime/__tests__/ActorRuntime.test.ts:62`
- [PASS] Item6: `packages/actor/src/runtime/ActorRunner.ts:32`
- [PASS] Item7: `packages/actor/src/runtime/DefaultActorFactory.ts:55`
- [PASS] Item8: `packages/actor/src/runtime/__tests__/ActorRunner.test.ts:41`

## Score
- Passed: 8/8
- **Total: 10/10**

## Fix for FAIL Items
None.
]]></codex_review>
    <glm_review><![CDATA[
I'll verify each checklist item by examining the actual code. Let me start by finding the relevant files.
Now let me check the Actor types and the types.ts file:
Now let me analyze each checklist item:

# 체크리스트 검증 결과

## 항목별 결과

- [PASS] 항목1: stopActor에서 stop 실패/타임아웃 시에도 actor를 Map에서 항상 삭제 (ActorRuntime.ts:375-379)
  - `stopActor` 메서드의 `finally` 블록에서 항상 `this.actors.delete(actorId)`와 `this.actorConfigs.delete(actorId)` 호출

- [PASS] 항목2: stop() 메서드의 falsy ActorId 분기 문제 (ActorRuntime.ts:93-114)
  - `if (actorId !== undefined)`로 명시적으로 `undefined`만 체크하여 런타임 종료와 Actor 중지를 구분

- [PASS] 항목3: ActorRunner의 주석-코드 불일치: 에러 로깅이 debug 모드에서만 동작 (ActorRunner.ts:156-162, 83-84)
  - `log` 메서드에서 error가 있을 경우 `console.error`로 debug 모드와 무관하게 항상 로그 출력
  - 주석 "// 에러 로깅 (debug 모드와 무관하게 항상 로그)"이 코드 동작과 일치

- [PASS] 항목4: Method name collision - `stop()` 중복 정의 (Gemini) (ActorRuntime.ts:93-114)
  - 단일 `stop(actorId?: ActorId)` 메서드로 두 가지 기능(Actor 중지, 런타임 종료)을 처리하는 overload가 아닌 optional parameter 패턴 사용

- [PASS] 항목5: Constructor and Method signature mismatches in Tests (Gemini) (actor.ts:186-263, DefaultActorFactory.ts:10-17, types.ts:39)
  - Actor 인터페이스의 `start()`, `stop()`, `restart()`, `receive()`, `observe()`, `think()`, `act()`, `report()` 메서드가 모두 `void | Promise<void>` 타입을 지원
  - Test mock 구현이 동기 메서드를 사용하고 ActorRunner에서 `await`를 사용하는 패턴이 올바름

- [PASS] 항목6: ActorRunner fails to await async Actor methods (Gemini) (ActorRunner.ts:132-143)
  - `runCycle` 메서드에서 `await this.actor.observe()`, `await this.actor.think(obs)`, `await this.actor.act(action)`, `await this.actor.report(result)`로 모든 메서드가 올바르게 await됨

- [PASS] 항목7: DefaultActorFactory constructor arguments mismatch (Gemini) (DefaultActorFactory.ts:10-17, 55-78)
  - `ActorConstructor` 타입과 `DefaultActorFactory.create()`에서 Actor 생성자 호출이 일치
  - 테스트의 `MockActor` 생성자 시그니처가 `(id: string, name: string, role: ActorRole, board: IBlackboard, messageBus: IMessageBus)`로 일치

- [PASS] 항목8: 테스트 코드의 Actor.status 타입 불일치 (GLM) (actor.ts:186-194, ActorRunner.test.ts:41-71, ActorRuntime.test.ts:25-40, DefaultActorFactory.test.ts:24-39)
  - Actor 인터페이스의 `status: ActorStatus`는 객체 타입이며 `ActorStatus.status: ActorLifecycleStatus` 프로퍼티 포함
  - Test mock의 `status` 객체 구조가 올바르게 `status.status` 프로퍼티 포함
  - ActorRunner의 `this.actor.status.status` 접근이 올바름

## 점수
- 통과: 8/8
- **총점: 10/10**
]]></glm_review>
    <gemini_review><![CDATA[
I will begin by listing the files in the `packages/actor/src/runtime` directory to confirm their existence and locations. Subsequently, I will read the contents of these files to verify each item on the checklist.
I will read `packages/actor/src/runtime/ActorRuntime.ts`, `packages/actor/src/runtime/ActorRunner.ts`, and `packages/actor/src/runtime/DefaultActorFactory.ts` to examine the implementation and check for any issues. I will also review the test files to identify any mismatches.
I will read the `packages/actor/src/types/actor.ts` file to confirm the `Actor` interface and the type of its `status` property.
I will read `packages/actor/src/runtime/__tests__/DefaultActorFactory.test.ts` to verify the constructor and method signatures.
I will read `packages/actor/src/runtime/__tests__/ActorRunner.test.ts` to examine its implementation and check for any potential issues.
# Checklist Verification Result

## Item Results
- [PASS] Item1: `stopActor` uses a `finally` block to ensure actor deletion from `this.actors` and `this.actorConfigs` even on failure or timeout (ActorRuntime.ts:375-379).
- [PASS] Item2: `stop()` method correctly uses `actorId !== undefined` to avoid issues with potential falsy `ActorId` values (ActorRuntime.ts:94).
- [PASS] Item3: `ActorRunner` logs errors regardless of the `debug` setting, matching its documentation (ActorRunner.ts:157-161).
- [PASS] Item4: Method name collision is resolved; only one `stop()` method exists in `ActorRuntime`, using an optional `actorId` parameter (ActorRuntime.ts:93).
- [PASS] Item5: Constructor and method signatures in tests (`ActorRuntime.test.ts`, `DefaultActorFactory.test.ts`) have been updated to match the current implementation (ActorRuntime.test.ts:45, 128, 162).
- [PASS] Item6: `ActorRunner` correctly awaits all asynchronous actor methods within the execution cycle (ActorRunner.ts:134-143).
- [PASS] Item7: `DefaultActorFactory` uses a consistent `ActorConstructor` type that matches both the `create` method and the registered actor implementations (DefaultActorFactory.ts:10, 68).
- [PASS] Item8: `MockActor` in test files correctly implements the `ActorStatus` interface, ensuring type compatibility with `ActorRuntime`'s status access (ActorRuntime.test.ts:25, 57).

## Score
- Passed: 8/8
- **Total: 10/10**
]]></gemini_review>
  </reviews>
</debate>

위의 XML을 따라서 4개 모델의 리뷰를 종합 판정하고 결과를 마크다운으로 출력하세요.
