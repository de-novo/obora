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
]]></task_spec>

  <source_code>

  </source_code>

  <reviews>
    <opus_review><![CDATA[


I'll verify each checklist item by examining the actual code. Let me start by finding the relevant files.
Now let me verify each checklist item by reading the specific files in detail.
Now I have all the information needed to verify each checklist item. Let me compile the results.

# 체크리스트 검증 결과

## 항목별 결과

- **[PASS] 1. supervision 모듈이 패키지 공개 API에서 내보내지 않음**
  - 근거: `packages/actor/src/index.ts:12`에 `export * from "./supervision";` 이 존재하며, `packages/actor/src/supervision/index.ts:1-3`에서 types, Supervisor, SupervisorTree를 모두 re-export하고 있음. 이슈가 수정됨.

- **[PASS] 2. SupervisorTree 테스트 파일 누락**
  - 근거: `packages/actor/src/supervision/__tests__/SupervisorTree.test.ts` 파일이 존재하며, 97줄에 걸쳐 createRoot, createChild, remove, shutdown, printTree에 대한 10개 테스트를 포함하고 있음. 이슈가 수정됨.

- **[PASS] 3. handleFailure 재귀 호출 시 무한 루프 위험**
  - 근거: `packages/actor/src/supervision/Supervisor.ts:258-266`에서 재시작 실패 시 `this.restartCounts.get(actorId)` 값을 확인하여 `maxRestarts` 이상이면 `performStop`을 호출하고 재귀를 중단함. `handleFailure`를 다시 호출하는 경로(라인 265)에 도달하더라도 `decideRestart`(라인 200)에서 타임스탬프 기반 윈도우 체크가 STOP을 반환하므로, 이중 안전장치가 적용됨. 이슈가 수정됨.

- **[PASS] 4. REST_FOR_ONE 전략 및 추가 백오프 정책 테스트 누락**
  - 근거: `packages/actor/src/supervision/__tests__/Supervisor.test.ts:205-231`에 REST_FOR_ONE 전략 테스트가 추가되어 actor-2 실패 시 actor-1은 재시작되지 않고, actor-2와 actor-3만 재시작되는 것을 검증함. 백오프 정책 테스트도 FIXED(라인 235-257), EXPONENTIAL(라인 259-285), LINEAR(라인 287-312), EXPONENTIAL_JITTER(라인 314-341) 4가지 모두 구현됨. 이슈가 수정됨.

- **[PASS] 5. Dead Letter Queue 테스트의 무의미한 어설션**
  - 근거: `packages/actor/src/supervision/__tests__/Supervisor.test.ts:345-399`에서 기존의 `toBeGreaterThanOrEqual(0)` 같은 무의미한 어설션이 제거되고, `toBeGreaterThanOrEqual(1)`(라인 365), `deadLetterHandler` 호출 확인(라인 368), dead letter 객체의 핵심 필드 검증(actorId, error, timestamp, retryCount — 라인 371-375)이 추가됨. 두 번째 테스트(라인 378-399)도 먼저 dead letter를 추가한 뒤 비우는 방식으로 의미 있게 변경됨. 이슈가 수정됨.

## 점수
- 통과: 5/5
- **총점: 10/10**
]]></opus_review>
    <codex_review><![CDATA[
# Checklist Verification Result

## Item Results
- [PASS] Item1: `packages/actor/src/index.ts:8-12` (exports include `./supervision`)
- [PASS] Item2: `packages/actor/src/supervision/__tests__/SupervisorTree.test.ts:1-96`
- [PASS] Item3: `packages/actor/src/supervision/Supervisor.ts:258-266` (guards retry by maxRestarts and stops)
- [PASS] Item4: `packages/actor/src/supervision/__tests__/Supervisor.test.ts:205-231` (REST_FOR_ONE), `packages/actor/src/supervision/__tests__/Supervisor.test.ts:234-341` (backoff policies)
- [PASS] Item5: `packages/actor/src/supervision/__tests__/Supervisor.test.ts:344-376` (non-trivial assertions on dead letters)

## Score
- Passed: 5/5
- **Total: 10/10**

## Fix for FAIL Items
None.
]]></codex_review>
    <glm_review><![CDATA[
I'll verify each checklist item by examining the actual source code. Let me search for the relevant files.
# 체크리스트 검증 결과

## 항목별 결과
- [PASS] 항목1: supervision 모듈이 packages/actor/src/index.ts:12에서 `export * from "./supervision";`로 내보내짐
- [PASS] 항목2: SupervisorTree 테스트 파일이 packages/actor/src/supervision/__tests__/SupervisorTree.test.ts에 존재함
- [PASS] 항목3: handleFailure 재귀 호출에 maxRestarts 기반 가드 추가됨 (Supervisor.ts:258-267)
- [PASS] 항목4: REST_FOR_ONE 테스트(205-231행), LINEAR 백오프 테스트(287-312행), EXPONENTIAL_JITTER 백오프 테스트(314-341행) 존재
- [PASS] 항목5: Dead Letter Queue 테스트에 actorId, error, timestamp, retryCount 등 의미 있는 어설션 추가됨 (Supervisor.test.ts:370-375)

## 점수
- 통과: 5/5
- **총점: 10/10**
]]></glm_review>
    <gemini_review><![CDATA[
I will begin by listing the files in the `packages/actor/src/supervision/` directory to verify the existence of the implementation and test files.
I will read `packages/actor/src/index.ts` to check if the `supervision` module is exported.
I will read `packages/actor/src/supervision/Supervisor.ts` to examine the `handleFailure` implementation for potential infinite loop risks.
I will read `packages/actor/src/supervision/__tests__/Supervisor.test.ts` to verify the presence of tests for the `REST_FOR_ONE` strategy and additional backoff policies.
I will read `packages/actor/src/supervision/__tests__/SupervisorTree.test.ts` to ensure it contains substantial test cases.
I will read `packages/actor/src/supervision/index.ts` to confirm that it correctly exports all relevant components.
# Checklist Verification Result

## Item Results
- [PASS] Item1: supervision 모듈이 패키지 공개 API에서 내보내짐 (`packages/actor/src/index.ts:12`, `packages/actor/src/supervision/index.ts:1-3`)
- [PASS] Item2: SupervisorTree 테스트 파일 존재 및 정상 구현 (`packages/actor/src/supervision/__tests__/SupervisorTree.test.ts`)
- [PASS] Item3: handleFailure 재귀 호출 시 `currentAttempt` 및 `maxRestarts`를 비교하여 무한 루프 방지 로직 구현됨 (`packages/actor/src/supervision/Supervisor.ts:260-263`)
- [PASS] Item4: REST_FOR_ONE 전략 및 LINEAR, EXPONENTIAL_JITTER 백오프 정책에 대한 테스트 케이스 추가됨 (`packages/actor/src/supervision/__tests__/Supervisor.test.ts:205, 287, 314`)
- [PASS] Item5: Dead Letter Queue 테스트에서 단순 길이 체크 이상의 의미 있는 어설션(핵심 필드 검증) 추가됨 (`packages/actor/src/supervision/__tests__/Supervisor.test.ts:365-375`)

## Score
- Passed: 5/5
- **Total: 10/10**
]]></gemini_review>
  </reviews>
</debate>

위의 XML을 따라서 4개 모델의 리뷰를 종합 판정하고 결과를 마크다운으로 출력하세요.
