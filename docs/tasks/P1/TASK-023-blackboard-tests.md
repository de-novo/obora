# TASK-023: Blackboard 단위 테스트

## 개요
- **상태**: 📋 대기
- **우선순위**: P1
- **예상 소요**: 6시간
- **담당**: 개발자
- **의존성**: TASK-019, TASK-020, TASK-021

## 목표
`@obora-kit/blackboard` 패키지의 모든 모듈에 대한 단위 테스트 작성. 커버리지 80% 이상 달성.

---

## 작업 내용

### 1. 테스트 구조

```
packages/blackboard/
└── test/
    ├── setup.ts              # 테스트 설정 (글로벌 설정)
    ├── helpers/
    │   ├── fixtures.ts       # 테스트 픽스처
    │   ├── factories.ts      # 테스트 데이터 팩토리
    │   └── mocks.ts          # 모킹 유틸리티
    ├── types/
    │   └── types.test.ts     # 타입 가드 테스트
    ├── core/
    │   ├── blackboard.test.ts
    │   ├── versioning.test.ts
    │   ├── path-utils.test.ts
    │   ├── immutable.test.ts
    │   ├── id-generator.test.ts
    │   └── accessors/
    │       ├── state-accessor.test.ts
    │       ├── knowledge-accessor.test.ts
    │       └── decisions-accessor.test.ts
    ├── events/
    │   ├── event-bus.test.ts
    │   └── event-factory.test.ts
    └── snapshot/
        ├── serializer.test.ts
        ├── compression.test.ts
        └── snapshot-manager.test.ts
```

### 2. 테스트 설정 (`test/setup.ts`)

```typescript
import { beforeEach, afterEach, vi } from 'vitest';

// 전역 설정
beforeEach(() => {
  // Date.now() 모킹 (재현 가능한 테스트)
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-02-04T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// 전역 타임아웃
vi.setConfig({
  testTimeout: 10000,
  hookTimeout: 10000,
});
```

### 3. 테스트 헬퍼 (`test/helpers/`)

#### fixtures.ts
```typescript
import {
  createAgentId,
  createTaskId,
  createAgendaId,
  createSessionId,
  AgentStatusEnum,
  TaskStatus,
  TaskPriority,
  AgendaStatus,
  type AgentStatus,
  type Task,
  type Agenda,
  type BlackboardState,
} from '../../src';

/**
 * 기본 에이전트 상태 픽스처
 */
export const defaultAgentStatus: AgentStatus = {
  id: createAgentId('agent-001'),
  role: 'analyst',
  status: AgentStatusEnum.IDLE,
  currentTask: null,
  lastHeartbeat: new Date('2026-02-04T12:00:00Z'),
  metadata: {},
  createdAt: new Date('2026-02-04T10:00:00Z'),
  updatedAt: new Date('2026-02-04T12:00:00Z'),
};

/**
 * 기본 작업 픽스처
 */
export const defaultTask: Task = {
  id: createTaskId('task-001'),
  name: 'Test Task',
  description: 'A test task',
  assignedTo: null,
  status: TaskStatus.PENDING,
  priority: TaskPriority.NORMAL,
  inputs: {},
  outputs: null,
  dependsOn: [],
  error: null,
  startedAt: null,
  completedAt: null,
  timeout: null,
  version: 1,
  createdAt: new Date('2026-02-04T10:00:00Z'),
  updatedAt: new Date('2026-02-04T10:00:00Z'),
};

/**
 * 기본 안건 픽스처
 */
export const defaultAgenda: Agenda = {
  id: createAgendaId('agenda-001'),
  title: 'Test Agenda',
  description: 'A test agenda for unit testing',
  proposer: createAgentId('agent-001'),
  status: AgendaStatus.SUBMITTED,
  deadline: new Date('2026-02-10T12:00:00Z'),
  requiredQuorum: 3,
  votingMethod: 'majority',
  priority: 5,
  tags: ['test'],
  attachments: [],
  version: 1,
  createdAt: new Date('2026-02-04T10:00:00Z'),
  updatedAt: new Date('2026-02-04T10:00:00Z'),
};

/**
 * 초기 Blackboard 상태 픽스처
 */
export function createInitialState(sessionId?: SessionId): BlackboardState {
  return {
    meta: {
      version: 1,
      lastUpdated: new Date('2026-02-04T12:00:00Z'),
      sessionId: sessionId ?? createSessionId('session-001'),
      createdAt: new Date('2026-02-04T10:00:00Z'),
    },
    state: {
      phase: 'idle',
      context: {},
      agents: new Map(),
      tasks: new Map(),
    },
    knowledge: {
      facts: [],
      inferences: [],
      patterns: [],
    },
    decisions: {
      current: null,
      pending: [],
      opinions: new Map(),
      history: [],
    },
  };
}
```

#### factories.ts
```typescript
import { 
  createAgentId, 
  createTaskId, 
  type AgentStatus,
  type Task,
} from '../../src';

let counter = 0;

/**
 * 에이전트 팩토리
 */
export function createTestAgent(overrides: Partial<AgentStatus> = {}): AgentStatus {
  counter++;
  return {
    id: createAgentId(`agent-${counter}`),
    role: 'analyst',
    status: AgentStatusEnum.IDLE,
    currentTask: null,
    lastHeartbeat: new Date(),
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * 작업 팩토리
 */
export function createTestTask(overrides: Partial<Task> = {}): Task {
  counter++;
  return {
    id: createTaskId(`task-${counter}`),
    name: `Task ${counter}`,
    description: 'Test task',
    assignedTo: null,
    status: TaskStatus.PENDING,
    priority: TaskPriority.NORMAL,
    inputs: {},
    outputs: null,
    dependsOn: [],
    error: null,
    startedAt: null,
    completedAt: null,
    timeout: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * 카운터 리셋
 */
export function resetFactories(): void {
  counter = 0;
}
```

### 4. Core 테스트

#### blackboard.test.ts
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  Blackboard,
  VersionConflictError,
  PathNotFoundError,
  createSessionId,
  createAgentId,
} from '../../src';
import { createInitialState, defaultAgentStatus } from '../helpers/fixtures';
import { createTestAgent, resetFactories } from '../helpers/factories';

describe('Blackboard', () => {
  let board: Blackboard;

  beforeEach(() => {
    resetFactories();
    board = new Blackboard({
      sessionId: createSessionId('test-session'),
    });
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const b = new Blackboard();
      expect(b.version).toBe(1);
      expect(b.meta.sessionId).toBeDefined();
    });

    it('should create with custom session ID', () => {
      const sessionId = createSessionId('custom-session');
      const b = new Blackboard({ sessionId });
      expect(b.meta.sessionId).toBe(sessionId);
    });

    it('should create with initial state', () => {
      const initialState = createInitialState();
      initialState.state.phase = 'discussion';
      const b = new Blackboard({ initialState });
      expect(b.state.phase).toBe('discussion');
    });
  });

  describe('read()', () => {
    it('should read top-level section', () => {
      const state = board.read('state');
      expect(state).toBeDefined();
      expect(state.phase).toBe('idle');
    });

    it('should read nested path', () => {
      const phase = board.read('state.phase');
      expect(phase).toBe('idle');
    });

    it('should return deep copy by default', () => {
      const context1 = board.read<Record<string, unknown>>('state.context');
      const context2 = board.read<Record<string, unknown>>('state.context');
      expect(context1).not.toBe(context2);
      expect(context1).toEqual(context2);
    });

    it('should throw PathNotFoundError for invalid path', () => {
      expect(() => board.read('invalid.path')).toThrow(PathNotFoundError);
    });
  });

  describe('write()', () => {
    it('should write value and increment version', () => {
      const initialVersion = board.version;
      const result = board.write('state.phase', 'discussion');
      
      expect(result.success).toBe(true);
      expect(result.version).toBe(initialVersion + 1);
      expect(board.read('state.phase')).toBe('discussion');
    });

    it('should return previous value', () => {
      const result = board.write('state.phase', 'discussion');
      expect(result.previousValue).toBe('idle');
    });

    it('should succeed with matching expected version', () => {
      const result = board.write('state.phase', 'discussion', {
        expectedVersion: board.version,
      });
      expect(result.success).toBe(true);
    });

    it('should throw VersionConflictError on version mismatch', () => {
      expect(() =>
        board.write('state.phase', 'discussion', { expectedVersion: 999 })
      ).toThrow(VersionConflictError);
    });
  });

  describe('delete()', () => {
    it('should delete value at path', () => {
      board.write('state.context.key1', 'value1');
      const result = board.delete('state.context.key1');
      
      expect(result.success).toBe(true);
      expect(board.exists('state.context.key1')).toBe(false);
    });

    it('should return deleted value', () => {
      board.write('state.context.key1', 'value1');
      const result = board.delete('state.context.key1');
      expect(result.previousValue).toBe('value1');
    });
  });

  describe('exists()', () => {
    it('should return true for existing path', () => {
      expect(board.exists('state.phase')).toBe(true);
    });

    it('should return false for non-existing path', () => {
      expect(board.exists('state.context.nonexistent')).toBe(false);
    });
  });

  describe('transaction()', () => {
    it('should execute multiple operations atomically', () => {
      const results = board.transaction([
        { type: 'write', path: 'state.context.a', value: 1 },
        { type: 'write', path: 'state.context.b', value: 2 },
      ]);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
      expect(board.read('state.context.a')).toBe(1);
      expect(board.read('state.context.b')).toBe(2);
    });

    it('should rollback on failure', () => {
      // 첫 번째 쓰기 후 버전 변경
      board.write('state.context.initial', 'value');
      
      // 트랜잭션 중 버전 충돌 시 롤백
      // (실제 구현에 따라 테스트 조정 필요)
    });
  });
});

describe('Blackboard State Accessors', () => {
  let board: Blackboard;

  beforeEach(() => {
    resetFactories();
    board = new Blackboard();
  });

  describe('state accessor', () => {
    it('should get/set phase', () => {
      board.state.phase = 'discussion';
      expect(board.state.phase).toBe('discussion');
    });

    it('should register agent', () => {
      const agent = createTestAgent();
      board.state.registerAgent(agent);
      
      expect(board.state.getAgent(agent.id)).toEqual(agent);
    });

    it('should update agent status', () => {
      const agent = createTestAgent();
      board.state.registerAgent(agent);
      
      board.state.updateAgent(agent.id, { status: AgentStatusEnum.ACTIVE });
      
      const updated = board.state.getAgent(agent.id);
      expect(updated?.status).toBe(AgentStatusEnum.ACTIVE);
    });

    it('should remove agent', () => {
      const agent = createTestAgent();
      board.state.registerAgent(agent);
      board.state.removeAgent(agent.id);
      
      expect(board.state.getAgent(agent.id)).toBeUndefined();
    });

    it('should filter agents by role', () => {
      board.state.registerAgent(createTestAgent({ role: 'analyst' }));
      board.state.registerAgent(createTestAgent({ role: 'executor' }));
      board.state.registerAgent(createTestAgent({ role: 'analyst' }));
      
      const analysts = board.state.getAgents({ role: 'analyst' });
      expect(analysts).toHaveLength(2);
    });
  });

  describe('knowledge accessor', () => {
    it('should add fact', () => {
      const fact = board.knowledge.addFact({
        content: 'Test fact',
        source: createAgentId('agent-1'),
        confidence: 0.9,
        category: 'test',
        tags: [],
        expiresAt: null,
      });

      expect(fact.id).toBeDefined();
      expect(board.knowledge.getFact(fact.id)).toEqual(fact);
    });

    it('should find facts by category', () => {
      board.knowledge.addFact({
        content: 'Fact 1',
        source: createAgentId('agent-1'),
        confidence: 0.9,
        category: 'finance',
        tags: [],
        expiresAt: null,
      });
      board.knowledge.addFact({
        content: 'Fact 2',
        source: createAgentId('agent-1'),
        confidence: 0.8,
        category: 'tech',
        tags: [],
        expiresAt: null,
      });

      const financeFacts = board.knowledge.findFacts({ category: 'finance' });
      expect(financeFacts).toHaveLength(1);
    });
  });

  describe('decisions accessor', () => {
    it('should submit agenda', () => {
      const agenda = board.decisions.submitAgenda({
        title: 'Test Agenda',
        description: 'Description',
        proposer: createAgentId('agent-1'),
        deadline: null,
        requiredQuorum: 3,
        votingMethod: 'majority',
        priority: 5,
        tags: [],
        attachments: [],
      });

      expect(agenda.id).toBeDefined();
      expect(agenda.status).toBe(AgendaStatus.SUBMITTED);
    });

    it('should submit opinion', () => {
      const agenda = board.decisions.submitAgenda({
        title: 'Test',
        description: 'Test',
        proposer: createAgentId('agent-1'),
        deadline: null,
        requiredQuorum: 3,
        votingMethod: 'majority',
        priority: 5,
        tags: [],
        attachments: [],
      });

      board.decisions.submitOpinion({
        agentId: createAgentId('agent-2'),
        agendaId: agenda.id,
        stance: 'approve',
        reason: 'Good proposal',
        conditions: [],
        confidence: 0.9,
        references: [],
      });

      const opinions = board.decisions.getOpinions(agenda.id);
      expect(opinions).toHaveLength(1);
    });

    it('should summarize opinions', () => {
      const agenda = board.decisions.submitAgenda({
        title: 'Test',
        description: 'Test',
        proposer: createAgentId('proposer'),
        deadline: null,
        requiredQuorum: 3,
        votingMethod: 'majority',
        priority: 5,
        tags: [],
        attachments: [],
      });

      board.decisions.submitOpinion({
        agentId: createAgentId('agent-1'),
        agendaId: agenda.id,
        stance: 'approve',
        reason: 'Yes',
        conditions: [],
        confidence: 0.9,
        references: [],
      });
      board.decisions.submitOpinion({
        agentId: createAgentId('agent-2'),
        agendaId: agenda.id,
        stance: 'reject',
        reason: 'No',
        conditions: [],
        confidence: 0.8,
        references: [],
      });
      board.decisions.submitOpinion({
        agentId: createAgentId('agent-3'),
        agendaId: agenda.id,
        stance: 'approve',
        reason: 'Yes',
        conditions: [],
        confidence: 0.85,
        references: [],
      });

      const summary = board.decisions.summarizeOpinions(agenda.id);
      expect(summary.total).toBe(3);
      expect(summary.approve).toBe(2);
      expect(summary.reject).toBe(1);
    });
  });
});
```

### 5. Events 테스트

#### event-bus.test.ts
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus, EventFactory } from '../../src/events';
import { createAgentId, createTaskId } from '../../src';

describe('EventBus', () => {
  let bus: EventBus;
  let factory: EventFactory;

  beforeEach(() => {
    bus = new EventBus({ historySize: 100 });
    factory = new EventFactory(() => `event-${Date.now()}`);
  });

  describe('subscribe()', () => {
    it('should subscribe to specific event type', () => {
      const handler = vi.fn();
      bus.subscribe('task.completed', handler);

      const event = factory.createTaskCompleted(
        createTaskId('task-1'),
        { result: 'success' },
        1000
      );
      bus.emit(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should support wildcard subscription', () => {
      const handler = vi.fn();
      bus.subscribe('task.*', handler);

      bus.emit(factory.createTaskCreated({ id: createTaskId('t1') } as any));
      bus.emit(factory.createTaskCompleted(createTaskId('t2'), {}, 100));

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should support global wildcard (*)', () => {
      const handler = vi.fn();
      bus.subscribe('*', handler);

      bus.emit(factory.createTaskCreated({ id: createTaskId('t1') } as any));
      bus.emit(factory.createPhaseChanged('idle', 'discussion'));

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = bus.subscribe('task.completed', handler);

      unsub();
      bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 100));

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('subscribeWithFilter()', () => {
    it('should filter by source', () => {
      const handler = vi.fn();
      const agentId = createAgentId('ceo');
      
      bus.subscribeWithFilter(
        'decision.*',
        { source: agentId },
        handler
      );

      // Event from CEO
      bus.emit({
        id: 'e1',
        type: 'decision.agenda.submitted',
        timestamp: new Date(),
        source: agentId,
        payload: {},
      } as any);

      // Event from other agent
      bus.emit({
        id: 'e2',
        type: 'decision.agenda.submitted',
        timestamp: new Date(),
        source: createAgentId('cfo'),
        payload: {},
      } as any);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should filter with custom predicate', () => {
      const handler = vi.fn();
      
      bus.subscribeWithFilter(
        'task.completed',
        { predicate: (e) => (e.payload as any).duration > 5000 },
        handler
      );

      bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 3000));
      bus.emit(factory.createTaskCompleted(createTaskId('t2'), {}, 8000));

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribeOnce()', () => {
    it('should only fire once', () => {
      const handler = vi.fn();
      bus.subscribeOnce('task.completed', handler);

      bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 100));
      bus.emit(factory.createTaskCompleted(createTaskId('t2'), {}, 100));

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('emitAsync()', () => {
    it('should wait for async handlers', async () => {
      const results: number[] = [];
      
      bus.subscribe('task.completed', async () => {
        await new Promise(r => setTimeout(r, 10));
        results.push(1);
      });
      bus.subscribe('task.completed', async () => {
        await new Promise(r => setTimeout(r, 5));
        results.push(2);
      });

      await bus.emitAsync(factory.createTaskCompleted(createTaskId('t1'), {}, 100));

      expect(results).toContain(1);
      expect(results).toContain(2);
    });
  });

  describe('getHistory()', () => {
    it('should return event history', () => {
      bus.emit(factory.createTaskCreated({ id: createTaskId('t1') } as any));
      bus.emit(factory.createTaskCompleted(createTaskId('t2'), {}, 100));

      const history = bus.getHistory();
      expect(history).toHaveLength(2);
    });

    it('should filter history by type', () => {
      bus.emit(factory.createTaskCreated({ id: createTaskId('t1') } as any));
      bus.emit(factory.createTaskCompleted(createTaskId('t2'), {}, 100));

      const history = bus.getHistory({ type: 'task.completed' });
      expect(history).toHaveLength(1);
    });

    it('should filter history by time range', () => {
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 3600000);

      bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 100));

      const history = bus.getHistory({ since: hourAgo });
      expect(history.length).toBeGreaterThan(0);
    });
  });

  describe('waitFor()', () => {
    it('should resolve when event occurs', async () => {
      const promise = bus.waitFor('task.completed', 1000);
      
      setTimeout(() => {
        bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 100));
      }, 10);

      const event = await promise;
      expect(event.type).toBe('task.completed');
    });

    it('should reject on timeout', async () => {
      await expect(bus.waitFor('task.completed', 10)).rejects.toThrow();
    });
  });

  describe('getStats()', () => {
    it('should return correct statistics', () => {
      bus.subscribe('task.*', () => {});
      bus.subscribe('task.completed', () => {});
      bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 100));
      bus.emit(factory.createTaskCompleted(createTaskId('t2'), {}, 100));

      const stats = bus.getStats();
      expect(stats.totalEmitted).toBe(2);
      expect(stats.subscriberCount).toBeGreaterThan(0);
    });
  });
});

### 7. 동시성 테스트

#### concurrency.test.ts
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { 
  Blackboard, 
  EventBus, 
  SnapshotManager,
  createSessionId,
  createAgentId,
  createTaskId,
  AgentStatusEnum,
  TaskStatus,
  TaskPriority,
} from '../../src';
import { createTestAgent, createTestTask, resetFactories } from '../helpers/factories';

describe('Concurrency Tests', () => {
  let board: Blackboard;
  let bus: EventBus;

  beforeEach(() => {
    resetFactories();
    board = new Blackboard({ sessionId: createSessionId('concurrency-test') });
    bus = new EventBus({ historySize: 1000 });
  });

  describe('동시 쓰기 충돌 테스트', () => {
    it('should detect version conflicts with concurrent writes', async () => {
      const initialVersion = board.version;
      const writeCount = 10;
      const results: Array<{ success: boolean; version?: number; error?: string }> = [];

      // 동시 쓰기 시뮬레이션 (모두 같은 버전을 기대)
      const writePromises = Array.from({ length: writeCount }, async (_, i) => {
        try {
          // 약간의 지연으로 경쟁 상태 유도
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
          
          const result = board.write('state.context.concurrent', `value-${i}`, {
            expectedVersion: initialVersion,
          });
          
          results.push({ success: result.success, version: result.version });
          return result;
        } catch (error: any) {
          results.push({ success: false, error: error.message });
          throw error;
        }
      });

      // 일부는 성공, 일부는 실패 (VersionConflictError)
      const settled = await Promise.allSettled(writePromises);
      
      // 성공한 쓰기는 1개만 있어야 함 (마지막 쓰기)
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      expect(successCount).toBeGreaterThanOrEqual(1);
      expect(successCount + failureCount).toBe(writeCount);
      expect(board.version).toBe(initialVersion + successCount);
    });

    it('should handle transaction with conflicts', async () => {
      // 초기 상태 설정
      board.write('state.context.key1', 'value1');
      const initialVersion = board.version;

      // 두 트랜잭션 동시 실행 시뮬레이션
      const transaction1 = Promise.resolve(
        board.transaction([
          { type: 'write', path: 'state.context.key1', value: 'modified-1' },
          { type: 'write', path: 'state.context.key2', value: 'value-1' },
        ])
      );

      const transaction2 = Promise.resolve(
        board.transaction([
          { type: 'write', path: 'state.context.key1', value: 'modified-2' },
          { type: 'write', path: 'state.context.key3', value: 'value-2' },
        ])
      );

      const [results1, results2] = await Promise.allSettled([
        transaction1,
        transaction2,
      ]);

      // 하나는 성공, 하나는 실패해야 함
      const success1 = results1.status === 'fulfilled';
      const success2 = results2.status === 'fulfilled';
      
      expect(success1 || success2).toBe(true);
      expect(board.version).toBe(initialVersion + (success1 ? 1 : 0) + (success2 ? 1 : 0));
    });

    it('should retry on version conflict with exponential backoff', async () => {
      const writePath = 'state.context.retry-test';
      const retryCount = 3;
      let actualRetries = 0;

      // 버전 매니저의 재시도 로직 테스트
      // 실제 구현에서는 버전 충돌 시 자동 재시도
      board.write(writePath, 'initial');

      const writeWithRetry = async (value: string, attempt = 0): Promise<void> => {
        try {
          board.write(writePath, value, { expectedVersion: board.version });
        } catch (error: any) {
          if (attempt < retryCount) {
            actualRetries++;
            // 지수 백오프
            const delay = Math.pow(2, attempt) * 10;
            await new Promise(resolve => setTimeout(resolve, delay));
            return writeWithRetry(value, attempt + 1);
          }
          throw error;
        }
      };

      // 여러 쓰기 시도
      await Promise.all([
        writeWithRetry('value-1'),
        writeWithRetry('value-2'),
        writeWithRetry('value-3'),
      ]);

      // 최종 상태는 하나의 값만 있어야 함
      const finalValue = board.read(writePath);
      expect(['value-1', 'value-2', 'value-3']).toContain(finalValue);
    });
  });

  describe('이벤트 순서 보장 테스트', () => {
    it('should preserve event order for sequential emits', async () => {
      const order: number[] = [];
      const eventCount = 100;

      bus.subscribe('test.order', (event) => {
        order.push((event.payload as any).sequence);
      });

      // 순차적 이벤트 발행
      for (let i = 0; i < eventCount; i++) {
        bus.emit({
          id: `event-${i}`,
          type: 'test.order',
          timestamp: new Date(),
          source: 'system',
          payload: { sequence: i },
        } as any);
      }

      // 순서 보장 확인
      expect(order).toHaveLength(eventCount);
      expect(order).toEqual(Array.from({ length: eventCount }, (_, i) => i));
    });

    it('should handle rapid concurrent emits correctly', async () => {
      const receivedOrder: string[] = [];
      const emitCount = 50;

      bus.subscribe('test.concurrent', (event) => {
        receivedOrder.push(event.id);
      });

      // 빠른 연속 이벤트 발행
      const emitPromises = Array.from({ length: emitCount }, (_, i) => {
        return Promise.resolve(bus.emit({
          id: `concurrent-${i}`,
          type: 'test.concurrent',
          timestamp: new Date(),
          source: 'system',
          payload: {},
        } as any));
      });

      await Promise.all(emitPromises);

      // 모든 이벤트 수신 확인
      expect(receivedOrder).toHaveLength(emitCount);
    });

    it('should guarantee order for async handlers', async () => {
      const executionOrder: number[] = [];
      const handlerCount = 5;

      // 여러 핸들러 등록
      for (let i = 0; i < handlerCount; i++) {
        bus.subscribe('test.async', async () => {
          // 무작위 지연으로 비동기 경쟁 시뮬레이션
          await new Promise(resolve => setTimeout(resolve, Math.random() * 20));
          executionOrder.push(i);
        });
      }

      await bus.emitAsync({
        id: 'async-test',
        type: 'test.async',
        timestamp: new Date(),
        source: 'system',
        payload: {},
      } as any);

      // 모든 핸들러가 실행되었는지 확인
      expect(executionOrder).toHaveLength(handlerCount);
      expect(new Set(executionOrder).size).toBe(handlerCount);
    });
  });

  describe('대량 구독자 성능 테스트', () => {
    it('should handle many subscribers efficiently', async () => {
      const subscriberCount = 1000;
      const eventCount = 100;
      let totalReceived = 0;

      // 대량 구독자 등록
      for (let i = 0; i < subscriberCount; i++) {
        bus.subscribe('test.performance', () => {
          totalReceived++;
        });
      }

      const startTime = Date.now();

      // 대량 이벤트 발행
      for (let i = 0; i < eventCount; i++) {
        bus.emit({
          id: `perf-${i}`,
          type: 'test.performance',
          timestamp: new Date(),
          source: 'system',
          payload: {},
        } as any);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 모든 구독자가 모든 이벤트를 수신했는지 확인
      expect(totalReceived).toBe(subscriberCount * eventCount);
      
      // 성능 기준: 1000 구독자 * 100 이벤트 = 100,000 처리는 1초 이내
      expect(duration).toBeLessThan(1000);
    });

    it('should handle wildcard subscriptions efficiently', async () => {
      const wildcardCount = 100;
      const specificCount = 100;
      const eventTypes = ['task.created', 'task.completed', 'task.failed'];
      let wildcardReceived = 0;
      let specificReceived = 0;

      // 와일드카드 구독자
      for (let i = 0; i < wildcardCount; i++) {
        bus.subscribe('task.*', () => {
          wildcardReceived++;
        });
      }

      // 특정 타입 구독자
      for (let i = 0; i < specificCount; i++) {
        bus.subscribe('task.completed', () => {
          specificReceived++;
        });
      }

      // 각 타입별 이벤트 발행
      for (const type of eventTypes) {
        for (let i = 0; i < 10; i++) {
          bus.emit({
            id: `${type}-${i}`,
            type,
            timestamp: new Date(),
            source: 'system',
            payload: {},
          } as any);
        }
      }

      // 와일드카드 구독자는 모든 타입 이벤트 수신
      expect(wildcardReceived).toBe(wildcardCount * eventTypes.length * 10);
      
      // 특정 구독자는 해당 타입만 수신
      expect(specificReceived).toBe(specificCount * 10);
    });

    it('should handle subscribe/unsubscribe efficiently', async () => {
      const operations = 1000;
      const startTime = Date.now();

      const unsubscribes: Array<() => void> = [];

      // 빠른 구독/해제
      for (let i = 0; i < operations; i++) {
        const unsub = bus.subscribe('test.dynamic', () => {});
        unsubscribes.push(unsub);
      }

      // 절반 해제
      for (let i = 0; i < operations / 2; i++) {
        unsubscribes[i]();
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 성능 기준: 1000회 구독/해제는 500ms 이내
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Agent와 Task 동시성 테스트', () => {
    it('should handle concurrent agent status updates', async () => {
      const agentId = createAgentId('concurrent-agent');
      const updateCount = 50;
      
      board.state.registerAgent(createTestAgent({ id: agentId }));

      // 동시 상태 업데이트
      const updatePromises = Array.from({ length: updateCount }, async (_, i) => {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
        board.state.updateAgent(agentId, {
          status: i % 2 === 0 ? AgentStatusEnum.ACTIVE : AgentStatusEnum.IDLE,
          currentTask: i % 3 === 0 ? createTaskId(`task-${i}`) : null,
        });
      });

      await Promise.all(updatePromises);

      // 최종 상태 확인
      const agent = board.state.getAgent(agentId);
      expect(agent).toBeDefined();
      expect([AgentStatusEnum.ACTIVE, AgentStatusEnum.IDLE]).toContain(agent?.status);
    });

    it('should handle concurrent task operations', async () => {
      const taskCount = 20;
      const createdTasks: string[] = [];

      // 동시 작업 생성
      const createPromises = Array.from({ length: taskCount }, async () => {
        const task = createTestTask({
          status: TaskStatus.PENDING,
          priority: Math.random() > 0.7 ? TaskPriority.HIGH : TaskPriority.NORMAL,
        });
        
        await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
        
        board.state.addTask(task);
        createdTasks.push(task.id);
      });

      await Promise.all(createPromises);

      // 모든 작업이 생성되었는지 확인
      const allTasks = board.state.getTasks();
      expect(allTasks).toHaveLength(taskCount);
      
      // 생성된 작업 ID 모두 존재하는지 확인
      for (const taskId of createdTasks) {
        expect(allTasks.some(t => t.id === taskId)).toBe(true);
      }
    });
  });
});
```

### 6. Snapshot 테스트

#### snapshot-manager.test.ts
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SnapshotManager,
  SNAPSHOT_FORMAT_VERSION,
  Blackboard,
  createSessionId,
  createAgentId,
  AgentStatusEnum,
} from '../../src';
import { createInitialState } from '../helpers/fixtures';
import { createTestAgent } from '../helpers/factories';

describe('SnapshotManager', () => {
  let manager: SnapshotManager;
  let board: Blackboard;

  beforeEach(() => {
    manager = new SnapshotManager();
    board = new Blackboard({ sessionId: createSessionId('test-session') });
    
    // 상태 설정
    board.state.registerAgent(createTestAgent({ role: 'analyst' }));
    board.state.phase = 'discussion';
    board.knowledge.addFact({
      content: 'Test fact',
      source: createAgentId('agent-1'),
      confidence: 0.9,
      category: 'test',
      tags: [],
      expiresAt: null,
    });
  });

  describe('createSnapshot()', () => {
    it('should create snapshot with metadata', () => {
      const snapshot = manager.createSnapshot(board.getState());

      expect(snapshot.meta.id).toBeDefined();
      expect(snapshot.meta.formatVersion).toBe(SNAPSHOT_FORMAT_VERSION);
      expect(snapshot.meta.stateVersion).toBe(board.version);
      expect(snapshot.data).toBeDefined();
    });

    it('should create compressed snapshot', () => {
      const snapshot = manager.createSnapshot(board.getState(), {
        compress: true,
      });

      expect(snapshot.meta.compressed).toBe(true);
      expect(typeof snapshot.data).toBe('string');
    });

    it('should include description and tags', () => {
      const snapshot = manager.createSnapshot(board.getState(), {
        description: 'Pre-voting checkpoint',
        tags: ['checkpoint', 'voting'],
      });

      expect(snapshot.meta.description).toBe('Pre-voting checkpoint');
      expect(snapshot.meta.tags).toEqual(['checkpoint', 'voting']);
    });
  });

  describe('validate()', () => {
    it('should validate correct snapshot', () => {
      const snapshot = manager.createSnapshot(board.getState());
      const result = manager.validate(snapshot);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid checksum', () => {
      const snapshot = manager.createSnapshot(board.getState());
      (snapshot.meta as any).checksum = 'invalid-checksum';
      
      const result = manager.validate(snapshot);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'CHECKSUM_INVALID')).toBe(true);
    });

    it('should detect version mismatch', () => {
      const snapshot = manager.createSnapshot(board.getState());
      (snapshot.meta as any).formatVersion = '0.0.1';
      
      const result = manager.validate(snapshot);

      expect(result.warnings.some(w => w.code === 'DEPRECATED_FORMAT')).toBe(true);
    });
  });

  describe('restore()', () => {
    it('should restore state from snapshot', () => {
      const originalPhase = board.state.phase;
      const snapshot = manager.createSnapshot(board.getState());
      
      // 상태 변경
      board.state.phase = 'voting';
      
      // 복원
      const restored = manager.restore(snapshot);

      expect(restored.state.phase).toBe(originalPhase);
    });

    it('should restore compressed snapshot', () => {
      const snapshot = manager.createSnapshot(board.getState(), {
        compress: true,
      });
      
      const restored = manager.restore(snapshot);

      expect(restored.state.phase).toBe('discussion');
    });

    it('should create new session ID when requested', () => {
      const snapshot = manager.createSnapshot(board.getState());
      const originalSessionId = board.meta.sessionId;
      
      const restored = manager.restore(snapshot, { newSessionId: true });

      expect(restored.meta.sessionId).not.toBe(originalSessionId);
    });

    it('should restore specific sections only', () => {
      const snapshot = manager.createSnapshot(board.getState());
      
      // 모든 섹션 변경
      board.state.phase = 'voting';
      board.knowledge.addFact({
        content: 'New fact',
        source: createAgentId('agent-2'),
        confidence: 0.5,
        category: 'new',
        tags: [],
        expiresAt: null,
      });
      
      const currentState = board.getState();
      const restored = manager.partialRestore(snapshot, currentState, ['state']);

      // state만 복원됨
      expect(restored.state.phase).toBe('discussion');
      // knowledge는 현재 상태 유지
      expect(restored.knowledge.facts).toHaveLength(2);
    });
  });

  describe('toJSON() / fromJSON()', () => {
    it('should serialize and deserialize snapshot', () => {
      const snapshot = manager.createSnapshot(board.getState());
      const json = manager.toJSON(snapshot);
      const restored = manager.fromJSON(json);

      expect(restored.meta.id).toBe(snapshot.meta.id);
      expect(manager.validate(restored).valid).toBe(true);
    });

    it('should produce valid JSON', () => {
      const snapshot = manager.createSnapshot(board.getState());
      const json = manager.toJSON(snapshot);

      expect(() => JSON.parse(json)).not.toThrow();
    });
  });

  describe('compare()', () => {
    it('should detect differences between snapshots', () => {
      const snapshot1 = manager.createSnapshot(board.getState());
      
      // 상태 변경
      board.state.phase = 'voting';
      board.knowledge.addFact({
        content: 'Another fact',
        source: createAgentId('agent-1'),
        confidence: 0.8,
        category: 'test',
        tags: [],
        expiresAt: null,
      });
      
      const snapshot2 = manager.createSnapshot(board.getState());
      const diff = manager.compare(snapshot1, snapshot2);

      expect(diff.meta.versionDiff).toBeGreaterThan(0);
      expect(diff.sections.state.modified).toBeGreaterThan(0);
      expect(diff.sections.knowledge.added).toBeGreaterThan(0);
    });
  });
});
```

---

## 테스트 실행 명령어

```bash
# 전체 테스트 실행
pnpm test

# 감시 모드
pnpm test:watch

# 커버리지 리포트
pnpm test:coverage

# 특정 파일만 테스트
pnpm test blackboard.test.ts

# 특정 describe 블록만 테스트
pnpm test -t "EventBus"
```

---

## 커버리지 목표

| 모듈 | 목표 커버리지 |
|------|-------------|
| types/ | 90% |
| core/blackboard.ts | 85% |
| core/accessors/ | 80% |
| core/versioning.ts | 90% |
| core/path-utils.ts | 95% |
| events/event-bus.ts | 85% |
| events/event-factory.ts | 90% |
| snapshot/snapshot-manager.ts | 80% |
| snapshot/serializer.ts | 90% |
| **전체** | **80%+** |

---

## 완료 조건

- [ ] 모든 모듈에 대한 테스트 파일 작성
- [ ] `pnpm test` 성공
- [ ] 커버리지 80% 이상 달성
- [ ] 동시성 테스트 케이스 포함
- [ ] 에러 케이스 테스트 포함
- [ ] 엣지 케이스 테스트 포함

---

## 엣지 케이스 체크리스트

### Core
- [ ] 빈 상태에서의 읽기/쓰기
- [ ] 깊은 중첩 경로 접근
- [ ] 동시 쓰기 시 버전 충돌
- [ ] Map이 비어있을 때 접근자 동작
- [ ] 잘못된 경로 형식 처리

### Events
- [ ] 핸들러 없이 emit
- [ ] 동일 핸들러 중복 구독
- [ ] 핸들러에서 예외 발생
- [ ] 비동기 핸들러 타임아웃
- [ ] 히스토리 크기 초과 시 동작

### Snapshot
- [ ] 대용량 상태 직렬화
- [ ] 압축된 스냅샷의 무결성
- [ ] 구버전 스냅샷 마이그레이션
- [ ] 손상된 스냅샷 복원 시도
- [ ] 부분 복원 시 충돌 처리

---

## 참고 문서

- [TASK-019: Blackboard Core](./TASK-019-blackboard-core.md)
- [TASK-020: Event Bus](./TASK-020-event-bus.md)
- [TASK-021: Snapshot/Restore](./TASK-021-snapshot-restore.md)
- [Vitest 공식 문서](https://vitest.dev/)