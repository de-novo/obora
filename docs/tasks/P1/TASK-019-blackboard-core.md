# TASK-019: Blackboard Core 구현

## 개요
- **상태**: ✅ 완료
- **우선순위**: P1
- **예상 소요**: 8시간
- **담당**: 개발자
- **의존성**: TASK-018 (Blackboard 상태 스키마)

## 목표
Blackboard의 핵심 기능 구현: 상태 CRUD 연산, 버전 관리(optimistic locking), 섹션별 접근 API

---

## 작업 내용

### 1. Blackboard 클래스 기본 구조 (`core/blackboard.ts`)

```typescript
import { EventEmitter } from 'events';
import type {
  BlackboardState,
  BlackboardMeta,
  StateSection,
  KnowledgeSection,
  DecisionsSection,
  SessionId,
  AgentId,
  TaskId,
  AgendaId,
} from '../types';

/**
 * Blackboard 설정 옵션
 */
export interface BlackboardOptions {
  /** 세션 ID (자동 생성되지 않으면 필수) */
  sessionId?: SessionId;
  /** 초기 상태 (스냅샷 복원 시 사용) */
  initialState?: Partial<BlackboardState>;
  /** 버전 충돌 시 재시도 횟수 */
  maxRetries?: number;
  /** 재시도 간격 (ms) */
  retryDelay?: number;
}

/**
 * 쿼리 옵션
 */
export interface QueryOptions {
  /** 깊은 복사 반환 여부 (기본: true) */
  deep?: boolean;
  /** 필터 조건 */
  filter?: Record<string, unknown>;
  /** 정렬 기준 */
  sort?: { field: string; order: 'asc' | 'desc' };
  /** 결과 제한 */
  limit?: number;
  /** 오프셋 */
  offset?: number;
}

/**
 * 쓰기 결과
 */
export interface WriteResult {
  /** 성공 여부 */
  success: boolean;
  /** 새 버전 번호 */
  version: number;
  /** 변경된 경로 */
  path: string;
  /** 이전 값 */
  previousValue: unknown;
  /** 에러 (실패 시) */
  error?: Error;
}

/**
 * 트랜잭션 연산
 */
export interface Operation {
  /** 연산 타입 */
  type: 'read' | 'write' | 'delete';
  /** 섹션 */
  section: string;
  /** 키/경로 */
  key: string;
  /** 값 (write 연산 시) */
  value?: unknown;
}

/**
 * 트랜잭션
 * @description 여러 연산을 원자적으로 실행하기 위한 트랜잭션 인터페이스
 */
export interface Transaction {
  /** 트랜잭션 ID */
  id: string;
  /** 연산 목록 */
  operations: Operation[];
  /** 롤백 - 변경 사항 되돌리기 */
  rollback(): Promise<void>;
  /** 커밋 - 변경 사항 적용 */
  commit(): Promise<void>;
}

/**
 * 버전 충돌 에러
 */
export class VersionConflictError extends Error {
  constructor(
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
    public readonly path: string
  ) {
    super(
      `Version conflict at ${path}: expected ${expectedVersion}, got ${actualVersion}`
    );
    this.name = 'VersionConflictError';
  }
}

/**
 * 경로 에러
 */
export class PathNotFoundError extends Error {
  constructor(public readonly path: string) {
    super(`Path not found: ${path}`);
    this.name = 'PathNotFoundError';
  }
}

/**
 * Blackboard 에러 코드
 * @description Blackboard 시스템의 모든 에러 코드 정의
 */
export enum BlackboardErrorCode {
  // 일반 에러 (1000-1099)
  UNKNOWN_ERROR = 1000,
  INVALID_INPUT = 1001,
  NOT_IMPLEMENTED = 1002,

  // 슬롯 관련 (2000-2099)
  SLOT_NOT_FOUND = 2000,
  SLOT_ALREADY_EXISTS = 2001,
  SLOT_TYPE_MISMATCH = 2002,
  SLOT_VERSION_CONFLICT = 2003,

  // 엔트리 관련 (2100-2199)
  ENTRY_NOT_FOUND = 2100,
  ENTRY_ALREADY_EXISTS = 2101,
  ENTRY_LOCKED = 2102,

  // State 관련 (3000-3099)
  AGENT_NOT_FOUND = 3000,
  AGENT_ALREADY_REGISTERED = 3001,
  AGENT_NOT_AVAILABLE = 3002,
  TASK_NOT_FOUND = 3003,
  TASK_ALREADY_ASSIGNED = 3004,
  TASK_IN_PROGRESS = 3005,

  // Knowledge 관련 (4000-4099)
  FACT_NOT_FOUND = 4000,
  INFERENCE_NOT_FOUND = 4001,
  PATTERN_NOT_FOUND = 4002,
  INVALID_PREMISES = 4003,

  // Decisions 관련 (5000-5099)
  AGENDA_NOT_FOUND = 5000,
  AGENDA_ALREADY_IN_PROGRESS = 5001,
  AGENDA_ALREADY_RESOLVED = 5002,
  VOTING_NOT_STARTED = 5003,
  VOTING_ALREADY_ENDED = 5004,
  QUORUM_NOT_REACHED = 5005,
  ALREADY_VOTED = 5006,
  CONSENSUS_NOT_REACHED = 5007,

  // 스냅샷 관련 (6000-6099)
  SNAPSHOT_NOT_FOUND = 6000,
  SNAPSHOT_CORRUPTED = 6001,
  SNAPSHOT_VERSION_MISMATCH = 6002,

  // 이벤트 관련 (7000-7099)
  EVENT_HANDLER_ERROR = 7000,
  SUBSCRIPTION_NOT_FOUND = 7001,
}

/**
 * Blackboard 에러 클래스
 */
export class BlackboardError extends Error {
  constructor(
    public readonly code: BlackboardErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'BlackboardError';
  }
}

/**
 * Blackboard 메인 클래스
 * @description 시스템의 단일 진실 소스(SSOT)를 관리하는 핵심 클래스
 * 
 * @example
 * ```typescript
 * const board = new Blackboard({ sessionId: createSessionId('session-001') });
 * 
 * // 읽기
 * const phase = board.read('state.phase');
 * 
 * // 쓰기 (버전 관리 포함)
 * const result = await board.write('state.phase', 'discussion', { expectedVersion: 1 });
 * 
 * // 섹션 접근
 * const stateSection = board.state;
 * const knowledgeSection = board.knowledge;
 * const decisionsSection = board.decisions;
 * ```
 */
export class Blackboard extends EventEmitter {
  private _state: BlackboardState;
  private readonly options: Required<BlackboardOptions>;

  constructor(options: BlackboardOptions = {}) {
    super();
    this.options = this.normalizeOptions(options);
    this._state = this.createInitialState();
  }

  // === Getters for sections ===
  
  /** 메타데이터 섹션 (읽기 전용) */
  get meta(): Readonly<BlackboardMeta>;
  
  /** 상태 섹션 접근자 */
  get state(): StateSectionAccessor;
  
  /** 지식 섹션 접근자 */
  get knowledge(): KnowledgeSectionAccessor;
  
  /** 의사결정 섹션 접근자 */
  get decisions(): DecisionsSectionAccessor;
  
  /** 현재 버전 */
  get version(): number;

  // === Core API ===

  /**
   * 현재 전체 상태 조회
   * @returns 현재 Blackboard 상태 (스냅샷용)
   */
  getState(): BlackboardState;

  /**
   * 경로 기반 읽기
   * @param path - 점(.)으로 구분된 경로 (예: 'state.phase', 'decisions.current')
   * @param options - 쿼리 옵션
   * @returns 해당 경로의 값 (deep copy)
   * @throws {PathNotFoundError} 경로가 존재하지 않을 때
   */
  read<T = unknown>(path: string, options?: QueryOptions): T;

  /**
   * 경로 기반 쓰기 (동기)
   * @param path - 점(.)으로 구분된 경로
   * @param value - 새 값
   * @param options - 쓰기 옵션 (expectedVersion 포함)
   * @returns 쓰기 결과
   * @throws {VersionConflictError} 버전 충돌 시
   */
  write(
    path: string,
    value: unknown,
    options?: { expectedVersion?: number }
  ): WriteResult;

  /**
   * 경로 기반 삭제
   * @param path - 삭제할 경로
   * @param options - 삭제 옵션
   * @returns 삭제 결과
   */
  delete(
    path: string,
    options?: { expectedVersion?: number }
  ): WriteResult;

  /**
   * 경로 존재 여부 확인
   * @param path - 확인할 경로
   */
  exists(path: string): boolean;

  /**
   * 트랜잭션 실행
   * @description 여러 쓰기를 원자적으로 실행
   * @param operations - 실행할 연산 목록
   * @returns 전체 트랜잭션 결과
   */
  transaction(
    operations: Array<{
      type: 'write' | 'delete';
      path: string;
      value?: unknown;
    }>
  ): WriteResult[];
}
```

### 2. 섹션 접근자 클래스들 (`core/accessors/`)

#### State Section Accessor
```typescript
/**
 * 상태 섹션 접근자
 * @description state 섹션에 대한 타입 안전한 접근 제공
 */
export class StateSectionAccessor {
  constructor(private board: Blackboard) {}

  /** 현재 단계 */
  get phase(): BoardPhase;
  set phase(value: BoardPhase);

  /** 컨텍스트 데이터 */
  get context(): Record<string, unknown>;
  setContext(key: string, value: unknown): void;
  getContext<T>(key: string): T | undefined;

  // === 에이전트 관리 ===
  
  /**
   * 에이전트 등록
   * @param agent - 에이전트 상태 정보
   */
  registerAgent(agent: AgentStatus): void;

  /**
   * 에이전트 상태 업데이트
   * @param agentId - 에이전트 ID
   * @param updates - 업데이트할 필드
   */
  updateAgent(agentId: AgentId, updates: Partial<AgentStatus>): void;

  /**
   * 에이전트 제거
   * @param agentId - 에이전트 ID
   */
  removeAgent(agentId: AgentId): void;

  /**
   * 에이전트 조회
   * @param agentId - 에이전트 ID
   */
  getAgent(agentId: AgentId): AgentStatus | undefined;

  /**
   * 모든 에이전트 조회
   * @param filter - 필터 조건
   */
  getAgents(filter?: { role?: AgentRole; status?: AgentStatusEnum }): AgentStatus[];

  // === 작업 관리 ===
  
  /**
   * 작업 추가
   */
  addTask(task: Task): void;

  /**
   * 작업 업데이트
   */
  updateTask(taskId: TaskId, updates: Partial<Task>): void;

  /**
   * 작업 조회
   */
  getTask(taskId: TaskId): Task | undefined;

  /**
   * 작업 목록 조회
   */
  getTasks(filter?: { status?: TaskStatus; assignedTo?: AgentId }): Task[];

  /**
   * 다음 실행 가능한 작업들
   * @param completedTasks - 완료된 작업 ID 목록
   */
  getNextTasks(completedTasks: Set<TaskId>): Task[];
}
```

#### Knowledge Section Accessor
```typescript
/**
 * 지식 섹션 접근자
 */
export class KnowledgeSectionAccessor {
  constructor(private board: Blackboard) {}

  // === 사실 관리 ===
  
  /**
   * 사실 추가
   * @param fact - 새 사실
   */
  addFact(fact: Omit<Fact, 'id' | 'createdAt' | 'updatedAt'>): Fact;

  /**
   * 사실 조회
   */
  getFact(factId: string): Fact | undefined;

  /**
   * 사실 검색
   */
  findFacts(query: {
    category?: string;
    source?: AgentId;
    tags?: string[];
    minConfidence?: number;
  }): Fact[];

  /**
   * 만료된 사실 정리
   */
  cleanupExpiredFacts(): number;

  // === 추론 관리 ===
  
  /**
   * 추론 추가
   */
  addInference(inference: Omit<Inference, 'id' | 'createdAt' | 'updatedAt'>): Inference;

  /**
   * 추론 조회
   */
  getInference(inferenceId: string): Inference | undefined;

  /**
   * 특정 사실을 전제로 하는 추론 찾기
   */
  findInferencesByPremise(factId: string): Inference[];

  // === 패턴 관리 ===
  
  /**
   * 패턴 추가/업데이트
   */
  upsertPattern(pattern: Omit<Pattern, 'createdAt' | 'updatedAt'>): Pattern;

  /**
   * 패턴 사용 기록
   */
  recordPatternUsage(patternId: string, success: boolean): void;
}
```

#### Decisions Section Accessor
```typescript
/**
 * 의사결정 섹션 접근자
 */
export class DecisionsSectionAccessor {
  constructor(private board: Blackboard) {}

  // === 안건 관리 ===
  
  /** 현재 안건 */
  get current(): Agenda | null;

  /** 대기 중인 안건들 */
  get pending(): Agenda[];

  /**
   * 안건 제출
   * @param agenda - 새 안건 (id 자동 생성)
   */
  submitAgenda(agenda: Omit<Agenda, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'version'>): Agenda;

  /**
   * 안건 상태 변경
   */
  updateAgendaStatus(agendaId: AgendaId, status: AgendaStatus): void;

  /**
   * 현재 안건 설정
   */
  setCurrentAgenda(agendaId: AgendaId): void;

  /**
   * 안건 취소
   */
  cancelAgenda(agendaId: AgendaId, reason: string): void;

  // === 의견 관리 ===
  
  /**
   * 의견 제출
   */
  submitOpinion(opinion: Omit<Opinion, 'createdAt' | 'updatedAt'>): void;

  /**
   * 특정 안건의 모든 의견 조회
   */
  getOpinions(agendaId: AgendaId): Opinion[];

  /**
   * 의견 요약
   */
  summarizeOpinions(agendaId: AgendaId): {
    total: number;
    approve: number;
    reject: number;
    conditional: number;
    abstain: number;
  };

  /**
   * 모든 의견 초기화 (재투표 시)
   */
  clearOpinions(agendaId: AgendaId): void;

  // === 결정 관리 ===
  
  /**
   * 결정 기록
   */
  recordResolution(resolution: Omit<Resolution, 'id' | 'createdAt' | 'updatedAt'>): Resolution;

  /**
   * 결정 이력 조회
   */
  getHistory(filter?: { agendaId?: AgendaId; decision?: DecisionType }): Resolution[];

  /**
   * 최근 N개 결정 조회
   */
  getRecentResolutions(count: number): Resolution[];
}
```

### 3. 버전 관리 구현 (`core/versioning.ts`)

```typescript
/**
 * 버전 관리 설정
 */
export interface VersioningConfig {
  /** 충돌 시 재시도 횟수 */
  maxRetries: number;
  /** 재시도 간격 (ms) */
  retryDelay: number;
  /** 지수 백오프 사용 여부 */
  exponentialBackoff: boolean;
}

/**
 * Optimistic Locking 관리자
 * @description 동시 쓰기 충돌을 감지하고 처리
 */
export class VersionManager {
  constructor(private config: VersioningConfig) {}

  /**
   * 버전 검증
   * @param currentVersion - 현재 버전
   * @param expectedVersion - 예상 버전
   * @param path - 경로 (에러 메시지용)
   * @throws {VersionConflictError} 버전 불일치 시
   */
  validateVersion(
    currentVersion: number,
    expectedVersion: number,
    path: string
  ): void;

  /**
   * 버전 증가
   * @param currentVersion - 현재 버전
   * @returns 새 버전
   */
  incrementVersion(currentVersion: number): number;

  /**
   * 재시도 가능한 쓰기 실행
   * @param operation - 실행할 쓰기 연산
   * @returns 최종 결과
   */
  async executeWithRetry<T>(
    operation: () => T | Promise<T>
  ): Promise<T>;

  /**
   * 재시도 지연 계산
   * @param attempt - 현재 시도 횟수 (0부터)
   * @returns 지연 시간 (ms)
   */
  calculateDelay(attempt: number): number;
}
```

### 4. 경로 유틸리티 (`core/path-utils.ts`)

```typescript
/**
 * 경로 파싱 결과
 */
export interface ParsedPath {
  /** 섹션 (state, knowledge, decisions) */
  section: 'meta' | 'state' | 'knowledge' | 'decisions';
  /** 나머지 경로 세그먼트 */
  segments: string[];
  /** 전체 경로 */
  full: string;
}

/**
 * 경로 기반 값 접근
 * @param obj - 대상 객체
 * @param path - 점(.)으로 구분된 경로
 * @returns 해당 경로의 값
 */
export function getByPath<T = unknown>(obj: unknown, path: string): T | undefined;

/**
 * 경로 기반 값 설정
 * @param obj - 대상 객체
 * @param path - 점(.)으로 구분된 경로
 * @param value - 설정할 값
 * @returns 수정된 객체 (불변성 유지)
 */
export function setByPath<T>(obj: T, path: string, value: unknown): T;

/**
 * 경로 기반 값 삭제
 * @param obj - 대상 객체
 * @param path - 점(.)으로 구분된 경로
 * @returns 수정된 객체 (불변성 유지)
 */
export function deleteByPath<T>(obj: T, path: string): T;

/**
 * 경로 파싱
 * @param path - 전체 경로
 * @returns 파싱된 경로 정보
 */
export function parsePath(path: string): ParsedPath;

/**
 * 경로 검증
 * @param path - 검증할 경로
 * @returns 유효 여부
 */
export function isValidPath(path: string): boolean;

/**
 * 경로 정규화
 * @param path - 정규화할 경로
 * @returns 정규화된 경로
 */
export function normalizePath(path: string): string;
```

### 5. 딥 클론 및 불변성 유틸리티 (`core/immutable.ts`)

```typescript
/**
 * 깊은 복사
 * @param obj - 복사할 객체
 * @returns 깊은 복사본
 */
export function deepClone<T>(obj: T): T;

/**
 * 깊은 동결 (불변 객체 생성)
 * @param obj - 동결할 객체
 * @returns 동결된 객체
 */
export function deepFreeze<T>(obj: T): Readonly<T>;

/**
 * 불변 업데이트
 * @description 중첩된 객체를 불변성을 유지하며 업데이트
 * @param obj - 원본 객체
 * @param path - 업데이트할 경로
 * @param updater - 업데이트 함수
 * @returns 새 객체
 */
export function immutableUpdate<T>(
  obj: T,
  path: string,
  updater: (value: unknown) => unknown
): T;

/**
 * Map을 일반 객체로 변환
 * @param map - 변환할 Map
 * @returns 일반 객체
 */
export function mapToObject<K extends string, V>(
  map: Map<K, V>
): Record<K, V>;

/**
 * 일반 객체를 Map으로 변환
 * @param obj - 변환할 객체
 * @returns Map
 */
export function objectToMap<K extends string, V>(
  obj: Record<K, V>
): Map<K, V>;
```

### 6. ID 생성기 (`core/id-generator.ts`)

```typescript
import { AgentId, TaskId, AgendaId, SessionId } from '../types';

/**
 * ID 생성기 인터페이스
 */
export interface IdGenerator {
  generateAgentId(): AgentId;
  generateTaskId(): TaskId;
  generateAgendaId(): AgendaId;
  generateSessionId(): SessionId;
  generateGenericId(prefix?: string): string;
}

/**
 * 기본 ID 생성기 (UUID v4 기반)
 */
export class DefaultIdGenerator implements IdGenerator {
  generateAgentId(): AgentId;
  generateTaskId(): TaskId;
  generateAgendaId(): AgendaId;
  generateSessionId(): SessionId;
  generateGenericId(prefix?: string): string;
}

/**
 * 테스트용 시퀀셜 ID 생성기
 */
export class SequentialIdGenerator implements IdGenerator {
  private counters: Map<string, number>;
  
  generateAgentId(): AgentId;
  generateTaskId(): TaskId;
  generateAgendaId(): AgendaId;
  generateSessionId(): SessionId;
  generateGenericId(prefix?: string): string;
  
  /** 카운터 리셋 (테스트용) */
  reset(): void;
}
```

---

## 파일 구조

```
packages/blackboard/
└── src/
    ├── types/                  # (TASK-018)
    │   └── ...
    ├── core/
    │   ├── index.ts            # Core exports
    │   ├── blackboard.ts       # 메인 Blackboard 클래스
    │   ├── versioning.ts       # 버전 관리
    │   ├── path-utils.ts       # 경로 유틸리티
    │   ├── immutable.ts        # 불변성 유틸리티
    │   ├── id-generator.ts     # ID 생성
    │   └── accessors/
    │       ├── index.ts
    │       ├── state-accessor.ts
    │       ├── knowledge-accessor.ts
    │       └── decisions-accessor.ts
    └── index.ts                # Main exports
```

---

## 사용 예시

```typescript
import { Blackboard, createSessionId, createAgentId } from '@obora-kit/blackboard';

// Blackboard 생성
const board = new Blackboard({
  sessionId: createSessionId('session-001'),
});

// 에이전트 등록
board.state.registerAgent({
  id: createAgentId('ceo'),
  role: 'director',
  status: AgentStatusEnum.ACTIVE,
  currentTask: null,
  lastHeartbeat: new Date(),
  metadata: { model: 'gpt-4' },
  createdAt: new Date(),
  updatedAt: new Date(),
});

// 안건 제출
const agenda = board.decisions.submitAgenda({
  title: '신규 서비스 출시',
  description: 'Q2 신규 서비스 출시 검토',
  proposer: createAgentId('ceo'),
  deadline: new Date('2026-03-01'),
  requiredQuorum: 3,
  votingMethod: 'majority',
  priority: 5,
  tags: ['business'],
  attachments: [],
});

// 상태 변경 (버전 관리)
const result = board.write('state.phase', 'discussion', {
  expectedVersion: board.version,
});

// 의견 제출
board.decisions.submitOpinion({
  agentId: createAgentId('cfo'),
  agendaId: agenda.id,
  stance: 'approve',
  reason: 'ROI 분석 결과 긍정적',
  conditions: [],
  confidence: 0.85,
  references: [],
});

// 사실 추가
board.knowledge.addFact({
  content: 'Q1 매출 15% 증가',
  source: createAgentId('cfo'),
  confidence: 1.0,
  category: 'finance',
  tags: ['revenue', 'Q1'],
  expiresAt: null,
});

// 결정 기록
board.decisions.recordResolution({
  agendaId: agenda.id,
  decision: 'approved',
  summary: '신규 서비스 출시 승인',
  voteSummary: { approve: 3, reject: 0, abstain: 0, conditional: 0, total: 3 },
  conditions: [],
  dissent: [],
  decidedBy: createAgentId('ceo'),
  nextActions: [],
});
```

---

## 완료 조건

- [x] Blackboard 클래스 구현 완료
- [x] 3개 섹션 접근자 구현 완료
- [x] 버전 관리 (optimistic locking) 동작 확인
- [x] 경로 기반 CRUD 동작 확인
- [x] 트랜잭션 지원 확인
- [x] `tsc --noEmit` 통과
- [x] 기본 사용 예시 실행 가능

---

## 참고 문서

- [TASK-018: Blackboard 상태 스키마](./TASK-018-blackboard-schema.md)
- [Blackboard + Actor 설계 문서](../../architecture/blackboard-actor-design.md)
- Optimistic Locking 패턴

---

## 재동기화 판정 (2026-02-13)
- 최종 판정: **✅ 완료**
- 근거 코드:
  - `packages/blackboard/src/core/blackboard.ts`
  - `packages/blackboard/src/core/accessors/state-accessor.ts`
  - `packages/blackboard/src/core/accessors/knowledge-accessor.ts`
  - `packages/blackboard/src/core/accessors/decisions-accessor.ts`
  - `packages/blackboard/src/core/versioning.ts`
  - `packages/blackboard/src/core/path-utils.ts`
  - `packages/blackboard/src/core/immutable.ts`
  - `packages/blackboard/src/core/id-generator.ts`
- 검증 결과: Blackboard CRUD, 섹션 접근자, 버전 관리, 경로 유틸이 구현되어 코어 테스트가 통과합니다.
- 검증 명령:
  - `pnpm --filter @obora-kit/blackboard test` ✅ (14 files, 470 tests passed)
  - `pnpm --filter @obora-kit/blackboard typecheck` ✅
  - `pnpm --filter @obora-kit/blackboard build` ✅

