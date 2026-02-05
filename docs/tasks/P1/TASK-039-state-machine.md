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
// === 이사회 상태 ===
export enum BoardState {
  IDLE = 'idle',                 // 대기 상태
  AGENDA_SETTING = 'agenda_setting', // 안건 설정 중
  DISCUSSION = 'discussion',     // 토론 진행 중
  DEBATE = 'debate',             // 반론/심화 토론
  VOTING = 'voting',             // 투표 진행 중
  TALLYING = 'tallying',         // 집계 중
  RESOLVED = 'resolved',         // 결의 완료
  SUSPENDED = 'suspended',       // 일시 중단
  ADJOURNED = 'adjourned'        // 휴회
}

// === 상태 전이 이벤트 ===
export enum BoardEvent {
  // 진행 이벤트
  START = 'START',
  SUBMIT_AGENDA = 'SUBMIT_AGENDA',
  CONFIRM_AGENDA = 'CONFIRM_AGENDA',
  BEGIN_DISCUSSION = 'BEGIN_DISCUSSION',
  REQUEST_DEBATE = 'REQUEST_DEBATE',
  END_DEBATE = 'END_DEBATE',
  CALL_VOTE = 'CALL_VOTE',
  COMPLETE_VOTING = 'COMPLETE_VOTING',
  ANNOUNCE_RESULT = 'ANNOUNCE_RESULT',
  
  // 제어 이벤트
  SUSPEND = 'SUSPEND',
  RESUME = 'RESUME',
  ADJOURN = 'ADJOURN',
  RECESS = 'RECESS',
  RESET = 'RESET',
  
  // 타임아웃 이벤트
  TIMEOUT = 'TIMEOUT',
  DEADLINE_REACHED = 'DEADLINE_REACHED',
  
  // 예외 이벤트
  QUORUM_LOST = 'QUORUM_LOST',
  EMERGENCY_STOP = 'EMERGENCY_STOP',
  ESCALATE = 'ESCALATE'
}

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
    from: BoardState.IDLE,
    event: BoardEvent.START,
    to: BoardState.AGENDA_SETTING,
    guard: (ctx) => ctx.presentMembers.size >= 2,
    action: (ctx) => {
      ctx.startedAt = new Date();
    }
  },
  
  // === AGENDA_SETTING 상태에서의 전이 ===
  {
    from: BoardState.AGENDA_SETTING,
    event: BoardEvent.CONFIRM_AGENDA,
    to: BoardState.DISCUSSION,
    guard: (ctx) => ctx.currentAgendaId !== undefined
  },
  {
    from: BoardState.AGENDA_SETTING,
    event: BoardEvent.TIMEOUT,
    to: BoardState.ADJOURNED,
    action: (ctx) => {
      // 안건 미설정으로 휴회
    }
  },
  
  // === DISCUSSION 상태에서의 전이 ===
  {
    from: BoardState.DISCUSSION,
    event: BoardEvent.REQUEST_DEBATE,
    to: BoardState.DEBATE,
    guard: (ctx) => ctx.speakers.history.length >= 1 // 최소 1명 발언 후
  },
  {
    from: BoardState.DISCUSSION,
    event: BoardEvent.CALL_VOTE,
    to: BoardState.VOTING,
    guard: (ctx) => {
      // 모든 참가자가 발언 기회를 가졌거나, 충분한 토론 진행
      return ctx.speakers.history.length >= ctx.presentMembers.size * 0.5;
    }
  },
  {
    from: BoardState.DISCUSSION,
    event: BoardEvent.TIMEOUT,
    to: BoardState.VOTING
  },
  
  // === DEBATE 상태에서의 전이 ===
  {
    from: BoardState.DEBATE,
    event: BoardEvent.END_DEBATE,
    to: BoardState.DISCUSSION
  },
  {
    from: BoardState.DEBATE,
    event: BoardEvent.CALL_VOTE,
    to: BoardState.VOTING
  },
  {
    from: BoardState.DEBATE,
    event: BoardEvent.TIMEOUT,
    to: BoardState.VOTING
  },
  
  // === VOTING 상태에서의 전이 ===
  {
    from: BoardState.VOTING,
    event: BoardEvent.COMPLETE_VOTING,
    to: BoardState.TALLYING
  },
  {
    from: BoardState.VOTING,
    event: BoardEvent.TIMEOUT,
    to: BoardState.TALLYING
  },
  
  // === TALLYING 상태에서의 전이 ===
  {
    from: BoardState.TALLYING,
    event: BoardEvent.ANNOUNCE_RESULT,
    to: BoardState.RESOLVED
  },
  
  // === RESOLVED 상태에서의 전이 ===
  {
    from: BoardState.RESOLVED,
    event: BoardEvent.SUBMIT_AGENDA,
    to: BoardState.AGENDA_SETTING,
    action: (ctx) => {
      ctx.currentAgendaId = undefined;
      ctx.currentVotingSessionId = undefined;
    }
  },
  {
    from: BoardState.RESOLVED,
    event: BoardEvent.ADJOURN,
    to: BoardState.ADJOURNED
  },
  {
    from: BoardState.RESOLVED,
    event: BoardEvent.RESET,
    to: BoardState.IDLE
  },
  
  // === 공통 전이 (여러 상태에서 가능) ===
  {
    from: [
      BoardState.DISCUSSION,
      BoardState.DEBATE,
      BoardState.VOTING
    ],
    event: BoardEvent.SUSPEND,
    to: BoardState.SUSPENDED
  },
  {
    from: BoardState.SUSPENDED,
    event: BoardEvent.RESUME,
    to: BoardState.DISCUSSION, // 이전 상태로 복귀 필요
    action: (ctx) => {
      // 이전 상태 복구 로직
    }
  },
  {
    from: [
      BoardState.IDLE,
      BoardState.DISCUSSION,
      BoardState.DEBATE,
      BoardState.RESOLVED,
      BoardState.SUSPENDED
    ],
    event: BoardEvent.ADJOURN,
    to: BoardState.ADJOURNED
  },
  
  // === 예외 상황 전이 ===
  {
    from: [
      BoardState.DISCUSSION,
      BoardState.DEBATE,
      BoardState.VOTING
    ],
    event: BoardEvent.QUORUM_LOST,
    to: BoardState.SUSPENDED,
    action: (ctx) => {
      // 정족수 미달 처리
    }
  },
  {
    from: [
      BoardState.AGENDA_SETTING,
      BoardState.DISCUSSION,
      BoardState.DEBATE,
      BoardState.VOTING,
      BoardState.TALLYING
    ],
    event: BoardEvent.EMERGENCY_STOP,
    to: BoardState.SUSPENDED
  }
];
```

### 4. 상태별 설정

```typescript
// packages/board/src/state-machine/state-configs.ts

export const DEFAULT_STATE_CONFIGS: Record<BoardState, StateConfig> = {
  [BoardState.IDLE]: {
    state: BoardState.IDLE,
    allowedEvents: [
      BoardEvent.START,
      BoardEvent.SUBMIT_AGENDA
    ],
    onEnter: (ctx) => {
      ctx.currentAgendaId = undefined;
      ctx.currentVotingSessionId = undefined;
      ctx.speakers = { queue: [], history: [] };
    }
  },
  
  [BoardState.AGENDA_SETTING]: {
    state: BoardState.AGENDA_SETTING,
    timeoutMs: 10 * 60 * 1000, // 10분
    allowedEvents: [
      BoardEvent.CONFIRM_AGENDA,
      BoardEvent.TIMEOUT,
      BoardEvent.SUSPEND,
      BoardEvent.ADJOURN
    ],
    onTimeout: () => BoardEvent.ADJOURN
  },
  
  [BoardState.DISCUSSION]: {
    state: BoardState.DISCUSSION,
    timeoutMs: 30 * 60 * 1000, // 30분
    minDurationMs: 5 * 60 * 1000, // 최소 5분
    allowedEvents: [
      BoardEvent.REQUEST_DEBATE,
      BoardEvent.CALL_VOTE,
      BoardEvent.TIMEOUT,
      BoardEvent.SUSPEND,
      BoardEvent.QUORUM_LOST
    ],
    onEnter: (ctx) => {
      // 발언자 큐 초기화
      ctx.speakers = {
        current: undefined,
        queue: [],
        history: []
      };
    },
    onTimeout: () => BoardEvent.CALL_VOTE
  },
  
  [BoardState.DEBATE]: {
    state: BoardState.DEBATE,
    timeoutMs: 15 * 60 * 1000, // 15분
    maxDurationMs: 30 * 60 * 1000, // 최대 30분
    allowedEvents: [
      BoardEvent.END_DEBATE,
      BoardEvent.CALL_VOTE,
      BoardEvent.TIMEOUT,
      BoardEvent.SUSPEND
    ],
    onTimeout: () => BoardEvent.CALL_VOTE
  },
  
  [BoardState.VOTING]: {
    state: BoardState.VOTING,
    timeoutMs: 5 * 60 * 1000, // 5분
    allowedEvents: [
      BoardEvent.COMPLETE_VOTING,
      BoardEvent.TIMEOUT,
      BoardEvent.EMERGENCY_STOP
    ],
    onEnter: async (ctx) => {
      // 투표 세션 생성
    },
    onTimeout: () => BoardEvent.COMPLETE_VOTING
  },
  
  [BoardState.TALLYING]: {
    state: BoardState.TALLYING,
    timeoutMs: 1 * 60 * 1000, // 1분
    allowedEvents: [
      BoardEvent.ANNOUNCE_RESULT
    ],
    onEnter: async (ctx) => {
      // 집계 시작
    }
  },
  
  [BoardState.RESOLVED]: {
    state: BoardState.RESOLVED,
    timeoutMs: 5 * 60 * 1000, // 5분
    allowedEvents: [
      BoardEvent.SUBMIT_AGENDA,
      BoardEvent.ADJOURN,
      BoardEvent.RESET
    ],
    onTimeout: () => BoardEvent.ADJOURN
  },
  
  [BoardState.SUSPENDED]: {
    state: BoardState.SUSPENDED,
    timeoutMs: 60 * 60 * 1000, // 1시간
    allowedEvents: [
      BoardEvent.RESUME,
      BoardEvent.ADJOURN
    ],
    onTimeout: () => BoardEvent.ADJOURN
  },
  
  [BoardState.ADJOURNED]: {
    state: BoardState.ADJOURNED,
    allowedEvents: [
      BoardEvent.RESET
    ],
    onEnter: (ctx) => {
      // 세션 종료 처리
    }
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
                          │               │ CONFIRM_AGENDA
                          │               ▼
                          │        ┌──────────────┐
                          │   ┌───▶│  DISCUSSION  │◀───┐
                          │   │    │   (토론)     │    │
                          │   │    └──────┬───────┘    │
                          │   │           │            │
                          │   │REQUEST    │CALL_VOTE   │END_DEBATE
                          │   │DEBATE     │            │
                          │   │           │    ┌───────┴───────┐
                          │   │           │    │    DEBATE     │
                          │   │           │    │   (반론)      │
                          │   │           │    └───────────────┘
                          │   │           ▼
                          │   │    ┌──────────────┐
                          │   │    │   VOTING     │
                          │   │    │   (투표)     │
                          │   │    └──────┬───────┘
                          │   │           │ COMPLETE_VOTING
                          │   │           ▼
                          │   │    ┌──────────────┐
                          │   │    │  TALLYING    │
                          │   │    │   (집계)     │
                          │   │    └──────┬───────┘
                          │   │           │ ANNOUNCE_RESULT
                          │   │           ▼
                          │   │    ┌──────────────┐
                          │   │    │  RESOLVED    │────SUBMIT_AGENDA
                          │   │    │   (결의)     │
                          │   │    └──────┬───────┘
                          │   │           │ ADJOURN
                          ▼   │           ▼
                       ┌──────────────────────────┐
                       │       ADJOURNED          │
                       │        (휴회)            │
                       └──────────────────────────┘
                       
예외 상태:
┌──────────────┐
│  SUSPENDED   │◀── SUSPEND (토론/반론/투표 중)
│  (일시중단)   │
│              │──── RESUME ──▶ 이전 상태
└──────────────┘
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
| `board.quorum.lost` | 정족수 미달 | `{ required, actual }` |
| `board.quorum.restored` | 정족수 회복 | `{ required, actual }` |
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
    expect(machine.state).toBe(BoardState.IDLE);
  });

  it('should transition from IDLE to AGENDA_SETTING on START', () => {
    machine.addParticipant('ceo');
    machine.addParticipant('cto');
    machine.markPresent('ceo');
    machine.markPresent('cto');

    machine.send(BoardEvent.START);

    expect(machine.state).toBe(BoardState.AGENDA_SETTING);
    expect(machine.context.startedAt).toBeDefined();
  });

  it('should not START without quorum', () => {
    machine.addParticipant('ceo');
    machine.markPresent('ceo');

    expect(() => machine.send(BoardEvent.START)).toThrow('GUARD_FAILED');
    expect(machine.state).toBe(BoardState.IDLE);
  });

  it('should transition through full flow', () => {
    setupQuorum(machine);
    
    machine.send(BoardEvent.START);
    expect(machine.state).toBe(BoardState.AGENDA_SETTING);
    
    machine.context.currentAgendaId = 'agenda-1';
    machine.send(BoardEvent.CONFIRM_AGENDA);
    expect(machine.state).toBe(BoardState.DISCUSSION);
    
    simulateDiscussion(machine);
    machine.send(BoardEvent.CALL_VOTE);
    expect(machine.state).toBe(BoardState.VOTING);
    
    machine.send(BoardEvent.COMPLETE_VOTING);
    expect(machine.state).toBe(BoardState.TALLYING);
    
    machine.send(BoardEvent.ANNOUNCE_RESULT);
    expect(machine.state).toBe(BoardState.RESOLVED);
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
    machine.send(BoardEvent.START);
    machine.context.currentAgendaId = 'agenda-1';
    machine.send(BoardEvent.CONFIRM_AGENDA);
  });

  it('should allow debate request after at least one speaker', () => {
    // 발언자 없이는 반론 요청 불가
    expect(() => machine.send(BoardEvent.REQUEST_DEBATE)).toThrow('GUARD_FAILED');

    // 발언 후 반론 요청 가능
    machine.requestToSpeak('ceo');
    machine.grantSpeaker('ceo');
    machine.endCurrentSpeaker();

    machine.send(BoardEvent.REQUEST_DEBATE);
    expect(machine.state).toBe(BoardState.DEBATE);
  });

  it('should return to discussion after debate ends', () => {
    simulateSpeaker(machine, 'ceo');
    machine.send(BoardEvent.REQUEST_DEBATE);
    
    machine.send(BoardEvent.END_DEBATE);
    expect(machine.state).toBe(BoardState.DISCUSSION);
  });

  it('should allow direct vote from debate', () => {
    simulateSpeaker(machine, 'ceo');
    machine.send(BoardEvent.REQUEST_DEBATE);
    
    machine.send(BoardEvent.CALL_VOTE);
    expect(machine.state).toBe(BoardState.VOTING);
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

  it('should timeout from AGENDA_SETTING to ADJOURNED', () => {
    setupQuorum(machine);
    machine.send(BoardEvent.START);

    vi.advanceTimersByTime(1001);

    expect(machine.state).toBe(BoardState.ADJOURNED);
  });

  it('should timeout from DISCUSSION to VOTING', () => {
    setupQuorum(machine);
    machine.send(BoardEvent.START);
    machine.context.currentAgendaId = 'agenda-1';
    machine.send(BoardEvent.CONFIRM_AGENDA);

    vi.advanceTimersByTime(2001);

    expect(machine.state).toBe(BoardState.VOTING);
  });

  it('should emit timeout warning before timeout', () => {
    const eventBus = createMockEventBus();
    machine = createBoardStateMachine({ eventBus });
    setupQuorum(machine);
    machine.send(BoardEvent.START);

    // 90% 시점에서 경고
    vi.advanceTimersByTime(900);

    expect(eventBus.publish).toHaveBeenCalledWith(
      'board.timeout.warning',
      expect.objectContaining({
        state: BoardState.AGENDA_SETTING
      })
    );
  });

  it('should extend time', () => {
    setupQuorum(machine);
    machine.send(BoardEvent.START);
    machine.context.currentAgendaId = 'agenda-1';
    machine.send(BoardEvent.CONFIRM_AGENDA);

    // 1.5초 후 시간 연장
    vi.advanceTimersByTime(1500);
    machine.extendTime(2000);

    // 원래 타임아웃 시점 (2초)
    vi.advanceTimersByTime(600);
    expect(machine.state).toBe(BoardState.DISCUSSION);

    // 연장된 시간 후
    vi.advanceTimersByTime(2000);
    expect(machine.state).toBe(BoardState.VOTING);
  });

  it('should return remaining time', () => {
    setupQuorum(machine);
    machine.send(BoardEvent.START);
    machine.context.currentAgendaId = 'agenda-1';
    machine.send(BoardEvent.CONFIRM_AGENDA);

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

  it('should suspend on quorum lost during discussion', () => {
    machine.markPresent('ceo');
    machine.markPresent('cto');
    machine.markPresent('cfo');
    goToDiscussion(machine);

    machine.markAbsent('cto');
    machine.markAbsent('cfo');
    // 정족수 미달 감지
    machine.send(BoardEvent.QUORUM_LOST);

    expect(machine.state).toBe(BoardState.SUSPENDED);
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

    expect(machine.state).toBe(BoardState.SUSPENDED);
  });

  it('should resume to previous state', () => {
    const prevState = machine.state;
    machine.suspendSession();
    machine.resumeSession();

    // 토론 상태로 복귀 (구현에 따라 다를 수 있음)
    expect(machine.state).toBe(BoardState.DISCUSSION);
  });

  it('should adjourn session', () => {
    machine.adjournSession('오늘 회의 종료');

    expect(machine.state).toBe(BoardState.ADJOURNED);
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
    machine.send(BoardEvent.START);
    machine.context.currentAgendaId = 'agenda-1';
    machine.send(BoardEvent.CONFIRM_AGENDA);

    const history = machine.getHistory();

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      from: BoardState.IDLE,
      to: BoardState.AGENDA_SETTING,
      event: BoardEvent.START
    });
  });

  it('should calculate state duration', () => {
    vi.useFakeTimers();

    machine.send(BoardEvent.START);
    vi.advanceTimersByTime(5000);
    machine.context.currentAgendaId = 'agenda-1';
    machine.send(BoardEvent.CONFIRM_AGENDA);

    const duration = machine.getStateDuration(BoardState.AGENDA_SETTING);
    expect(duration).toBe(5000);

    vi.useRealTimers();
  });

  it('should calculate total session duration', () => {
    vi.useFakeTimers();

    machine.send(BoardEvent.START);
    vi.advanceTimersByTime(5000);
    machine.context.currentAgendaId = 'agenda-1';
    machine.send(BoardEvent.CONFIRM_AGENDA);
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
    machine.send(BoardEvent.START);

    const snapshot = machine.toJSON();

    expect(snapshot.state).toBe(BoardState.AGENDA_SETTING);
    expect(snapshot.context.sessionId).toBeDefined();
  });

  it('should restore from JSON', () => {
    const original = createBoardStateMachine();
    setupQuorum(original);
    original.send(BoardEvent.START);
    original.context.currentAgendaId = 'agenda-1';
    original.send(BoardEvent.CONFIRM_AGENDA);

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
- [ ] 이벤트 발행 구현 완료
- [ ] 테스트 커버리지 80% 이상
- [ ] pnpm test 성공

### 10. 의존성

- TASK-038 (ConsensusEngine)
- TASK-037 (VotingManager)
- TASK-036 (AgendaManager)
- @obora-kit/core 패키지 (EventBus)

### 11. 참고 문서

- [Blackboard Actor Design](../../architecture/blackboard-actor-design.md)
- [상태 전이 다이어그램](../../architecture/blackboard-actor-design.md#43-상태-전이-다이어그램)
