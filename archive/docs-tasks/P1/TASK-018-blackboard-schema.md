# TASK-018: Blackboard 상태 스키마 정의

## 개요
- **상태**: ✅ 완료
- **우선순위**: P1
- **예상 소요**: 4시간
- **담당**: 개발자
- **의존성**: 없음

## 목표
Blackboard 시스템의 핵심 TypeScript 인터페이스 및 타입 정의. 모든 타입에 JSDoc 주석을 포함하여 자체 문서화된 코드를 작성.

---

## 작업 내용

### 1. 기본 타입 정의 (`types/base.ts`)

#### ID 타입
```typescript
/**
 * 고유 식별자 타입들
 */
export type AgentId = string & { readonly __brand: 'AgentId' };
export type TaskId = string & { readonly __brand: 'TaskId' };
export type AgendaId = string & { readonly __brand: 'AgendaId' };
export type SessionId = string & { readonly __brand: 'SessionId' };

/**
 * 타입 가드 및 생성 함수
 */
export function createAgentId(id: string): AgentId;
export function createTaskId(id: string): TaskId;
export function createAgendaId(id: string): AgendaId;
export function createSessionId(id: string): SessionId;
```

#### 공통 인터페이스
```typescript
/**
 * 타임스탬프가 포함된 기본 엔티티
 */
export interface Timestamped {
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * 버전 관리가 포함된 엔티티
 */
export interface Versioned {
  readonly version: number;
}

/**
 * 식별 가능한 엔티티
 */
export interface Identifiable<T extends string = string> {
  readonly id: T;
}
```

### 2. 에이전트 관련 타입 (`types/agent.ts`)

```typescript
/**
 * 에이전트 상태 enum
 * @description 에이전트의 현재 활동 상태를 나타냄
 */
export enum AgentStatusEnum {
  /** 유휴 상태 - 작업 대기 중 */
  IDLE = 'idle',
  /** 작업 중 - 활성 상태 */
  BUSY = 'busy',
  /** 오류 상태 - 복구 필요 */
  ERROR = 'error',
  /** 중지됨 */
  STOPPED = 'stopped',
}

/**
 * 에이전트 역할 타입
 */
export type AgentRole = 'analyst' | 'executor' | 'verifier' | 'director';

/**
 * 에이전트 상태 정보
 * @example
 * ```typescript
 * const agentStatus: AgentStatus = {
 *   id: createAgentId('agent-001'),
 *   role: 'analyst',
 *   status: AgentStatusEnum.ACTIVE,
 *   currentTask: createTaskId('task-001'),
 *   lastHeartbeat: new Date(),
 *   metadata: { model: 'gpt-4' }
 * };
 * ```
 */
export interface AgentStatus extends Timestamped {
  /** 에이전트 고유 ID */
  readonly id: AgentId;
  /** 에이전트 역할 */
  readonly role: AgentRole;
  /** 현재 상태 */
  status: AgentStatusEnum;
  /** 현재 수행 중인 작업 (없으면 null) */
  currentTask: TaskId | null;
  /** 마지막 하트비트 시간 */
  lastHeartbeat: Date;
  /** 추가 메타데이터 */
  metadata: Record<string, unknown>;
}
```

### 3. 작업(Task) 관련 타입 (`types/task.ts`)

```typescript
/**
 * 작업 상태 enum
 */
export enum TaskStatus {
  /** 대기 중 */
  PENDING = 'pending',
  /** 실행 중 */
  RUNNING = 'running',
  /** 완료됨 */
  COMPLETED = 'completed',
  /** 실패함 */
  FAILED = 'failed',
  /** 취소됨 */
  CANCELLED = 'cancelled',
}

/**
 * 작업 우선순위
 */
export enum TaskPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/**
 * 작업 정의
 */
export interface Task extends Identifiable<TaskId>, Timestamped, Versioned {
  /** 작업 이름 */
  name: string;
  /** 작업 설명 */
  description: string;
  /** 할당된 에이전트 */
  assignedTo: AgentId | null;
  /** 현재 상태 */
  status: TaskStatus;
  /** 우선순위 */
  priority: TaskPriority;
  /** 입력 데이터 */
  inputs: Record<string, unknown>;
  /** 출력 데이터 (완료 시) */
  outputs: Record<string, unknown> | null;
  /** 의존하는 작업 ID 목록 */
  dependsOn: TaskId[];
  /** 에러 정보 (실패 시) */
  error: TaskError | null;
  /** 시작 시간 */
  startedAt: Date | null;
  /** 완료 시간 */
  completedAt: Date | null;
  /** 제한 시간 (밀리초) */
  timeout: number | null;
}

/**
 * 작업 에러 정보
 */
export interface TaskError {
  /** 에러 코드 */
  code: string;
  /** 에러 메시지 */
  message: string;
  /** 스택 트레이스 */
  stack?: string;
  /** 재시도 가능 여부 */
  retryable: boolean;
}
```

### 4. 의사결정 관련 타입 (`types/decision.ts`)

#### Agenda (안건)
```typescript
/**
 * 투표 방식
 */
export type VotingMethod = 'majority' | 'unanimous' | 'weighted' | 'supermajority';

/**
 * 안건 상태
 */
export enum AgendaStatus {
  /** 초안 - 아직 제출되지 않음 */
  DRAFT = 'draft',
  /** 제출됨 - 논의 대기 */
  SUBMITTED = 'submitted',
  /** 논의 중 */
  DISCUSSING = 'discussing',
  /** 토론 중 */
  DEBATING = 'debating',
  /** 투표 중 */
  VOTING = 'voting',
  /** 결정됨 */
  RESOLVED = 'resolved',
  /** 연기됨 */
  DEFERRED = 'deferred',
  /** 취소됨 */
  CANCELLED = 'cancelled',
}

/**
 * 안건 (의제)
 * @description AI 이사회에서 논의할 주제
 * @example
 * ```typescript
 * const agenda: Agenda = {
 *   id: createAgendaId('agenda-001'),
 *   title: '신규 서비스 출시 검토',
 *   description: 'Q2에 출시 예정인 신규 서비스의 적합성 검토',
 *   proposer: createAgentId('ceo-agent'),
 *   status: AgendaStatus.SUBMITTED,
 *   deadline: new Date('2026-02-10'),
 *   requiredQuorum: 3,
 *   votingMethod: 'majority',
 *   priority: 1,
 *   tags: ['business', 'strategy'],
 *   attachments: [],
 *   createdAt: new Date(),
 *   updatedAt: new Date(),
 *   version: 1,
 * };
 * ```
 */
export interface Agenda extends Identifiable<AgendaId>, Timestamped, Versioned {
  /** 안건 제목 */
  title: string;
  /** 안건 상세 설명 */
  description: string;
  /** 제안자 에이전트 ID */
  proposer: AgentId;
  /** 현재 상태 */
  status: AgendaStatus;
  /** 마감 기한 (선택) */
  deadline: Date | null;
  /** 필요 정족수 */
  requiredQuorum: number;
  /** 투표 방식 */
  votingMethod: VotingMethod;
  /** 우선순위 (0-10, 높을수록 중요) */
  priority: number;
  /** 태그 */
  tags: string[];
  /** 첨부 자료 */
  attachments: Attachment[];
}

/**
 * 첨부 자료
 */
export interface Attachment {
  /** 파일명 */
  name: string;
  /** MIME 타입 */
  mimeType: string;
  /** URL 또는 데이터 참조 */
  url: string;
  /** 크기 (바이트) */
  size: number;
}
```

#### Opinion (의견)
```typescript
/**
 * 입장 (스탠스)
 */
export type Stance = 'approve' | 'reject' | 'conditional' | 'abstain';

/**
 * 의견
 * @description 에이전트가 안건에 대해 제출하는 의견
 */
export interface Opinion extends Timestamped {
  /** 의견 제출자 */
  agentId: AgentId;
  /** 관련 안건 ID */
  agendaId: AgendaId;
  /** 입장 */
  stance: Stance;
  /** 의견 내용 (근거) */
  reason: string;
  /** 조건 (conditional일 경우) */
  conditions: string[];
  /** 확신도 (0.0 - 1.0) */
  confidence: number;
  /** 참조한 사실/추론 ID 목록 */
  references: string[];
}
```

#### Resolution (결정)
```typescript
/**
 * 최종 결정 유형
 */
export type DecisionType = 'approved' | 'rejected' | 'deferred' | 'amended';

/**
 * 투표 요약
 */
export interface VoteSummary {
  /** 찬성 수 */
  approve: number;
  /** 반대 수 */
  reject: number;
  /** 기권 수 */
  abstain: number;
  /** 조건부 찬성 수 */
  conditional: number;
  /** 총 투표 수 */
  total: number;
}

/**
 * 결정 (해결)
 * @description 안건에 대한 최종 결정 기록
 */
export interface Resolution extends Identifiable, Timestamped {
  /** 관련 안건 ID */
  agendaId: AgendaId;
  /** 결정 유형 */
  decision: DecisionType;
  /** 결정 요약 */
  summary: string;
  /** 투표 결과 요약 */
  voteSummary: VoteSummary;
  /** 이행 조건 (있는 경우) */
  conditions: string[];
  /** 반대 의견 요약 (있는 경우) */
  dissent: string[];
  /** 결정 주체 (director) */
  decidedBy: AgentId;
  /** 다음 단계 행동 */
  nextActions: NextAction[];
}

/**
 * 다음 단계 행동
 */
export interface NextAction {
  /** 행동 설명 */
  description: string;
  /** 담당자 */
  assignee: AgentId | null;
  /** 기한 */
  dueDate: Date | null;
}
```

### 5. 지식 관련 타입 (`types/knowledge.ts`)

```typescript
/**
 * 사실 (Fact)
 * @description 검증된 정보
 */
export interface Fact extends Identifiable, Timestamped {
  /** 사실 내용 */
  content: string;
  /** 출처 에이전트 */
  source: AgentId;
  /** 신뢰도 (0.0 - 1.0) */
  confidence: number;
  /** 카테고리 */
  category: string;
  /** 태그 */
  tags: string[];
  /** 유효 기간 (만료 시간, null이면 영구) */
  expiresAt: Date | null;
}

/**
 * 추론 (Inference)
 * @description 사실들로부터 도출된 결론
 */
export interface Inference extends Identifiable, Timestamped {
  /** 결론 */
  conclusion: string;
  /** 전제 (참조하는 Fact ID들) */
  premises: string[];
  /** 추론한 에이전트 */
  derivedBy: AgentId;
  /** 추론 방법 */
  method: 'deduction' | 'induction' | 'abduction';
  /** 신뢰도 */
  confidence: number;
}

/**
 * 패턴 (Pattern)
 * @description 학습된 패턴
 */
export interface Pattern extends Identifiable, Timestamped {
  /** 패턴 이름 */
  name: string;
  /** 패턴 설명 */
  description: string;
  /** 발견한 에이전트 */
  discoveredBy: AgentId;
  /** 적용 횟수 */
  usageCount: number;
  /** 성공률 */
  successRate: number;
}
```

### 6. 메시지 관련 타입 (`types/message.ts`)

```typescript
/**
 * 메시지 타입 enum
 * @description 시스템 내 모든 메시지 유형
 */
export enum MessageType {
  // === 상태 관련 ===
  /** 상태 읽기 요청 */
  STATE_READ = 'state.read',
  /** 상태 쓰기 요청 */
  STATE_WRITE = 'state.write',
  /** 상태 구독 */
  STATE_SUBSCRIBE = 'state.subscribe',
  /** 상태 변경 알림 */
  STATE_UPDATED = 'state.updated',

  // === 의사결정 관련 ===
  /** 안건 제출 요청 */
  DECISION_REQUEST = 'decision.request',
  /** 의견 제출 */
  OPINION_SUBMIT = 'opinion.submit',
  /** 투표 제출 */
  VOTE_SUBMIT = 'vote.submit',
  /** 합의 도달 알림 */
  CONSENSUS_REACHED = 'consensus.reached',

  // === 작업 관련 ===
  /** 작업 할당 */
  TASK_ASSIGN = 'task.assign',
  /** 작업 완료 */
  TASK_COMPLETE = 'task.complete',
  /** 작업 실패 */
  TASK_FAILED = 'task.failed',
  /** 작업 진행 상황 */
  TASK_PROGRESS = 'task.progress',

  // === 지식 관련 ===
  /** 사실 추가 */
  KNOWLEDGE_FACT_ADD = 'knowledge.fact.add',
  /** 추론 추가 */
  KNOWLEDGE_INFERENCE_ADD = 'knowledge.inference.add',

  // === 시스템 관련 ===
  /** 하트비트 */
  HEARTBEAT = 'heartbeat',
  /** 에러 */
  ERROR = 'error',
  /** 시스템 알림 */
  SYSTEM_NOTIFICATION = 'system.notification',
}

/**
 * 메시지 기본 인터페이스
 * @typeParam T - 페이로드 타입
 */
export interface Message<T = unknown> extends Identifiable, Timestamped {
  /** 메시지 타입 */
  type: MessageType;
  /** 발신자 ID */
  from: AgentId;
  /** 수신자 ID ('broadcast'면 전체) */
  to: AgentId | 'broadcast';
  /** 메시지 내용 */
  payload: T;
  /** 상관 ID (요청-응답 연결용) */
  correlationId?: string;
  /** 우선순위 */
  priority: number;
  /** TTL (밀리초, null이면 무제한) */
  ttl: number | null;
}

/**
 * 상태 읽기 요청 페이로드
 */
export interface StateReadPayload {
  section: 'state' | 'knowledge' | 'decisions';
  path: string;
  query?: Record<string, unknown>;
}

/**
 * 상태 쓰기 요청 페이로드
 */
export interface StateWritePayload {
  section: 'state' | 'knowledge' | 'decisions';
  path: string;
  data: unknown;
  expectedVersion?: number;
}

/**
 * 에러 페이로드
 */
export interface ErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
}
```

### 7. Blackboard 상태 스키마 (`types/blackboard.ts`)

```typescript
import type { AgentId, TaskId, AgendaId, SessionId } from './base';
import type { AgentStatus } from './agent';
import type { Task } from './task';
import type { Agenda, Opinion, Resolution } from './decision';
import type { Fact, Inference, Pattern } from './knowledge';

/**
 * 이사회 회의 단계
 */
export type BoardPhase = 
  | 'idle'       // 유휴 상태
  | 'agenda_setting'  // 안건 설정
  | 'discussion'     // 논의
  | 'debate'         // 토론
  | 'voting'         // 투표
  | 'resolved';      // 해결됨

/**
 * Blackboard 메타데이터
 */
export interface BlackboardMeta {
  /** 상태 버전 (optimistic locking용) */
  version: number;
  /** 마지막 업데이트 시간 */
  lastUpdated: Date;
  /** 현재 세션 ID */
  sessionId: SessionId;
  /** 생성 시간 */
  createdAt: Date;
}

/**
 * 상태 섹션
 * @description 현재 시스템 상태를 담는 섹션
 */
export interface StateSection {
  /** 현재 단계 */
  phase: BoardPhase;
  /** 컨텍스트 데이터 */
  context: Record<string, unknown>;
  /** 에이전트 상태 맵 */
  agents: Map<AgentId, AgentStatus>;
  /** 작업 맵 */
  tasks: Map<TaskId, Task>;
}

/**
 * 지식 섹션
 * @description 축적된 지식을 담는 섹션
 */
export interface KnowledgeSection {
  /** 사실 목록 */
  facts: Fact[];
  /** 추론 목록 */
  inferences: Inference[];
  /** 패턴 목록 */
  patterns: Pattern[];
}

/**
 * 의사결정 섹션
 * @description 안건 및 결정을 담는 섹션
 */
export interface DecisionsSection {
  /** 현재 논의 중인 안건 */
  current: Agenda | null;
  /** 대기 중인 안건들 */
  pending: Agenda[];
  /** 에이전트별 의견 */
  opinions: Map<AgentId, Opinion>;
  /** 결정 이력 */
  history: Resolution[];
}

/**
 * 전체 Blackboard 상태
 * @description 시스템의 단일 진실 소스 (SSOT)
 * 
 * @example
 * ```typescript
 * const blackboardState: BlackboardState = {
 *   meta: {
 *     version: 1,
 *     lastUpdated: new Date(),
 *     sessionId: createSessionId('session-001'),
 *     createdAt: new Date(),
 *   },
 *   state: {
 *     phase: 'idle',
 *     context: {},
 *     agents: new Map(),
 *     tasks: new Map(),
 *   },
 *   knowledge: {
 *     facts: [],
 *     inferences: [],
 *     patterns: [],
 *   },
 *   decisions: {
 *     current: null,
 *     pending: [],
 *     opinions: new Map(),
 *     history: [],
 *   },
 * };
 * ```
 */
export interface BlackboardState {
  /** 메타데이터 */
  meta: BlackboardMeta;
  /** 상태 섹션 */
  state: StateSection;
  /** 지식 섹션 */
  knowledge: KnowledgeSection;
  /** 의사결정 섹션 */
  decisions: DecisionsSection;
}
```

### 8. 인덱스 파일 (`types/index.ts`)

```typescript
// Base types
export * from './base';

// Domain types
export * from './agent';
export * from './task';
export * from './decision';
export * from './knowledge';
export * from './message';

// Blackboard types
export * from './blackboard';

// Re-export commonly used types for convenience
export type {
  AgentId,
  TaskId,
  AgendaId,
  SessionId,
  BlackboardState,
  Message,
  MessageType,
  Agenda,
  Opinion,
  Resolution,
} from './blackboard';
```

---

## 파일 구조

```
packages/blackboard/
└── src/
    └── types/
        ├── index.ts          # 메인 export
        ├── base.ts           # 기본 타입 (ID, 공통 인터페이스)
        ├── agent.ts          # 에이전트 관련 타입
        ├── task.ts           # 작업 관련 타입
        ├── decision.ts       # 의사결정 관련 타입
        ├── knowledge.ts      # 지식 관련 타입
        ├── message.ts        # 메시지 관련 타입
        └── blackboard.ts     # Blackboard 상태 스키마
```

---

## 완료 조건

- [x] 모든 타입 파일 작성 완료
- [x] 모든 인터페이스에 JSDoc 주석 포함
- [x] 주요 타입에 `@example` 코드 예시 포함
- [x] `tsc --noEmit` 타입 검사 통과
- [x] 순환 의존성 없음 확인

---

## 참고 문서

- [Blackboard + Actor 설계 문서](../../architecture/blackboard-actor-design.md)
- TypeScript 핸드북 - Utility Types
- TypeScript 핸드북 - JSDoc Reference

---

## 재동기화 판정 (2026-02-13)
- 최종 판정: **✅ 완료**
- 근거 코드:
  - `packages/blackboard/src/types/base.ts`
  - `packages/blackboard/src/types/agent.ts`
  - `packages/blackboard/src/types/task.ts`
  - `packages/blackboard/src/types/decision.ts`
  - `packages/blackboard/src/types/knowledge.ts`
  - `packages/blackboard/src/types/message.ts`
  - `packages/blackboard/src/types/blackboard.ts`
  - `packages/blackboard/src/types/index.ts`
- 검증 결과: 타입 스키마 및 JSDoc이 구현되어 있으며 타입 테스트가 통과합니다.
- 검증 명령:
  - `pnpm --filter @obora-kit/blackboard test` ✅ (14 files, 470 tests passed)
  - `pnpm --filter @obora-kit/blackboard typecheck` ✅
  - `pnpm --filter @obora-kit/blackboard build` ✅

