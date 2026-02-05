# TASK-039: @obora-kit/board - Board State Machine

## 개요
- **상태**: 📋 대기
- 우선순위: P1
- 예상 소요: 6시간
- 담당: 개발자

## 목표
AI 이사회의 상태 전이(FSM)를 구현합니다. idle → discussion → debate → voting → resolved 흐름을 관리하고, 타임아웃 및 예외 상황을 처리합니다.

## 작업 내용

### 1. 핵심 타입 정의

**파일 위치:** `packages/board/src/types/state-machine.ts`

```typescript
// 스펙: [[15-board-system.md]]#state-machine
// === 이사회 상태 ===
export type BoardState =
  | 'idle'            // 대기
  | 'agenda_setting'  // 안건 설정
  | 'discussion'      // 토론
  | 'debate'          // 논쟁 (심화 토론)
  | 'voting'          // 투표
  | 'counting'        // 집계
  | 'resolving'       // 결정 도출
  | 'resolved';       // 완료

// === 상태 전이 이벤트 ===
export type BoardEvent =
  | { type: 'START'; agendaId: string }
  | { type: 'AGENDA_CONFIRMED' }
  | { type: 'ALL_SPOKE' }
  | { type: 'REBUT' }
  | { type: 'EXTEND' }
  | { type: 'CALL_VOTE' }
  | { type: 'VOTES_COLLECTED' }
  | { type: 'CONSENSUS_REACHED'; result: ConsensusResult }
  | { type: 'TIMEOUT' }
  | { type: 'COMPLETE' }
  | { type: 'CANCEL'; reason: string };

// === 상태 컨텍스트 ===
export interface BoardContext {
  sessionId: string;
  currentAgendaId?: string;
  currentVotingSessionId?: string;
  participants: Set<string>;
  presentMembers: Set<string>;
  speakers: SpeakerQueue;
  startedAt?: Date;
  stateEnteredAt: Date;
  stateTimeoutMs?: number;
  totalTimeMs: number;
  history: StateTransition[];
  metadata?: Record<string, unknown>;
}

// === 상태 전이 기록 ===
export interface StateTransition {
  from: BoardState;
  to: BoardState;
  event: BoardEvent;
  timestamp: Date;
  actor?: string;
  reason?: string;
  duration: number;  // ms (이전 상태에서의 체류 시간)
}

// === 발언자 큐 ===
export interface SpeakerQueue {
  current?: Speaker;
  queue: Speaker[];
  history: Speaker[];
}

export interface Speaker {
  participantId: string;
  topic?: string;
  requestedAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  durationMs?: number;
  maxDurationMs: number;
}

// === 상태 설정 ===
export interface StateConfig {
  state: BoardState;
  timeoutMs?: number;           // 상태 타임아웃
  minDurationMs?: number;       // 최소 체류 시간
  maxDurationMs?: number;       // 최대 체류 시간
  allowedEvents: BoardEvent[];  // 허용된 이벤트
  onEnter?: (ctx: BoardContext) => void | Promise<void>;
  onExit?: (ctx: BoardContext) => void | Promise<void>;
  onTimeout?: (ctx: BoardContext) => BoardEvent;
}

// === 전이 규칙 ===
export interface TransitionRule {
  from: BoardState | BoardState[];
  event: BoardEvent;
  to: BoardState;
  guard?: (ctx: BoardContext) => boolean;
  action?: (ctx: BoardContext) => void | Promise<void>;
}
```

### 2. BoardStateMachine 클래스 구현

**파일 위치:** `packages/board/src/state-machine/BoardStateMachine.ts`

```typescript
export interface BoardStateMachineOptions {
  eventBus: EventBus;
  agendaManager: AgendaManager;
  votingManager: VotingManager;
  consensusEngine: ConsensusEngine;
  stateConfigs?: Partial<Record<BoardState, Partial<StateConfig>>>;
  defaultTimeouts?: StateTimeouts;
}

export interface StateTimeouts {
  agendaSetting: number;
  discussion: number;
  debate: number;
  voting: number;
  tallying: number;
}

export class BoardStateMachine {
  private _state: BoardState;
  private _context: BoardContext;
  private _stateConfigs: Map<BoardState, StateConfig>;
  private _transitions: TransitionRule[];
  private _eventBus: EventBus;
  private _timeoutHandle?: NodeJS.Timeout;

  private agendaManager: AgendaManager;
  private votingManager: VotingManager;
  private consensusEngine: ConsensusEngine;

  constructor(options: BoardStateMachineOptions);

  // === Getters ===
  get state(): BoardState;
  get context(): Readonly<BoardContext>;
  get isActive(): boolean;
  get canTransition(): boolean;

  // === 상태 전이 ===
  send(event: BoardEvent, payload?: unknown): BoardState;
  sendAsync(event: BoardEvent, payload?: unknown): Promise<BoardState>;
  canSend(event: BoardEvent): boolean;
  getAvailableEvents(): BoardEvent[];

  // === 세션 관리 ===
  startSession(participants: string[]): void;
  endSession(): void;
  suspendSession(reason?: string): void;
  resumeSession(): void;
  adjournSession(reason?: string): void;

  // === 참가자 관리 ===
  addParticipant(participantId: string): void;
  removeParticipant(participantId: string): void;
  markPresent(participantId: string): void;
  markAbsent(participantId: string): void;
  isQuorumMet(): boolean;

  // === 발언자 관리 ===
  requestToSpeak(participantId: string, topic?: string): number;
  grantSpeaker(participantId: string): void;
  endCurrentSpeaker(): void;
  skipSpeaker(participantId: string): void;
  getSpeakerQueue(): Speaker[];

  // === 타임아웃 관리 ===
  setStateTimeout(timeoutMs: number): void;
  clearStateTimeout(): void;
  getRemainingTime(): number | null;
  extendTime(additionalMs: number): void;

  // === 이력 조회 ===
  getHistory(): StateTransition[];
  getStateDuration(state: BoardState): number;
  getTotalDuration(): number;

  // === 직렬화 ===
  toJSON(): BoardStateMachineSnapshot;
  static fromJSON(
    snapshot: BoardStateMachineSnapshot,
    options: BoardStateMachineOptions
  ): BoardStateMachine;
}

export interface BoardStateMachineSnapshot {
  state: BoardState;
  context: BoardContext;
  createdAt: Date;
}
```

### 3. 상태 전이 규칙 정의

```typescript
// packages/board/src/state-machine/transitions.ts

export const DEFAULT_TRANSITIONS: TransitionRule[] = [
  // === IDLE 상태에서의 전이 ===
  {
    from: 'idle',
    event: { type: 'START' },
    to: 'agenda_setting',
    guard: (ctx) => ctx.presentMembers.size >= 2,
    action: (ctx) => {
      ctx.startedAt = new Date();
    }
  },

  // === AGENDA_SETTING 상태에서의 전이 ===
  {
    from: 'agenda_setting',
    event: { type: 'AGENDA_CONFIRMED' },
    to: 'discussion',
    guard: (ctx) => ctx.currentAgendaId !== undefined
  },
  {
    from: 'agenda_setting',
    event: { type: 'TIMEOUT' },
    to: 'idle',
    action: (ctx) => {
      // 안건 미설정으로 복귀
    }
  },

  // === DISCUSSION 상태에서의 전이 ===
  {
    from: 'discussion',
    event: { type: 'EXTEND' },
    to: 'debate',
    guard: (ctx) => ctx.speakers.history.length >= 1 // 최소 1명 발언 후
  },
  {
    from: 'discussion',
    event: { type: 'CALL_VOTE' },
    to: 'voting',
    guard: (ctx) => {
      // 모든 참가자가 발언 기회를 가졌거나, 충분한 토론 진행
      return ctx.speakers.history.length >= ctx.presentMembers.size * 0.5;
    }
  },
  {
    from: 'discussion',
    event: { type: 'TIMEOUT' },
    to: 'voting'
  },

  // === DEBATE 상태에서의 전이 ===
  {
    from: 'debate',
    event: { type: 'ALL_SPOKE' },
    to: 'discussion'
  },
  {
    from: 'debate',
    event: { type: 'CALL_VOTE' },
    to: 'voting'
  },
  {
    from: 'debate',
    event: { type: 'TIMEOUT' },
    to: 'voting'
  },

  // === VOTING 상태에서의 전이 ===
  {
    from: 'voting',
    event: { type: 'VOTES_COLLECTED' },
    to: 'resolving'
  },
  {
    from: 'voting',
    event: { type: 'TIMEOUT' },
    to: 'resolving'
  },

  // === RESOLVING 상태에서의 전이 ===
  {
    from: 'resolving',
    event: { type: 'CONSENSUS_REACHED' },
    to: 'resolved'
  },

  // === RESOLVED 상태에서의 전이 ===
  {
    from: 'resolved',
    event: { type: 'START' },
    to: 'agenda_setting',
    action: (ctx) => {
      ctx.currentAgendaId = undefined;
      ctx.currentVotingSessionId = undefined;
    }
  },
  {
    from: 'resolved',
    event: { type: 'COMPLETE' },
    to: 'idle'
  },

  // === 예외 상황 전이 ===
  {
    from: ['discussion', 'debate', 'voting'],
    event: { type: 'CANCEL' },
    to: 'idle',
    action: (ctx) => {
      // 취소 처리
    }
  }
];
```

### 4. 상태별 설정

```typescript
// packages/board/src/state-machine/state-configs.ts

export const DEFAULT_STATE_CONFIGS: Record<BoardState, StateConfig> = {
  idle: {
    state: 'idle',
    allowedEvents: [
      { type: 'START' },
      { type: 'COMPLETE' }
    ],
    onEnter: (ctx) => {
      ctx.currentAgendaId = undefined;
      ctx.currentVotingSessionId = undefined;
      ctx.speakers = { queue: [], history: [] };
    }
  },

  agenda_setting: {
    state: 'agenda_setting',
    timeoutMs: 10 * 60 * 1000, // 10분
    allowedEvents: [
      { type: 'AGENDA_CONFIRMED' },
      { type: 'TIMEOUT' },
      { type: 'CANCEL' }
    ],
    onTimeout: () => ({ type: 'CANCEL', reason: 'agenda timeout' })
  },

  discussion: {
    state: 'discussion',
    timeoutMs: 30 * 60 * 1000, // 30분
    minDurationMs: 5 * 60 * 1000, // 최소 5분
    allowedEvents: [
      { type: 'EXTEND' },
      { type: 'CALL_VOTE' },
      { type: 'TIMEOUT' },
      { type: 'CANCEL' }
    ],
    onEnter: (ctx) => {
      // 발언자 큐 초기화
      ctx.speakers = {
        current: undefined,
        queue: [],
        history: []
      };
    },
    onTimeout: () => ({ type: 'CALL_VOTE' })
  },

  debate: {
    state: 'debate',
    timeoutMs: 15 * 60 * 1000, // 15분
    maxDurationMs: 30 * 60 * 1000, // 최대 30분
    allowedEvents: [
      { type: 'ALL_SPOKE' },
      { type: 'CALL_VOTE' },
      { type: 'TIMEOUT' },
      { type: 'CANCEL' }
    ],
    onTimeout: () => ({ type: 'CALL_VOTE' })
  },

  voting: {
    state: 'voting',
    timeoutMs: 5 * 60 * 1000, // 5분
    allowedEvents: [
      { type: 'VOTES_COLLECTED' },
      { type: 'TIMEOUT' },
      { type: 'CANCEL' }
    ],
    onEnter: async (ctx) => {
      // 투표 세션 생성
    },
    onTimeout: () => ({ type: 'VOTES_COLLECTED' })
  },

  resolving: {
    state: 'resolving',
    timeoutMs: 1 * 60 * 1000, // 1분
    allowedEvents: [
      { type: 'CONSENSUS_REACHED' }
    ],
    onEnter: async (ctx) => {
      // 집계 시작
    }
  },

  resolved: {
    state: 'resolved',
    timeoutMs: 5 * 60 * 1000, // 5분
    allowedEvents: [
      { type: 'START' },
      { type: 'COMPLETE' }
    ],
    onTimeout: () => ({ type: 'COMPLETE' })
  }
};
```

### 5. 상태 전이 다이어그램

```
                                    ┌──────────────┐
                                    │    IDLE      │
                                    │   (대기)     │
                                    └──────┬───────┘
                                           │ START
                                           ▼
                                    ┌──────────────┐
                          ┌────────│AGENDA_SETTING│
                          │        │  (안건설정)   │
                          │timeout └──────┬───────┘
                          │               │ AGENDA_CONFIRMED
                          │               ▼
                          │        ┌──────────────┐
                          │   ┌───▶│  DISCUSSION  │◀───┐
                          │   │    │   (토론)     │    │
                          │   │    └──────┬───────┘    │
                          │   │           │            │
                          │   │EXTEND     │CALL_VOTE   │ALL_SPOKE
                          │   │           │            │
                          │   │           │    ┌───────┴───────┐
                          │   │           │    │    DEBATE     │
                          │   │           │    │   (반론)      │
                          │   │           │    └───────────────┘
                          │   │           ▼
                          │   │    ┌──────────────┐
                          │   │    │   VOTING     │
                          │   │    │   (투표)     │
                          │   │    └──────┬───────┘
                          │   │           │ VOTES_COLLECTED
                          │   │           ▼
                          │   │    ┌──────────────┐
                          │   │    │  RESOLVING   │
                          │   │    │   (집계)     │
                          │   │    └──────┬───────┘
                          │   │           │ CONSENSUS_REACHED
                          │   │           ▼
                          │   │    ┌──────────────┐
                          │   │    │  RESOLVED    │──── START
                          │   │    │   (결의)     │
                          │   │    └──────┬───────┘
                          │   │           │ COMPLETE
                          │   │           ▼
                          ▼   │           ▼
                       ┌──────────────────────────┐
                       │         IDLE             │
                       └──────────────────────────┘
```

### 6. 이벤트 발행

| 이벤트 이름 | 설명 | 페이로드 |
|-----------|------|---------|
| `board.session.started` | 세션 시작 | `{ sessionId, participants }` |
| `board.session.ended` | 세션 종료 | `{ sessionId, duration, history }` |
| `board.state.changed` | 상태 변경 | `{ from, to, event, context }` |
| `board.state.entering` | 상태 진입 전 | `{ state, context }` |
| `board.state.entered` | 상태 진입 후 | `{ state, context }` |
| `board.state.exiting` | 상태 이탈 전 | `{ state, context }` |
| `board.timeout.warning` | 타임아웃 임박 | `{ state, remainingMs }` |
| `board.timeout.occurred` | 타임아웃 발생 | `{ state, elapsed }` |
| `board.speaker.changed` | 발언자 변경 | `{ previous, current }` |
| `board.speaker.timeout` | 발언 시간 초과 | `{ speaker }` |

### 7. 테스트 케이스

#### 7.1 기본 상태 전이 테스트

```typescript
describe('BoardStateMachine basic transitions', () => {
  let machine: BoardStateMachine;

  beforeEach(() => {
    machine = createBoardStateMachine();
  });

  it('should start in IDLE state', () => {
    expect(machine.state).toBe('idle');
  });

  it('should transition from IDLE to AGENDA_SETTING on START', () => {
    machine.addParticipant('ceo');
    machine.addParticipant('cto');
    machine.markPresent('ceo');
    machine.markPresent('cto');

    machine.send({ type: 'START', agendaId: 'agenda-1' });

    expect(machine.state).toBe('agenda_setting');
    expect(machine.context.startedAt).toBeDefined();
  });

  it('should not START without quorum', () => {
    machine.addParticipant('ceo');
    machine.markPresent('ceo');

    expect(() => machine.send({ type: 'START', agendaId: 'agenda-1' })).toThrow('GUARD_FAILED');
    expect(machine.state).toBe('idle');
  });

  it('should transition through full flow', () => {
    setupQuorum(machine);

    machine.send({ type: 'START', agendaId: 'agenda-1' });
    expect(machine.state).toBe('agenda_setting');

    machine.context.currentAgendaId = 'agenda-1';
    machine.send({ type: 'AGENDA_CONFIRMED' });
    expect(machine.state).toBe('discussion');

    simulateDiscussion(machine);
    machine.send({ type: 'CALL_VOTE' });
    expect(machine.state).toBe('voting');

    machine.send({ type: 'VOTES_COLLECTED' });
    expect(machine.state).toBe('resolving');

    machine.send({ type: 'CONSENSUS_REACHED', result: { decision: 'approved' } });
    expect(machine.state).toBe('resolved');
  });
});
```

#### 7.2 토론/반론 전이 테스트

```typescript
describe('BoardStateMachine discussion and debate', () => {
  let machine: BoardStateMachine;

  beforeEach(() => {
    machine = createBoardStateMachine();
    setupQuorum(machine);
    machine.send({ type: 'START', agendaId: 'agenda-1' });
    machine.context.currentAgendaId = 'agenda-1';
    machine.send({ type: 'AGENDA_CONFIRMED' });
  });

  it('should allow debate request after at least one speaker', () => {
    // 발언자 없이는 반론 요청 불가
    expect(() => machine.send({ type: 'EXTEND' })).toThrow('GUARD_FAILED');

    // 발언 후 반론 요청 가능
    machine.requestToSpeak('ceo');
    machine.grantSpeaker('ceo');
    machine.endCurrentSpeaker();

    machine.send({ type: 'EXTEND' });
    expect(machine.state).toBe('debate');
  });

  it('should return to discussion after debate ends', () => {
    simulateSpeaker(machine, 'ceo');
    machine.send({ type: 'EXTEND' });

    machine.send({ type: 'ALL_SPOKE' });
    expect(machine.state).toBe('discussion');
  });

  it('should allow direct vote from debate', () => {
    simulateSpeaker(machine, 'ceo');
    machine.send({ type: 'EXTEND' });

    machine.send({ type: 'CALL_VOTE' });
    expect(machine.state).toBe('voting');
  });
});
```

#### 7.3 타임아웃 테스트

```typescript
describe('BoardStateMachine timeouts', () => {
  let machine: BoardStateMachine;

  beforeEach(() => {
    vi.useFakeTimers();
    machine = createBoardStateMachine({
      defaultTimeouts: {
        agendaSetting: 1000,
        discussion: 2000,
        debate: 1500,
        voting: 1000,
        tallying: 500
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should timeout from AGENDA_SETTING to IDLE', () => {
    setupQuorum(machine);
    machine.send({ type: 'START', agendaId: 'agenda-1' });

    vi.advanceTimersByTime(1001);

    expect(machine.state).toBe('idle');
  });

  it('should timeout from DISCUSSION to VOTING', () => {
    setupQuorum(machine);
    machine.send({ type: 'START', agendaId: 'agenda-1' });
    machine.context.currentAgendaId = 'agenda-1';
    machine.send({ type: 'AGENDA_CONFIRMED' });

    vi.advanceTimersByTime(2001);

    expect(machine.state).toBe('voting');
  });

  it('should emit timeout warning before timeout', () => {
    const eventBus = createMockEventBus();
    machine = createBoardStateMachine({ eventBus });
    setupQuorum(machine);
    machine.send({ type: 'START', agendaId: 'agenda-1' });

    // 90% 시점에서 경고
    vi.advanceTimersByTime(900);

    expect(eventBus.publish).toHaveBeenCalledWith(
      'board.timeout.warning',
      expect.objectContaining({
        state: 'agenda_setting'
      })
    );
  });

  it('should extend time', () => {
    setupQuorum(machine);
    machine.send({ type: 'START', agendaId: 'agenda-1' });
    machine.context.currentAgendaId = 'agenda-1';
    machine.send({ type: 'AGENDA_CONFIRMED' });

    // 1.5초 후 시간 연장
    vi.advanceTimersByTime(1500);
    machine.extendTime(2000);

    // 원래 타임아웃 시점 (2초)
    vi.advanceTimersByTime(600);
    expect(machine.state).toBe('discussion');

    // 연장된 시간 후
    vi.advanceTimersByTime(2000);
    expect(machine.state).toBe('voting');
  });

  it('should return remaining time', () => {
    setupQuorum(machine);
    machine.send({ type: 'START', agendaId: 'agenda-1' });
    machine.context.currentAgendaId = 'agenda-1';
    machine.send({ type: 'AGENDA_CONFIRMED' });

    vi.advanceTimersByTime(1000);
    const remaining = machine.getRemainingTime();

    expect(remaining).toBe(1000);
  });
});
```

#### 7.4 발언자 관리 테스트

```typescript
describe('BoardStateMachine speaker management', () => {
  let machine: BoardStateMachine;

  beforeEach(() => {
    machine = createBoardStateMachine();
    setupQuorum(machine);
    goToDiscussion(machine);
  });

  it('should queue speaker requests', () => {
    const pos1 = machine.requestToSpeak('ceo', 'ROI 분석');
    const pos2 = machine.requestToSpeak('cto', '기술 실현 가능성');
    const pos3 = machine.requestToSpeak('cfo', '예산 검토');

    expect(pos1).toBe(1);
    expect(pos2).toBe(2);
    expect(pos3).toBe(3);

    const queue = machine.getSpeakerQueue();
    expect(queue).toHaveLength(3);
  });

  it('should grant speaker from queue', () => {
    machine.requestToSpeak('ceo');
    machine.requestToSpeak('cto');

    machine.grantSpeaker('ceo');

    expect(machine.context.speakers.current?.participantId).toBe('ceo');
    expect(machine.getSpeakerQueue()).toHaveLength(1);
  });

  it('should record speaker history', () => {
    machine.requestToSpeak('ceo');
    machine.grantSpeaker('ceo');
    machine.endCurrentSpeaker();

    expect(machine.context.speakers.history).toHaveLength(1);
    expect(machine.context.speakers.history[0].participantId).toBe('ceo');
    expect(machine.context.speakers.history[0].endedAt).toBeDefined();
  });

  it('should skip speaker', () => {
    machine.requestToSpeak('ceo');
    machine.requestToSpeak('cto');
    machine.requestToSpeak('cfo');

    machine.skipSpeaker('cto');

    const queue = machine.getSpeakerQueue();
    expect(queue.map(s => s.participantId)).toEqual(['ceo', 'cfo']);
  });
});
```

#### 7.5 정족수 관리 테스트

```typescript
describe('BoardStateMachine quorum management', () => {
  let machine: BoardStateMachine;

  beforeEach(() => {
    machine = createBoardStateMachine();
    machine.addParticipant('ceo');
    machine.addParticipant('cto');
    machine.addParticipant('cfo');
  });

  it('should calculate quorum correctly', () => {
    machine.markPresent('ceo');
    expect(machine.isQuorumMet()).toBe(false);

    machine.markPresent('cto');
    expect(machine.isQuorumMet()).toBe(true);
  });

  it('should emit quorum lost event', () => {
    const eventBus = createMockEventBus();
    machine = createBoardStateMachine({ eventBus });
    setupFullQuorum(machine);
    goToDiscussion(machine);

    machine.markAbsent('cto');
    machine.markAbsent('cfo');

    expect(eventBus.publish).toHaveBeenCalledWith(
      'board.quorum.lost',
      expect.objectContaining({
        required: 2,
        actual: 1
      })
    );
  });
});
```

#### 7.6 세션 중단/재개 테스트

```typescript
describe('BoardStateMachine suspend and resume', () => {
  let machine: BoardStateMachine;

  beforeEach(() => {
    machine = createBoardStateMachine();
    setupQuorum(machine);
    goToDiscussion(machine);
  });

  it('should suspend session', () => {
    machine.suspendSession('휴식');

    expect(machine.state).toBe('idle');
  });

  it('should adjourn session', () => {
    machine.adjournSession('오늘 회의 종료');

    expect(machine.state).toBe('idle');
    expect(machine.isActive).toBe(false);
  });
});
```

#### 7.7 이력 관리 테스트

```typescript
describe('BoardStateMachine history', () => {
  let machine: BoardStateMachine;

  beforeEach(() => {
    machine = createBoardStateMachine();
    setupQuorum(machine);
  });

  it('should record state transitions', () => {
    machine.send({ type: 'START', agendaId: 'agenda-1' });
    machine.context.currentAgendaId = 'agenda-1';
    machine.send({ type: 'AGENDA_CONFIRMED' });

    const history = machine.getHistory();

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      from: 'idle',
      to: 'agenda_setting',
      event: { type: 'START' }
    });
  });

  it('should calculate state duration', () => {
    vi.useFakeTimers();

    machine.send({ type: 'START', agendaId: 'agenda-1' });
    vi.advanceTimersByTime(5000);
    machine.context.currentAgendaId = 'agenda-1';
    machine.send({ type: 'AGENDA_CONFIRMED' });

    const duration = machine.getStateDuration('agenda_setting');
    expect(duration).toBe(5000);

    vi.useRealTimers();
  });

  it('should calculate total session duration', () => {
    vi.useFakeTimers();

    machine.send({ type: 'START', agendaId: 'agenda-1' });
    vi.advanceTimersByTime(5000);
    machine.context.currentAgendaId = 'agenda-1';
    machine.send({ type: 'AGENDA_CONFIRMED' });
    vi.advanceTimersByTime(10000);

    const total = machine.getTotalDuration();
    expect(total).toBe(15000);

    vi.useRealTimers();
  });
});
```

#### 7.8 직렬화/역직렬화 테스트

```typescript
describe('BoardStateMachine serialization', () => {
  it('should serialize to JSON', () => {
    const machine = createBoardStateMachine();
    setupQuorum(machine);
    machine.send({ type: 'START', agendaId: 'agenda-1' });

    const snapshot = machine.toJSON();

    expect(snapshot.state).toBe('agenda_setting');
    expect(snapshot.context.sessionId).toBeDefined();
  });

  it('should restore from JSON', () => {
    const original = createBoardStateMachine();
    setupQuorum(original);
    original.send({ type: 'START', agendaId: 'agenda-1' });
    original.context.currentAgendaId = 'agenda-1';
    original.send({ type: 'AGENDA_CONFIRMED' });

    const snapshot = original.toJSON();
    const restored = BoardStateMachine.fromJSON(snapshot, {
      eventBus: createMockEventBus(),
      agendaManager: createMockAgendaManager(),
      votingManager: createMockVotingManager(),
      consensusEngine: createMockConsensusEngine()
    });

    expect(restored.state).toBe(original.state);
    expect(restored.context.currentAgendaId).toBe('agenda-1');
  });
});
```

### 8. 파일 구조

```
packages/board/
├── src/
│   ├── state-machine/
│   │   ├── BoardStateMachine.ts
│   │   ├── transitions.ts
│   │   ├── state-configs.ts
│   │   ├── guards.ts
│   │   ├── actions.ts
│   │   └── index.ts
│   └── types/
│       └── state-machine.ts
└── test/
    └── state-machine/
        ├── BoardStateMachine.test.ts
        ├── transitions.test.ts
        ├── timeouts.test.ts
        └── speaker.test.ts
```

### 9. 완료 조건

- [ ] BoardStateMachine 클래스 구현 완료
- [ ] 모든 상태 전이 규칙 구현 완료
- [ ] 상태별 설정 구현 완료
- [ ] 타임아웃 처리 구현 완료
- [ ] 발언자 관리 구현 완료
- [ ] 정족수 관리 구현 완료
- [ ] 세션 중단/재개 구현 완료
- [ ] 직렬화/역직렬화 구현 완료
- [ ] **BoardController 클래스 구현 완료** (스펙 추가)
- [ ] **runMeeting() 메서드 구현 완료** (스펙 추가)
- [ ] 이벤트 발행 구현 완료
- [ ] 테스트 커버리지 80% 이상
- [ ] pnpm test 성공

### 10. 의존성

- TASK-038 (ConsensusEngine)
- TASK-037 (VotingManager)
- TASK-036 (AgendaManager)
- @obora-kit/core 패키지 (EventBus)

### 11. BoardController 추가 (스펙)

스펙에 따라 BoardController를 추가합니다.

```typescript
// packages/board/src/controller/BoardController.ts

export interface IBoardController {
  // 세션 관리
  startSession(config?: SessionConfig): Promise<BoardSession>;
  endSession(sessionId: string): Promise<void>;
  getCurrentSession(): BoardSession | null;

  // 안건 처리
  processAgenda(agenda: Agenda): Promise<Resolution>;

  // 전체 흐름 실행
  runMeeting(agenda: Agenda): AsyncIterable<MeetingEvent>;

  // 상태 조회
  getStatus(): BoardStatus;
}

export class BoardController implements IBoardController {
  private stateMachine: IBoardStateMachine;
  private agendaManager: IAgendaManager;
  private votingManager: IVotingManager;
  private consensusManager: IConsensusManager;
  private blackboard: IBlackboard;

  private currentSession: BoardSession | null = null;

  constructor(config: BoardConfig);

  async startSession(config?: SessionConfig): Promise<BoardSession>;
  async endSession(sessionId: string): Promise<void>;
  getCurrentSession(): BoardSession | null;
  async processAgenda(agenda: Agenda): Promise<Resolution>;
  async *runMeeting(agenda: Agenda): AsyncIterable<MeetingEvent>;
  getStatus(): BoardStatus;
}

export interface BoardConfig {
  stateMachine: IBoardStateMachine;
  agendaManager: IAgendaManager;
  votingManager: IVotingManager;
  consensusManager: IConsensusManager;
  blackboard: IBlackboard;
}

export interface SessionConfig {
  participants: string[];
  coordinator: string;
  timeLimit?: number;           // ms
  rules?: MeetingRules;
}

export interface MeetingRules {
  speakingTimeLimit?: number;   // 발언 시간 제한 (ms)
  maxRebuttals?: number;        // 최대 반박 횟수
  votingTimeLimit?: number;     // 투표 시간 제한 (ms)
  allowLateJoin?: boolean;
}

export interface BoardStatus {
  sessionId: string | null;
  state: BoardState;
  participants: string[];
  currentAgenda: Agenda | null;
  uptime: number;               // ms
}

export type MeetingEvent =
  | { type: 'session_started'; session: BoardSession }
  | { type: 'agenda_presented'; agenda: Agenda }
  | { type: 'discussion_started' }
  | { type: 'opinion_submitted'; opinion: Opinion }
  | { type: 'debate_started' }
  | { type: 'rebuttal'; agentId: string; content: string }
  | { type: 'voting_started'; session: VotingSession }
  | { type: 'vote_cast'; vote: Vote }
  | { type: 'voting_ended'; result: VotingResult }
  | { type: 'consensus_reached'; consensus: ConsensusResult }
  | { type: 'resolution_made'; resolution: Resolution }
  | { type: 'session_ended' }
  | { type: 'error'; error: BoardError };
```

### 12. 참고 문서

- [Blackboard Actor Design](../../architecture/blackboard-actor-design.md)
- [상태 전이 다이어그램](../../architecture/blackboard-actor-design.md#43-상태-전이-다이어그램)
