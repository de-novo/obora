<review>
  <mode>checklist_verification</mode>
  <task>
    <name>TASK-027-supervision</name>
    <spec><![CDATA[
# TASK-027: Supervision 패턴 구현

## 개요
- **상태**: 📋 대기
- 우선순위: P1
- 예상 소요: 8시간
- 담당: 개발자
- Phase: Week 3-4

## 목표
Actor 시스템의 안정성을 보장하기 위해 Supervision 패턴을 구현합니다. 재시작 전략, 백오프 정책, Dead Letter Queue를 통해 Actor 실패 시 복구 메커니즘을 제공합니다.

## 작업 내용

### 1. Supervision 전략 정의

**파일:** `packages/actor/src/supervision/types.ts`

```typescript
import { ActorId, Actor } from '../types/actor';

/**
 * 재시작 전략 유형
 */
export enum RestartStrategy {
  /**
   * OneForOne: 실패한 Actor만 재시작
   * - 다른 Actor에 영향 없음
   * - 독립적인 Actor에 적합
   */
  ONE_FOR_ONE = 'one-for-one',

  /**
   * AllForOne: 하나가 실패하면 모든 Actor 재시작
   * - 강한 의존성이 있는 Actor 그룹에 적합
   * - 일관된 상태 복원 필요 시 사용
   */
  ALL_FOR_ONE = 'all-for-one',

  /**
   * RestForOne: 실패한 Actor와 이후 생성된 Actor들 재시작
   * - 순서 의존성이 있는 Actor에 적합
   */
  REST_FOR_ONE = 'rest-for-one',
}

/**
 * 재시작 지시
 */
export enum RestartDirective {
  /** 재시작 */
  RESTART = 'restart',

  /** 재시작하지 않음 (정상 종료 처리) */
  STOP = 'stop',

  /** 상위 Supervisor로 에스컬레이션 */
  ESCALATE = 'escalate',
}

/**
 * 백오프 정책 유형
 */
export enum BackoffPolicy {
  /** 고정 대기 시간 */
  FIXED = 'fixed',

  /** 지수 백오프 */
  EXPONENTIAL = 'exponential',

  /** 선형 백오프 */
  LINEAR = 'linear',

  /** 지터가 포함된 지수 백오프 */
  EXPONENTIAL_JITTER = 'exponential-jitter',
}

/**
 * 백오프 설정
 */
export interface BackoffConfig {
  /** 백오프 정책 */
  policy: BackoffPolicy;

  /** 초기 대기 시간 (ms) */
  initialDelay: number;

  /** 최대 대기 시간 (ms) */
  maxDelay: number;

  /** 지수/선형 배율 */
  multiplier?: number;

  /** 지터 범위 (0-1) */
  jitterFactor?: number;
}

/**
 * Supervisor 설정
 */
export interface SupervisorConfig {
  /** 재시작 전략 */
  strategy: RestartStrategy;

  /** 백오프 설정 */
  backoff: BackoffConfig;

  /** 최대 재시작 횟수 (기간 내) */
  maxRestarts: number;

  /** 재시작 횟수 리셋 기간 (ms) */
  restartWindow: number;

  /** 재시작 결정 함수 (커스텀 로직) */
  decider?: (error: Error, actor: Actor) => RestartDirective;

  /** Dead Letter Queue 활성화 */
  enableDeadLetterQueue?: boolean;

  /** Dead Letter Queue 최대 크기 */
  deadLetterQueueSize?: number;

  /** 디버그 모드 */
  debug?: boolean;
}

/**
 * 재시작 이력
 */
export interface RestartHistory {
  /** Actor ID */
  actorId: ActorId;

  /** 재시작 시간 */
  timestamp: Date;

  /** 재시작 원인 에러 */
  error: Error;

  /** 재시작 시도 횟수 */
  attempt: number;

  /** 재시작 성공 여부 */
  success: boolean;
}

/**
 * Dead Letter
 */
export interface DeadLetter {
  /** 원본 메시지/작업 */
  payload: unknown;

  /** 실패한 Actor ID */
  actorId: ActorId;

  /** 실패 에러 */
  error: Error;

  /** 실패 시간 */
  timestamp: Date;

  /** 재시도 횟수 */
  retryCount: number;
}

/**
 * Supervisor 이벤트
 */
export interface SupervisorEvents {
  /** Actor 실패 시 */
  'actor:failed': (actorId: ActorId, error: Error) => void;

  /** Actor 재시작 시 */
  'actor:restarted': (actorId: ActorId, attempt: number) => void;

  /** Actor 영구 정지 시 */
  'actor:stopped': (actorId: ActorId, reason: string) => void;

  /** Dead Letter 발생 시 */
  'dead-letter': (letter: DeadLetter) => void;

  /** 최대 재시작 초과 시 */
  'max-restarts-exceeded': (actorId: ActorId) => void;
}
```

### 2. Supervisor 클래스 구현

**파일:** `packages/actor/src/supervision/Supervisor.ts`

```typescript
import { EventEmitter } from 'events';
import { Actor, ActorId, ActorLifecycleStatus, ActorStatus } from '../types/actor';
import { ActorRuntime } from '../runtime/ActorRuntime';
import {
  SupervisorConfig,
  RestartStrategy,
  RestartDirective,
  BackoffPolicy,
  BackoffConfig,
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
        return this.config.decider(error, actor);
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
    const { policy, initialDelay, maxDelay, multiplier = 2, jitterFactor = 0.1 } =
      this.config.backoff;

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

      case BackoffPolicy.EXPONENTIAL_JITTER:
        const base = initialDelay * Math.pow(multiplier, attempt - 1);
        const jitter = base * jitterFactor * (Math.random() * 2 - 1);
        delay = base + jitter;
        break;

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
```

### 3. SupervisorTree (계층적 Supervision)

**파일:** `packages/actor/src/supervision/SupervisorTree.ts`

```typescript
import { ActorId } from '../types/actor';
import { ActorRuntime } from '../runtime/ActorRuntime';
import { Supervisor } from './Supervisor';
import { SupervisorConfig, RestartStrategy } from './types';

/**
 * Supervisor 트리 노드
 */
interface SupervisorNode {
  id: string;
  supervisor: Supervisor;
  parent: string | null;
  children: Set<string>;
}

/**
 * Supervisor Tree
 *
 * 계층적인 Supervisor 구조를 관리합니다.
 * 상위 Supervisor가 하위 Supervisor와 Actor들을 감독합니다.
 */
export class SupervisorTree {
  private readonly nodes: Map<string, SupervisorNode>;
  private readonly runtime: ActorRuntime;
  private rootId: string | null;

  constructor(runtime: ActorRuntime) {
    this.runtime = runtime;
    this.nodes = new Map();
    this.rootId = null;
  }

  /**
   * 루트 Supervisor 생성
   * @param config Supervisor 설정
   * @returns 루트 Supervisor ID
   */
  createRoot(config?: Partial<SupervisorConfig>): string {
    if (this.rootId) {
      throw new Error('Root supervisor already exists');
    }

    const id = this.generateId('root');
    const supervisor = new Supervisor(this.runtime, config);

    this.nodes.set(id, {
      id,
      supervisor,
      parent: null,
      children: new Set(),
    });

    this.rootId = id;
    supervisor.start();

    // 에스컬레이션 처리 (루트는 에스컬레이션 불가)
    supervisor.on('escalate', (actorId: ActorId, error: Error) => {
      console.error(`[SupervisorTree] Escalation at root for ${actorId}:`, error);
    });

    return id;
  }

  /**
   * 자식 Supervisor 생성
   * @param parentId 부모 Supervisor ID
   * @param config Supervisor 설정
   * @returns 자식 Supervisor ID
   */
  createChild(
    parentId: string,
    config?: Partial<SupervisorConfig>
  ): string {
    const parent = this.nodes.get(parentId);
    if (!parent) {
      throw new Error(`Parent supervisor not found: ${parentId}`);
    }

    const id = this.generateId('child');
    const supervisor = new Supervisor(this.runtime, config);

    this.nodes.set(id, {
      id,
      supervisor,
      parent: parentId,
      children: new Set(),
    });

    parent.children.add(id);
    supervisor.start();

    // 에스컬레이션 처리
    supervisor.on('escalate', (actorId: ActorId, error: Error) => {
      this.handleEscalation(id, actorId, error);
    });

    return id;
  }

  /**
   * Supervisor 조회
   * @param id Supervisor ID
   * @returns Supervisor 인스턴스
   */
  getSupervisor(id: string): Supervisor {
    const node = this.nodes.get(id);
    if (!node) {
      throw new Error(`Supervisor not found: ${id}`);
    }
    return node.supervisor;
  }

  /**
   * 루트 Supervisor 조회
   */
  getRoot(): Supervisor | null {
    if (!this.rootId) {
      return null;
    }
    return this.nodes.get(this.rootId)?.supervisor || null;
  }

  /**
   * Supervisor 제거
   * @param id Supervisor ID
   */
  remove(id: string): void {
    const node = this.nodes.get(id);
    if (!node) {
      return;
    }

    // 자식들 먼저 제거
    for (const childId of node.children) {
      this.remove(childId);
    }

    // Supervisor 정지
    node.supervisor.stop();

    // 부모에서 제거
    if (node.parent) {
      const parent = this.nodes.get(node.parent);
      parent?.children.delete(id);
    }

    // 맵에서 제거
    this.nodes.delete(id);

    // 루트인 경우
    if (id === this.rootId) {
      this.rootId = null;
    }
  }

  /**
   * 전체 트리 정지
   */
  shutdown(): void {
    if (this.rootId) {
      this.remove(this.rootId);
    }
  }

  /**
   * 트리 구조 출력 (디버그용)
   */
  printTree(): string {
    if (!this.rootId) {
      return '(empty tree)';
    }

    const lines: string[] = [];
    this.printNode(this.rootId, 0, lines);
    return lines.join('\n');
  }

  // ==================== 내부 메서드 ====================

  private handleEscalation(
    supervisorId: string,
    actorId: ActorId,
    error: Error
  ): void {
    const node = this.nodes.get(supervisorId);
    if (!node || !node.parent) {
      // 루트 도달 - 처리 불가
      console.error(
        `[SupervisorTree] Unhandled escalation for ${actorId}:`,
        error
      );
      return;
    }

    // 부모 Supervisor에게 전달
    const parent = this.nodes.get(node.parent);
    if (parent) {
      parent.supervisor.handleFailure(actorId, error);
    }
  }

  private printNode(id: string, depth: number, lines: string[]): void {
    const node = this.nodes.get(id);
    if (!node) return;

    const indent = '  '.repeat(depth);
    const watched = node.supervisor.getWatchedActors();
    lines.push(`${indent}[${id}] watching: ${watched.join(', ') || '(none)'}`);

    for (const childId of node.children) {
      this.printNode(childId, depth + 1, lines);
    }
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### 4. 단위 테스트 작성

**파일:** `packages/actor/src/supervision/__tests__/Supervisor.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Supervisor } from '../Supervisor';
import { RestartStrategy, BackoffPolicy, RestartDirective } from '../types';
import { ActorRuntime } from '../../runtime/ActorRuntime';
import { Actor, ActorRole, ActorLifecycleStatus } from '../../types/actor';

// Mock ActorRuntime
class MockRuntime {
  actors: Map<string, any> = new Map();

  getActor(id: string) {
    const actor = this.actors.get(id);
    if (!actor) throw new Error(`Actor not found: ${id}`);
    return actor;
  }

  async restart(id: string) {
    const actor = this.actors.get(id);
    if (!actor) throw new Error(`Actor not found: ${id}`);
    return actor;
  }

  async stop(id: string) {
    this.actors.delete(id);
  }

  addMockActor(id: string) {
    this.actors.set(id, {
      id,
      role: 'analyst',
      status: ActorLifecycleStatus.RUNNING,
    });
  }
}

describe('Supervisor', () => {
  let supervisor: Supervisor;
  let runtime: MockRuntime;

  beforeEach(() => {
    runtime = new MockRuntime();
    runtime.addMockActor('actor-1');
    runtime.addMockActor('actor-2');
    runtime.addMockActor('actor-3');

    supervisor = new Supervisor(runtime as unknown as ActorRuntime, {
      strategy: RestartStrategy.ONE_FOR_ONE,
      backoff: {
        policy: BackoffPolicy.FIXED,
        initialDelay: 10, // 빠른 테스트를 위해 짧게
        maxDelay: 100,
      },
      maxRestarts: 3,
      restartWindow: 60000,
      debug: false,
    });
  });

  describe('start/stop', () => {
    it('should start supervisor', () => {
      supervisor.start();
      expect(supervisor.getWatchedActors()).toHaveLength(0);
    });

    it('should stop supervisor', () => {
      supervisor.start();
      supervisor.watch('actor-1');
      supervisor.stop();
      expect(supervisor.getWatchedActors()).toHaveLength(0);
    });

    it('should throw when starting already running supervisor', () => {
      supervisor.start();
      expect(() => supervisor.start()).toThrow('already running');
    });
  });

  describe('watch/unwatch', () => {
    beforeEach(() => {
      supervisor.start();
    });

    it('should watch actor', () => {
      supervisor.watch('actor-1');
      expect(supervisor.getWatchedActors()).toContain('actor-1');
    });

    it('should unwatch actor', () => {
      supervisor.watch('actor-1');
      supervisor.unwatch('actor-1');
      expect(supervisor.getWatchedActors()).not.toContain('actor-1');
    });

    it('should throw when watching without starting', () => {
      supervisor.stop();
      expect(() => supervisor.watch('actor-1')).toThrow('not running');
    });
  });

  describe('handleFailure', () => {
    beforeEach(() => {
      supervisor.start();
      supervisor.watch('actor-1');
    });

    it('should emit actor:failed event', async () => {
      const failedHandler = vi.fn();
      supervisor.on('actor:failed', failedHandler);

      await supervisor.handleFailure('actor-1', new Error('Test error'));

      expect(failedHandler).toHaveBeenCalledWith('actor-1', expect.any(Error));
    });

    it('should restart actor on failure', async () => {
      const restartedHandler = vi.fn();
      supervisor.on('actor:restarted', restartedHandler);

      await supervisor.handleFailure('actor-1', new Error('Test error'));

      // 백오프 대기 후 재시작
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(restartedHandler).toHaveBeenCalledWith('actor-1', 1);
    });

    it('should record restart history', async () => {
      await supervisor.handleFailure('actor-1', new Error('Test error'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      const history = supervisor.getRestartHistory('actor-1');
      expect(history).toHaveLength(1);
      expect(history[0].actorId).toBe('actor-1');
      expect(history[0].success).toBe(true);
    });
  });

  describe('max restarts', () => {
    beforeEach(() => {
      supervisor.start();
      supervisor.watch('actor-1');
    });

    it('should stop after max restarts', async () => {
      const stoppedHandler = vi.fn();
      const maxRestartsHandler = vi.fn();

      supervisor.on('actor:stopped', stoppedHandler);
      supervisor.on('max-restarts-exceeded', maxRestartsHandler);

      // 최대 재시작 횟수 초과
      for (let i = 0; i <= 3; i++) {
        await supervisor.handleFailure('actor-1', new Error('Test error'));
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      expect(maxRestartsHandler).toHaveBeenCalled();
    });
  });

  describe('restart strategies', () => {
    it('should restart only failed actor with ONE_FOR_ONE', async () => {
      supervisor.start();
      supervisor.watch('actor-1');
      supervisor.watch('actor-2');

      const restartSpy = vi.spyOn(runtime, 'restart');

      await supervisor.handleFailure('actor-1', new Error('Test error'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(restartSpy).toHaveBeenCalledWith('actor-1');
      expect(restartSpy).not.toHaveBeenCalledWith('actor-2');
    });

    it('should restart all actors with ALL_FOR_ONE', async () => {
      const allForOneSupervisor = new Supervisor(
        runtime as unknown as ActorRuntime,
        {
          strategy: RestartStrategy.ALL_FOR_ONE,
          backoff: { policy: BackoffPolicy.FIXED, initialDelay: 10, maxDelay: 100 },
          maxRestarts: 3,
          restartWindow: 60000,
          debug: false,
        }
      );

      allForOneSupervisor.start();
      allForOneSupervisor.watch('actor-1');
      allForOneSupervisor.watch('actor-2');
      allForOneSupervisor.watch('actor-3');

      const restartSpy = vi.spyOn(runtime, 'restart');

      await allForOneSupervisor.handleFailure('actor-1', new Error('Test'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(restartSpy).toHaveBeenCalledWith('actor-1');
      expect(restartSpy).toHaveBeenCalledWith('actor-2');
      expect(restartSpy).toHaveBeenCalledWith('actor-3');
    });
  });

  describe('backoff policies', () => {
    it('should use fixed backoff', () => {
      const fixedSupervisor = new Supervisor(
        runtime as unknown as ActorRuntime,
        {
          strategy: RestartStrategy.ONE_FOR_ONE,
          backoff: { policy: BackoffPolicy.FIXED, initialDelay: 100, maxDelay: 1000 },
          maxRestarts: 3,
          restartWindow: 60000,
        }
      );

      // 내부 메서드 테스트는 private이므로 결과로 검증
      // 실제로는 재시작 시간을 측정하여 검증
    });

    it('should use exponential backoff', () => {
      const expSupervisor = new Supervisor(
        runtime as unknown as ActorRuntime,
        {
          strategy: RestartStrategy.ONE_FOR_ONE,
          backoff: {
            policy: BackoffPolicy.EXPONENTIAL,
            initialDelay: 100,
            maxDelay: 10000,
            multiplier: 2,
          },
          maxRestarts: 5,
          restartWindow: 60000,
        }
      );

      // delay 시퀀스: 100, 200, 400, 800, 1600, ...
    });
  });

  describe('dead letter queue', () => {
    it('should add to dead letter queue on restart failure', async () => {
      // 재시작 실패하도록 설정
      runtime.actors.delete('actor-1');

      supervisor.start();
      supervisor.watch('actor-1');

      const deadLetterHandler = vi.fn();
      supervisor.on('dead-letter', deadLetterHandler);

      try {
        await supervisor.handleFailure('actor-1', new Error('Test error'));
      } catch {
        // 예외 무시
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Dead letter 추가 확인
      const deadLetters = supervisor.getDeadLetters();
      expect(deadLetters.length).toBeGreaterThanOrEqual(0);
    });

    it('should clear dead letter queue', () => {
      supervisor.clearDeadLetters();
      expect(supervisor.getDeadLetters()).toHaveLength(0);
    });
  });

  describe('custom decider', () => {
    it('should use custom decider', async () => {
      const customSupervisor = new Supervisor(
        runtime as unknown as ActorRuntime,
        {
          strategy: RestartStrategy.ONE_FOR_ONE,
          backoff: { policy: BackoffPolicy.FIXED, initialDelay: 10, maxDelay: 100 },
          maxRestarts: 3,
          restartWindow: 60000,
          decider: (error, actor) => {
            if (error.message.includes('fatal')) {
              return RestartDirective.STOP;
            }
            return RestartDirective.RESTART;
          },
        }
      );

      customSupervisor.start();
      customSupervisor.watch('actor-1');

      const stoppedHandler = vi.fn();
      customSupervisor.on('actor:stopped', stoppedHandler);

      await customSupervisor.handleFailure('actor-1', new Error('fatal error'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(stoppedHandler).toHaveBeenCalled();
    });
  });
});
```

**파일:** `packages/actor/src/supervision/__tests__/SupervisorTree.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SupervisorTree } from '../SupervisorTree';
import { RestartStrategy, BackoffPolicy } from '../types';
import { ActorRuntime } from '../../runtime/ActorRuntime';

// Mock ActorRuntime
class MockRuntime {
  async restart() {}
  async stop() {}
  getActor() { return { id: 'test', role: 'analyst', status: 'running' }; }
}

describe('SupervisorTree', () => {
  let tree: SupervisorTree;
  let runtime: MockRuntime;

  beforeEach(() => {
    runtime = new MockRuntime();
    tree = new SupervisorTree(runtime as unknown as ActorRuntime);
  });

  describe('createRoot', () => {
    it('should create root supervisor', () => {
      const rootId = tree.createRoot();
      expect(rootId).toBeDefined();
      expect(tree.getRoot()).not.toBeNull();
    });

    it('should throw when creating second root', () => {
      tree.createRoot();
      expect(() => tree.createRoot()).toThrow('Root supervisor already exists');
    });
  });

  describe('createChild', () => {
    it('should create child supervisor', () => {
      const rootId = tree.createRoot();
      const childId = tree.createChild(rootId);

      expect(childId).toBeDefined();
      expect(tree.getSupervisor(childId)).toBeDefined();
    });

    it('should throw when parent not found', () => {
      expect(() => tree.createChild('non-existent')).toThrow('Parent supervisor not found');
    });

    it('should create nested children', () => {
      const rootId = tree.createRoot();
      const child1Id = tree.createChild(rootId);
      const child2Id = tree.createChild(child1Id);

      expect(tree.getSupervisor(child2Id)).toBeDefined();
    });
  });

  describe('remove', () => {
    it('should remove supervisor', () => {
      const rootId = tree.createRoot();
      const childId = tree.createChild(rootId);

      tree.remove(childId);

      expect(() => tree.getSupervisor(childId)).toThrow('Supervisor not found');
    });

    it('should remove children when removing parent', () => {
      const rootId = tree.createRoot();
      const child1Id = tree.createChild(rootId);
      const child2Id = tree.createChild(child1Id);

      tree.remove(child1Id);

      expect(() => tree.getSupervisor(child1Id)).toThrow();
      expect(() => tree.getSupervisor(child2Id)).toThrow();
    });
  });

  describe('shutdown', () => {
    it('should shutdown entire tree', () => {
      const rootId = tree.createRoot();
      tree.createChild(rootId);
      tree.createChild(rootId);

      tree.shutdown();

      expect(tree.getRoot()).toBeNull();
    });
  });

  describe('printTree', () => {
    it('should print empty tree', () => {
      expect(tree.printTree()).toBe('(empty tree)');
    });

    it('should print tree structure', () => {
      const rootId = tree.createRoot();
      tree.createChild(rootId);
      tree.createChild(rootId);

      const output = tree.printTree();
      expect(output).toContain('[');
    });
  });
});
```

### 5. 내보내기 설정

**파일:** `packages/actor/src/supervision/index.ts`

```typescript
export * from './types';
export * from './Supervisor';
export * from './SupervisorTree';
```

**파일:** `packages/actor/src/index.ts` (업데이트)

```typescript
export * from './types';
export * from './base/BaseActor';
export * from './runtime';
export * from './pool';
export * from './supervision';
```

## 파일 구조

```
packages/actor/src/
├── supervision/
│   ├── __tests__/
│   │   ├── Supervisor.test.ts
│   │   └── SupervisorTree.test.ts
│   ├── types.ts           # Supervision 타입
│   ├── Supervisor.ts      # Supervisor 클래스
│   ├── SupervisorTree.ts  # 계층적 Supervision
│   └── index.ts           # 내보내기
├── pool/
├── runtime/
├── types/
├── base/
└── index.ts
```

## 완료 조건
- [ ] RestartStrategy (OneForOne, AllForOne, RestForOne) 구현 완료
- [ ] BackoffPolicy (Fixed, Linear, Exponential, ExponentialJitter) 구현 완료
- [ ] Supervisor 클래스 구현 완료
- [ ] SupervisorTree 클래스 구현 완료
- [ ] Dead Letter Queue 구현 완료
- [ ] 커스텀 decider 지원 완료
- [ ] 재시작 이력 추적 완료
- [ ] 단위 테스트 작성 완료
- [ ] 테스트 커버리지 85% 이상
- [ ] TypeScript 타입 체크 통과

## 의존성
- TASK-025 (Actor 런타임)

## 참고 자료
- `/docs/architecture/blackboard-actor-design.md` - 아키텍처 설계
- [Erlang OTP Supervision](https://www.erlang.org/doc/design_principles/sup_princ.html)
- [Akka Supervision](https://doc.akka.io/docs/akka/current/general/supervision.html)

## 수락 기준
1. OneForOne 전략이 실패한 Actor만 재시작한다
2. AllForOne 전략이 모든 감시 중인 Actor를 재시작한다
3. 백오프 정책이 올바르게 동작한다
4. 최대 재시작 횟수가 준수된다
5. Dead Letter Queue가 실패한 메시지를 보관한다
6. SupervisorTree가 계층적 에스컬레이션을 처리한다
7. 단위 테스트가 모든 주요 시나리오를 커버한다
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
# 생성 시각: 2026-02-09 20:17:03

1. supervision 모듈이 패키지 공개 API에서 내보내지 않음
2. SupervisorTree 테스트 파일 누락
3. handleFailure 재귀 호출 시 무한 루프 위험
4. REST_FOR_ONE 전략 및 추가 백오프 정책 테스트 누락
5. Dead Letter Queue 테스트의 무의미한 어설션
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
