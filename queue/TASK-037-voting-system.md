# TASK-037: @obora-kit/board - Voting System

> **참고**: `DecisionsSection.voting` 필드와 `VotingSession` 기본 인터페이스는 TASK-031에서 이미 추가됨. 이 태스크에서는 VotingSession을 확장하고 투표 집계 로직을 구현.

## 개요
- **상태**: 📋 대기
- 우선순위: P1
- 예상 소요: 8시간
- 담당: 개발자

## 목표
AI 이사회의 투표 시스템을 구현합니다. 다수결, 만장일치, 가중치 투표 방식을 지원하며, 정족수 체크와 결과 집계 기능을 제공합니다.

## 작업 내용

### 1. 핵심 타입 정의

**파일 위치:** `packages/board/src/types/voting.ts`

```typescript
// 스펙: [[15-board-system.md]]#voting-시스템
// === 투표 방식 ===
export type VotingMethod =
  | 'majority'    // 과반수
  | 'supermajority' // 2/3 이상
  | 'unanimous'   // 만장일치
  | 'weighted'    // 가중치 투표
  | 'ranked';     // 순위 투표 (선호도)

// === 투표 선택지 ===
export type VoteValue =
  | 'approve'     // 찬성
  | 'reject'      // 반대
  | 'abstain'     // 기권
  | 'conditional'; // 조건부 찬성

// === 투표 세션 상태 ===
export type VotingSessionStatus =
  | 'waiting'     // 대기 중 (아직 시작 안됨)
  | 'collecting'  // 의견 수집 중
  | 'voting'      // 투표 진행 중
  | 'counting'    // 집계 중
  | 'completed'   // 완료
  | 'cancelled';  // 취소됨

// === 투표 결과 ===
export type VotingDecision =
  | 'approved'              // 승인됨
  | 'rejected'              // 거부됨
  | 'deferred'              // 연기됨
  | 'no_quorum'             // 정족수 미달
  | 'tie'                   // 동점
  | 'cancelled';            // 취소됨

// === 개별 투표 ===
export interface Vote {
  id: string;
  sessionId: string;
  agentId: string;          // 투표자 ID (스펙: agentId)
  value: VoteValue;         // 선택 (스펙: value)
  weight: number;
  rankings?: string[];      // 순위 투표 시
  comment?: string;
  timestamp: Date;
  changedAt?: Date;         // 투표 변경 시
}

// === 투표 세션 ===
export interface VotingSession {
  id: string;
  agendaId: string;          // 연결된 안건 ID
  status: VotingSessionStatus;
  config: VotingConfig;

  // 참가자
  eligibleVoters: string[]; // 투표 가능자 목록

  // 시간
  startedAt: Date;
  endsAt?: Date;
  endedAt?: Date;

  // 현재 상태
  votes: Map<string, Vote>;
  opinions: Map<string, Opinion>;  // Opinion 추가
}

// === VotingConfig (스펙 추가) ===
export interface VotingConfig {
  method: VotingMethod;
  quorum: number;
  duration?: number;        // ms
  allowAbstain?: boolean;
  allowChangeVote?: boolean;
  secret?: boolean;         // 비밀 투표
  weights?: Map<string, number>; // 가중치 투표 시
}

// === 집계 결과 ===
export interface VotingSessionResult {
  sessionId: string;
  result: VotingResult;
  summary: VoteSummary;
  weightedSummary?: WeightedVoteSummary;
  quorumMet: boolean;
  quorumDetails: QuorumDetails;
  conditions?: ConditionSummary[];
  decidedAt: Date;
}

export interface VoteSummary {
  approve: number;
  reject: number;
  abstain: number;
  conditional: number;
  total: number;
}

export interface WeightedVoteSummary {
  approveWeight: number;
  rejectWeight: number;
  abstainWeight: number;
  conditionalWeight: number;
  totalWeight: number;
}

export interface QuorumDetails {
  required: number;
  actual: number;
  met: boolean;
  percentage: number;
}

export interface ConditionSummary {
  voterId: string;
  conditions: string[];
}

// === Opinion (스펙 추가) ===
export interface Opinion {
  id: string;
  sessionId: string;
  agentId: string;
  stance: VoteValue;
  reason: string;
  conditions?: string[];
  confidence: number;
  references?: string[];
  timestamp: Date;
  updatedAt?: Date;
}

export interface OpinionInput {
  agentId: string;
  stance: VoteValue;
  reason: string;
  conditions?: string[];
  confidence: number;
  references?: string[];
}

// === VoteTally (스펙 추가) ===
export interface VoteTally {
  sessionId: string;
  method: VotingMethod;

  // 기본 집계
  total: number;
  approve: number;
  reject: number;
  abstain: number;
  conditional: number;

  // 가중치 집계
  weightedTotal: number;
  weightedApprove: number;
  weightedReject: number;
  weightedAbstain: number;

  // 비율
  approvalRate: number;     // 0.0 ~ 1.0
  participationRate: number;

  // 정족수
  quorum: number;
  quorumMet: boolean;

  // 결과 판정
  passed: boolean;
  margin: number;           // 찬반 차이

  // 순위 투표 시
  rankings?: {
    position: number;
    agentId: string;
    score: number;
  }[];
}

export interface QuorumStatus {
  required: number;
  current: number;
  met: boolean;
  missing: number;
  missingVoters: string[];
}
```

### 2. VotingSession 클래스 구현

**파일 위치:** `packages/board/src/voting/VotingSession.ts`

```typescript
export interface VotingSessionOptions {
  agendaId: string;
  method: VotingMethod;
  eligibleVoters: string[];
  requiredQuorum?: number;
  deadline?: Date;
  voterWeights?: Map<string, number>;  // weighted 방식용
  metadata?: Record<string, unknown>;
}

export interface CastVoteOptions {
  voterId: string;
  choice: VoteChoice;
  reason?: string;
  conditions?: string[];   // conditional일 때 필수
  weight?: number;         // weighted 방식에서 오버라이드
}

export class VotingSession {
  readonly id: string;
  readonly agendaId: string;
  readonly method: VotingMethod;
  
  private _status: VotingSessionStatus;
  private _eligibleVoters: Set<string>;
  private _votes: Map<string, Vote>;
  private _voterWeights: Map<string, number>;
  private _requiredQuorum: number;
  private _deadline?: Date;
  private _result?: VotingSessionResult;
  private _createdAt: Date;
  private _openedAt?: Date;
  private _closedAt?: Date;
  
  constructor(options: VotingSessionOptions);

  // === Getters ===
  get status(): VotingSessionStatus;
  get eligibleVoters(): string[];
  get votes(): Vote[];
  get requiredQuorum(): number;
  get deadline(): Date | undefined;
  get result(): VotingSessionResult | undefined;
  get createdAt(): Date;
  get openedAt(): Date | undefined;
  get closedAt(): Date | undefined;

  // === 세션 관리 ===
  open(): void;
  close(): void;
  cancel(reason?: string): void;

  // === 투표 ===
  castVote(options: CastVoteOptions): Vote;
  changeVote(voterId: string, newChoice: VoteChoice, reason?: string): Vote;
  withdrawVote(voterId: string): boolean;

  // === 조회 ===
  getVote(voterId: string): Vote | undefined;
  hasVoted(voterId: string): boolean;
  canVote(voterId: string): boolean;
  getVoterWeight(voterId: string): number;

  // === 집계 ===
  tally(): VotingSessionResult;
  getCurrentSummary(): VoteSummary;
  getQuorumStatus(): QuorumDetails;

  // === 검증 ===
  isQuorumMet(): boolean;
  isDeadlinePassed(): boolean;
  canClose(): boolean;

  // === 직렬화 ===
  toJSON(): VotingSessionData;
  static fromJSON(data: VotingSessionData): VotingSession;
}
```

### 3. VotingManager 클래스 구현

**파일 위치:** `packages/board/src/voting/VotingManager.ts`

```typescript
export class VotingManager {
  private sessions: Map<string, VotingSession>;
  private eventBus: EventBus;
  private agendaManager: AgendaManager;

  constructor(eventBus: EventBus, agendaManager: AgendaManager);

  // === 투표 세션 관리 ===
  startVoting(agendaId: string, config?: VotingConfig): Promise<VotingSession>;
  endVoting(sessionId: string): Promise<VotingResult>;
  cancelVoting(sessionId: string, reason: string): Promise<void>;

  // === 투표 참여 ===
  castVote(sessionId: string, vote: CastVoteInput): Promise<void>;
  changeVote(sessionId: string, vote: CastVoteInput): Promise<void>;
  withdrawVote(sessionId: string, agentId: string): Promise<void>;

  // === 의견 제출 (스펙 추가) ===
  submitOpinion(sessionId: string, opinion: OpinionInput): Promise<void>;
  updateOpinion(sessionId: string, opinion: OpinionInput): Promise<void>;

  // === 조회 ===
  getSession(sessionId: string): Promise<VotingSession | undefined>;
  getSessionByAgenda(agendaId: string): Promise<VotingSession | undefined>;
  getVotes(sessionId: string): Promise<Vote[]>;
  getOpinions(sessionId: string): Promise<Opinion[]>;

  // === 집계 ===
  countVotes(sessionId: string): Promise<VoteTally>;
  checkQuorum(sessionId: string): Promise<QuorumStatus>;
}

export interface SessionFilter {
  agendaId?: string;
  status?: VotingSessionStatus | VotingSessionStatus[];
  method?: VotingMethod;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface VotingProgress {
  sessionId: string;
  totalEligible: number;
  votedCount: number;
  remainingCount: number;
  percentage: number;
  quorumMet: boolean;
  timeRemaining?: number; // ms
}

export interface ExpiredSession {
  session: VotingSession;
  overdueMs: number;
}
```

### 4. 투표 방식별 집계 로직

#### 4.1 다수결 (Majority)

```typescript
/**
 * 단순 다수결 집계
 * - 찬성이 반대보다 많으면 승인
 * - 기권은 정족수 계산에서 제외
 * - 동률이면 TIED
 */
function tallyMajority(votes: Vote[], quorum: number): VotingResult {
  const summary = calculateSummary(votes);
  
  // 정족수 체크 (기권 제외)
  const participatingVotes = summary.approve + summary.reject + summary.conditional;
  if (participatingVotes < quorum) {
    return VotingResult.INSUFFICIENT_QUORUM;
  }
  
  // 조건부 찬성은 찬성으로 계산
  const effectiveApprove = summary.approve + summary.conditional;
  
  if (effectiveApprove > summary.reject) {
    return VotingResult.APPROVED;
  } else if (summary.reject > effectiveApprove) {
    return VotingResult.REJECTED;
  } else {
    return VotingResult.TIED;
  }
}
```

#### 4.2 2/3 다수결 (Supermajority)

```typescript
/**
 * 2/3 다수결 집계
 * - 찬성이 전체의 2/3 이상이면 승인
 * - 기권은 전체 투표 수에 포함
 */
function tallySuperMajority(votes: Vote[], quorum: number): VotingResult {
  const summary = calculateSummary(votes);
  
  if (summary.total < quorum) {
    return VotingResult.INSUFFICIENT_QUORUM;
  }
  
  const effectiveApprove = summary.approve + summary.conditional;
  const threshold = Math.ceil(summary.total * (2 / 3));
  
  if (effectiveApprove >= threshold) {
    return VotingResult.APPROVED;
  } else {
    return VotingResult.REJECTED;
  }
}
```

#### 4.3 만장일치 (Unanimous)

```typescript
/**
 * 만장일치 집계
 * - 모든 참여자가 찬성(또는 조건부 찬성)해야 승인
 * - 기권자는 무시
 * - 단 한 명이라도 반대하면 거부
 */
function tallyUnanimous(votes: Vote[], quorum: number): VotingResult {
  const summary = calculateSummary(votes);
  const participatingVotes = summary.approve + summary.reject + summary.conditional;
  
  if (participatingVotes < quorum) {
    return VotingResult.INSUFFICIENT_QUORUM;
  }
  
  // 반대가 하나라도 있으면 거부
  if (summary.reject > 0) {
    return VotingResult.REJECTED;
  }
  
  return VotingResult.APPROVED;
}
```

#### 4.4 가중치 투표 (Weighted)

```typescript
/**
 * 가중치 투표 집계
 * - 각 투표자의 가중치를 고려하여 집계
 * - 정족수는 가중치 합계 기준
 */
function tallyWeighted(
  votes: Vote[],
  weights: Map<string, number>,
  quorum: number
): VotingResult {
  let approveWeight = 0;
  let rejectWeight = 0;
  let abstainWeight = 0;
  let conditionalWeight = 0;
  
  for (const vote of votes) {
    const weight = vote.weight ?? weights.get(vote.voterId) ?? 1;
    
    switch (vote.choice) {
      case VoteChoice.APPROVE:
        approveWeight += weight;
        break;
      case VoteChoice.REJECT:
        rejectWeight += weight;
        break;
      case VoteChoice.ABSTAIN:
        abstainWeight += weight;
        break;
      case VoteChoice.CONDITIONAL:
        conditionalWeight += weight;
        break;
    }
  }
  
  const totalWeight = approveWeight + rejectWeight + conditionalWeight;
  
  if (totalWeight < quorum) {
    return VotingResult.INSUFFICIENT_QUORUM;
  }
  
  const effectiveApprove = approveWeight + conditionalWeight;
  
  if (effectiveApprove > rejectWeight) {
    return VotingResult.APPROVED;
  } else if (rejectWeight > effectiveApprove) {
    return VotingResult.REJECTED;
  } else {
    return VotingResult.TIED;
  }
}
```

### 5. 이벤트 발행

| 이벤트 이름 | 설명 | 페이로드 |
|-----------|------|---------|
| `voting.session.created` | 세션 생성됨 | `{ session: VotingSession }` |
| `voting.session.opened` | 투표 시작됨 | `{ session: VotingSession }` |
| `voting.session.closed` | 투표 종료됨 | `{ session: VotingSession, result: VotingSessionResult }` |
| `voting.session.cancelled` | 투표 취소됨 | `{ session: VotingSession, reason?: string }` |
| `voting.vote.cast` | 투표 제출됨 | `{ vote: Vote, session: VotingSession }` |
| `voting.vote.changed` | 투표 변경됨 | `{ oldVote: Vote, newVote: Vote }` |
| `voting.vote.withdrawn` | 투표 철회됨 | `{ vote: Vote, session: VotingSession }` |
| `voting.quorum.met` | 정족수 충족 | `{ session: VotingSession, quorum: QuorumDetails }` |
| `voting.deadline.approaching` | 마감 임박 | `{ session: VotingSession, remainingMs: number }` |
| `voting.deadline.passed` | 마감 시간 초과 | `{ session: VotingSession }` |

### 6. 테스트 케이스

#### 6.1 VotingSession 생성 테스트

```typescript
describe('VotingSession creation', () => {
  it('should create session with valid options', () => {
    const session = new VotingSession({
      agendaId: 'agenda-1',
      method: VotingMethod.MAJORITY,
      eligibleVoters: ['ceo', 'cto', 'cfo'],
      requiredQuorum: 2
    });

    expect(session.id).toBeDefined();
    expect(session.status).toBe(VotingSessionStatus.PENDING);
    expect(session.eligibleVoters).toHaveLength(3);
  });

  it('should set default quorum based on method', () => {
    const majority = new VotingSession({
      agendaId: 'agenda-1',
      method: VotingMethod.MAJORITY,
      eligibleVoters: ['a', 'b', 'c', 'd', 'e']
    });

    expect(majority.requiredQuorum).toBe(3); // 50% + 1
  });

  it('should require all voters for unanimous', () => {
    const unanimous = new VotingSession({
      agendaId: 'agenda-1',
      method: VotingMethod.UNANIMOUS,
      eligibleVoters: ['a', 'b', 'c']
    });

    expect(unanimous.requiredQuorum).toBe(3);
  });

  it('should accept voter weights for weighted voting', () => {
    const session = new VotingSession({
      agendaId: 'agenda-1',
      method: VotingMethod.WEIGHTED,
      eligibleVoters: ['ceo', 'cto', 'cfo'],
      voterWeights: new Map([
        ['ceo', 3],
        ['cto', 2],
        ['cfo', 1]
      ])
    });

    expect(session.getVoterWeight('ceo')).toBe(3);
    expect(session.getVoterWeight('cto')).toBe(2);
  });
});
```

#### 6.2 투표 제출 테스트

```typescript
describe('VotingSession castVote', () => {
  let session: VotingSession;

  beforeEach(() => {
    session = new VotingSession({
      agendaId: 'agenda-1',
      method: VotingMethod.MAJORITY,
      eligibleVoters: ['ceo', 'cto', 'cfo'],
      requiredQuorum: 2
    });
    session.open();
  });

  it('should accept vote from eligible voter', () => {
    const vote = session.castVote({
      voterId: 'ceo',
      choice: VoteChoice.APPROVE,
      reason: 'ROI가 좋습니다'
    });

    expect(vote.voterId).toBe('ceo');
    expect(vote.choice).toBe(VoteChoice.APPROVE);
    expect(session.hasVoted('ceo')).toBe(true);
  });

  it('should reject vote from non-eligible voter', () => {
    expect(() => {
      session.castVote({
        voterId: 'outsider',
        choice: VoteChoice.APPROVE
      });
    }).toThrow('NOT_ELIGIBLE_VOTER');
  });

  it('should reject duplicate vote', () => {
    session.castVote({ voterId: 'ceo', choice: VoteChoice.APPROVE });

    expect(() => {
      session.castVote({ voterId: 'ceo', choice: VoteChoice.REJECT });
    }).toThrow('ALREADY_VOTED');
  });

  it('should reject vote on closed session', () => {
    session.close();

    expect(() => {
      session.castVote({ voterId: 'ceo', choice: VoteChoice.APPROVE });
    }).toThrow('SESSION_CLOSED');
  });

  it('should require conditions for conditional vote', () => {
    expect(() => {
      session.castVote({
        voterId: 'ceo',
        choice: VoteChoice.CONDITIONAL
        // conditions 누락
      });
    }).toThrow('CONDITIONS_REQUIRED');
  });

  it('should accept conditional vote with conditions', () => {
    const vote = session.castVote({
      voterId: 'ceo',
      choice: VoteChoice.CONDITIONAL,
      conditions: ['기술 실사 완료', '법무 검토 통과']
    });

    expect(vote.choice).toBe(VoteChoice.CONDITIONAL);
    expect(vote.conditions).toHaveLength(2);
  });
});
```

#### 6.3 투표 변경/철회 테스트

```typescript
describe('VotingSession vote modification', () => {
  let session: VotingSession;

  beforeEach(() => {
    session = new VotingSession({
      agendaId: 'agenda-1',
      method: VotingMethod.MAJORITY,
      eligibleVoters: ['ceo', 'cto', 'cfo']
    });
    session.open();
    session.castVote({ voterId: 'ceo', choice: VoteChoice.APPROVE });
  });

  it('should allow vote change', () => {
    const newVote = session.changeVote('ceo', VoteChoice.REJECT, '재고 후 반대');

    expect(newVote.choice).toBe(VoteChoice.REJECT);
    expect(newVote.reason).toBe('재고 후 반대');
  });

  it('should allow vote withdrawal', () => {
    const withdrawn = session.withdrawVote('ceo');

    expect(withdrawn).toBe(true);
    expect(session.hasVoted('ceo')).toBe(false);
  });

  it('should reject withdrawal after session closed', () => {
    session.close();

    expect(() => {
      session.withdrawVote('ceo');
    }).toThrow('SESSION_CLOSED');
  });
});
```

#### 6.4 다수결 집계 테스트

```typescript
describe('VotingSession majority tally', () => {
  let session: VotingSession;

  beforeEach(() => {
    session = new VotingSession({
      agendaId: 'agenda-1',
      method: VotingMethod.MAJORITY,
      eligibleVoters: ['a', 'b', 'c', 'd', 'e'],
      requiredQuorum: 3
    });
    session.open();
  });

  it('should approve when majority approves', () => {
    session.castVote({ voterId: 'a', choice: VoteChoice.APPROVE });
    session.castVote({ voterId: 'b', choice: VoteChoice.APPROVE });
    session.castVote({ voterId: 'c', choice: VoteChoice.APPROVE });
    session.castVote({ voterId: 'd', choice: VoteChoice.REJECT });
    session.castVote({ voterId: 'e', choice: VoteChoice.REJECT });

    const result = session.tally();

    expect(result.result).toBe(VotingResult.APPROVED);
    expect(result.summary.approve).toBe(3);
    expect(result.summary.reject).toBe(2);
  });

  it('should reject when majority rejects', () => {
    session.castVote({ voterId: 'a', choice: VoteChoice.REJECT });
    session.castVote({ voterId: 'b', choice: VoteChoice.REJECT });
    session.castVote({ voterId: 'c', choice: VoteChoice.REJECT });
    session.castVote({ voterId: 'd', choice: VoteChoice.APPROVE });

    const result = session.tally();

    expect(result.result).toBe(VotingResult.REJECTED);
  });

  it('should return tied when equal', () => {
    session.castVote({ voterId: 'a', choice: VoteChoice.APPROVE });
    session.castVote({ voterId: 'b', choice: VoteChoice.APPROVE });
    session.castVote({ voterId: 'c', choice: VoteChoice.REJECT });
    session.castVote({ voterId: 'd', choice: VoteChoice.REJECT });

    const result = session.tally();

    expect(result.result).toBe(VotingResult.TIED);
  });

  it('should fail quorum when insufficient votes', () => {
    session.castVote({ voterId: 'a', choice: VoteChoice.APPROVE });
    session.castVote({ voterId: 'b', choice: VoteChoice.APPROVE });
    // 정족수 3명 미달

    const result = session.tally();

    expect(result.result).toBe(VotingResult.INSUFFICIENT_QUORUM);
    expect(result.quorumMet).toBe(false);
  });

  it('should exclude abstain from quorum calculation', () => {
    session.castVote({ voterId: 'a', choice: VoteChoice.APPROVE });
    session.castVote({ voterId: 'b', choice: VoteChoice.APPROVE });
    session.castVote({ voterId: 'c', choice: VoteChoice.ABSTAIN });
    // 기권 제외하면 참여 2명, 정족수 미달

    const result = session.tally();

    expect(result.result).toBe(VotingResult.INSUFFICIENT_QUORUM);
  });

  it('should count conditional as approve', () => {
    session.castVote({ voterId: 'a', choice: VoteChoice.APPROVE });
    session.castVote({ voterId: 'b', choice: VoteChoice.CONDITIONAL, conditions: ['조건1'] });
    session.castVote({ voterId: 'c', choice: VoteChoice.CONDITIONAL, conditions: ['조건2'] });
    session.castVote({ voterId: 'd', choice: VoteChoice.REJECT });

    const result = session.tally();

    expect(result.result).toBe(VotingResult.APPROVED);
    expect(result.conditions).toHaveLength(2);
  });
});
```

#### 6.5 만장일치 집계 테스트

```typescript
describe('VotingSession unanimous tally', () => {
  let session: VotingSession;

  beforeEach(() => {
    session = new VotingSession({
      agendaId: 'agenda-1',
      method: VotingMethod.UNANIMOUS,
      eligibleVoters: ['a', 'b', 'c']
    });
    session.open();
  });

  it('should approve when all approve', () => {
    session.castVote({ voterId: 'a', choice: VoteChoice.APPROVE });
    session.castVote({ voterId: 'b', choice: VoteChoice.APPROVE });
    session.castVote({ voterId: 'c', choice: VoteChoice.APPROVE });

    const result = session.tally();

    expect(result.result).toBe(VotingResult.APPROVED);
  });

  it('should reject when any rejects', () => {
    session.castVote({ voterId: 'a', choice: VoteChoice.APPROVE });
    session.castVote({ voterId: 'b', choice: VoteChoice.APPROVE });
    session.castVote({ voterId: 'c', choice: VoteChoice.REJECT });

    const result = session.tally();

    expect(result.result).toBe(VotingResult.REJECTED);
  });

  it('should approve when some abstain but rest approve', () => {
    session.castVote({ voterId: 'a', choice: VoteChoice.APPROVE });
    session.castVote({ voterId: 'b', choice: VoteChoice.APPROVE });
    session.castVote({ voterId: 'c', choice: VoteChoice.ABSTAIN });

    const result = session.tally();

    expect(result.result).toBe(VotingResult.APPROVED);
  });
});
```

#### 6.6 가중치 투표 집계 테스트

```typescript
describe('VotingSession weighted tally', () => {
  let session: VotingSession;

  beforeEach(() => {
    session = new VotingSession({
      agendaId: 'agenda-1',
      method: VotingMethod.WEIGHTED,
      eligibleVoters: ['ceo', 'cto', 'cfo'],
      voterWeights: new Map([
        ['ceo', 5],  // CEO 가중치 5
        ['cto', 3],  // CTO 가중치 3
        ['cfo', 2]   // CFO 가중치 2
      ]),
      requiredQuorum: 6  // 총 10 중 6 이상
    });
    session.open();
  });

  it('should approve based on weight', () => {
    // CEO(5) 찬성 vs CTO(3) + CFO(2) 반대
    session.castVote({ voterId: 'ceo', choice: VoteChoice.APPROVE });
    session.castVote({ voterId: 'cto', choice: VoteChoice.REJECT });
    session.castVote({ voterId: 'cfo', choice: VoteChoice.REJECT });

    const result = session.tally();

    expect(result.result).toBe(VotingResult.REJECTED);
    expect(result.weightedSummary?.approveWeight).toBe(5);
    expect(result.weightedSummary?.rejectWeight).toBe(5);
  });

  it('should use weight in quorum calculation', () => {
    // CEO(5)만 투표 - 정족수 6 미달
    session.castVote({ voterId: 'ceo', choice: VoteChoice.APPROVE });

    const result = session.tally();

    expect(result.result).toBe(VotingResult.INSUFFICIENT_QUORUM);
  });

  it('should approve when high weight voter approves', () => {
    // CEO(5) + CFO(2) 찬성 = 7 vs CTO(3) 반대
    session.castVote({ voterId: 'ceo', choice: VoteChoice.APPROVE });
    session.castVote({ voterId: 'cto', choice: VoteChoice.REJECT });
    session.castVote({ voterId: 'cfo', choice: VoteChoice.APPROVE });

    const result = session.tally();

    expect(result.result).toBe(VotingResult.APPROVED);
  });
});
```

#### 6.7 VotingManager 테스트

```typescript
describe('VotingManager', () => {
  let manager: VotingManager;
  let agendaManager: AgendaManager;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = createMockEventBus();
    agendaManager = new AgendaManager(eventBus);
    manager = new VotingManager(eventBus, agendaManager);
  });

  it('should create session for agenda', () => {
    const agenda = agendaManager.create({
      title: '테스트',
      description: '테스트',
      proposer: 'user'
    });

    const session = manager.createSession({
      agendaId: agenda.id,
      method: VotingMethod.MAJORITY,
      eligibleVoters: ['a', 'b', 'c']
    });

    expect(session.agendaId).toBe(agenda.id);
  });

  it('should open and close voting', () => {
    const session = manager.createSession({
      agendaId: 'agenda-1',
      method: VotingMethod.MAJORITY,
      eligibleVoters: ['a', 'b', 'c']
    });

    manager.openVoting(session.id);
    expect(session.status).toBe(VotingSessionStatus.OPEN);

    manager.submitVote(session.id, { voterId: 'a', choice: VoteChoice.APPROVE });
    manager.submitVote(session.id, { voterId: 'b', choice: VoteChoice.APPROVE });

    const result = manager.closeVoting(session.id);
    expect(result.result).toBe(VotingResult.APPROVED);
  });

  it('should get voting progress', () => {
    const session = manager.createSession({
      agendaId: 'agenda-1',
      method: VotingMethod.MAJORITY,
      eligibleVoters: ['a', 'b', 'c', 'd', 'e'],
      requiredQuorum: 3
    });
    manager.openVoting(session.id);

    manager.submitVote(session.id, { voterId: 'a', choice: VoteChoice.APPROVE });
    manager.submitVote(session.id, { voterId: 'b', choice: VoteChoice.APPROVE });

    const progress = manager.getVotingProgress(session.id);

    expect(progress.totalEligible).toBe(5);
    expect(progress.votedCount).toBe(2);
    expect(progress.remainingCount).toBe(3);
    expect(progress.percentage).toBe(40);
    expect(progress.quorumMet).toBe(false);
  });

  it('should auto-close expired sessions', () => {
    vi.useFakeTimers();

    const deadline = new Date(Date.now() + 1000); // 1초 후
    const session = manager.createSession({
      agendaId: 'agenda-1',
      method: VotingMethod.MAJORITY,
      eligibleVoters: ['a', 'b', 'c'],
      deadline
    });
    manager.openVoting(session.id);

    manager.submitVote(session.id, { voterId: 'a', choice: VoteChoice.APPROVE });
    manager.submitVote(session.id, { voterId: 'b', choice: VoteChoice.APPROVE });

    vi.advanceTimersByTime(2000); // 2초 경과

    const results = manager.autoCloseExpiredSessions();

    expect(results).toHaveLength(1);
    expect(results[0].result).toBe(VotingResult.APPROVED);

    vi.useRealTimers();
  });
});

#### 6.8 Opinion 기능 테스트 (스펙 추가)

```typescript
describe('VotingManager opinion handling', () => {
  let manager: VotingManager;
  let eventBus: EventBus;
  let agendaManager: AgendaManager;

  beforeEach(() => {
    eventBus = createMockEventBus();
    agendaManager = new AgendaManager(eventBus);
    manager = new VotingManager(eventBus, agendaManager);
  });

  it('should submit opinion', async () => {
    const agenda = agendaManager.create({
      title: '테스트',
      description: '테스트',
      proposer: 'user'
    });

    const session = await manager.startVoting(agenda.id, {
      method: 'majority',
      quorum: 2
    });

    await manager.submitOpinion(session.id, {
      agentId: 'ceo',
      stance: 'approve',
      reason: 'ROI가 좋습니다',
      confidence: 0.9
    });

    const opinions = await manager.getOpinions(session.id);
    expect(opinions).toHaveLength(1);
    expect(opinions[0].agentId).toBe('ceo');
    expect(opinions[0].stance).toBe('approve');
  });

  it('should update opinion', async () => {
    const agenda = agendaManager.create({
      title: '테스트',
      description: '테스트',
      proposer: 'user'
    });

    const session = await manager.startVoting(agenda.id, {
      method: 'majority',
      quorum: 2
    });

    await manager.submitOpinion(session.id, {
      agentId: 'ceo',
      stance: 'approve',
      reason: 'ROI가 좋습니다',
      confidence: 0.8
    });

    await manager.updateOpinion(session.id, {
      agentId: 'ceo',
      stance: 'conditional',
      reason: '리스크 확인 후 승인',
      confidence: 0.9,
      conditions: ['기술 검토 완료']
    });

    const opinions = await manager.getOpinions(session.id);
    expect(opinions[0].stance).toBe('conditional');
    expect(opinions[0].conditions).toHaveLength(1);
  });

  it('should support confidence level', async () => {
    const agenda = agendaManager.create({
      title: '테스트',
      description: '테스트',
      proposer: 'user'
    });

    const session = await manager.startVoting(agenda.id, {
      method: 'majority',
      quorum: 2
    });

    await manager.submitOpinion(session.id, {
      agentId: 'ceo',
      stance: 'approve',
      reason: '확신합니다',
      confidence: 0.95
    });

    const opinions = await manager.getOpinions(session.id);
    expect(opinions[0].confidence).toBe(0.95);
  });

  it('should support references', async () => {
    const agenda = agendaManager.create({
      title: '테스트',
      description: '테스트',
      proposer: 'user'
    });

    const session = await manager.startVoting(agenda.id, {
      method: 'majority',
      quorum: 2
    });

    await manager.submitOpinion(session.id, {
      agentId: 'ceo',
      stance: 'approve',
      reason: '참고 자료 기반',
      confidence: 0.85,
      references: ['https://example.com/report1', 'https://example.com/report2']
    });

    const opinions = await manager.getOpinions(session.id);
    expect(opinions[0].references).toHaveLength(2);
  });
});
```
```

### 7. 파일 구조

```
packages/board/
├── src/
│   ├── voting/
│   │   ├── VotingSession.ts
│   │   ├── VotingManager.ts
│   │   ├── tally/
│   │   │   ├── majority.ts
│   │   │   ├── supermajority.ts
│   │   │   ├── unanimous.ts
│   │   │   ├── weighted.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   └── types/
│       └── voting.ts
└── test/
    └── voting/
        ├── VotingSession.test.ts
        ├── VotingManager.test.ts
        └── tally/
            ├── majority.test.ts
            ├── unanimous.test.ts
            └── weighted.test.ts
```

### 8. 완료 조건

- [ ] VotingSession 클래스 구현 완료
- [ ] VotingManager 클래스 구현 완료
- [ ] 다수결 집계 로직 구현 완료
- [ ] 2/3 다수결 집계 로직 구현 완료
- [ ] 만장일치 집계 로직 구현 완료
- [ ] 가중치 투표 집계 로직 구현 완료
- [ ] **순위 투표(ranked) 집계 로직 구현 완료** (스펙 추가)
- [ ] 정족수 체크 기능 구현 완료
- [ ] **Opinion 기능 구현 완료** (submitOpinion, updateOpinion) (스펙 추가)
- [ ] 이벤트 발행 구현 완료
- [ ] 테스트 커버리지 80% 이상
- [ ] pnpm test 성공
- [ ] TypeScript 타입 체크 통과

### 9. 의존성

- TASK-036 (AgendaManager)
- @obora-kit/core 패키지 (EventBus)

### 10. 참고 문서

- [Blackboard Actor Design](../../architecture/blackboard-actor-design.md)
- [AI 이사회 의사결정 흐름](../../architecture/blackboard-actor-design.md#4-ai-이사회-의사결정-흐름)
