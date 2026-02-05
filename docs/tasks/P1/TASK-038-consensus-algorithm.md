# TASK-038: @obora-kit/board - Consensus Algorithm

## 개요
- **상태**: 📋 대기
- 우선순위: P1
- 예상 소요: 8시간
- 담당: 개발자

## 목표
AI 이사회의 합의 알고리즘을 구현합니다. 투표 결과를 바탕으로 합의를 도출하고, 조건부 합의 처리, 에스컬레이션, 재투표 메커니즘을 제공합니다.

## 작업 내용

### 1. 핵심 타입 정의

**파일 위치:** `packages/board/src/types/consensus.ts`

```typescript
// === 합의 상태 ===
export enum ConsensusStatus {
  PENDING = 'pending',           // 합의 진행 중
  REACHED = 'reached',           // 합의 도달
  FAILED = 'failed',             // 합의 실패
  CONDITIONAL = 'conditional',   // 조건부 합의
  ESCALATED = 'escalated',       // 에스컬레이션됨
  DEFERRED = 'deferred'          // 연기됨
}

// === 합의 유형 ===
export enum ConsensusType {
  FULL = 'full',                 // 완전 합의 (모두 동의)
  MAJORITY = 'majority',         // 다수결 합의
  SUPERMAJORITY = 'supermajority', // 2/3 합의
  COMPROMISE = 'compromise',     // 타협 합의
  CONDITIONAL = 'conditional',   // 조건부 합의
  MINORITY_OVERRIDE = 'minority_override' // 소수의견 무시 합의
}

// === 에스컬레이션 레벨 ===
export enum EscalationLevel {
  NONE = 0,
  DISCUSSION = 1,      // 추가 토론 필요
  MEDIATION = 2,       // 중재 필요
  EXTERNAL = 3,        // 외부 결정 필요
  DEADLOCK = 4         // 교착 상태
}

// === 합의 결과 ===
export interface ConsensusResult {
  id: string;
  agendaId: string;
  sessionId: string;
  status: ConsensusStatus;
  type: ConsensusType;
  decision: ConsensusDecision;
  votingSummary: VoteSummary;
  conditions?: ConditionalClause[];
  dissent?: DissentRecord[];
  escalation?: EscalationRecord;
  attempts: number;
  reachedAt?: Date;
  metadata?: Record<string, unknown>;
}

// === 합의 결정 ===
export interface ConsensusDecision {
  outcome: 'approved' | 'rejected' | 'deferred' | 'modified';
  rationale: string;
  modifications?: string[];    // 수정 사항 (compromise 시)
  effectiveDate?: Date;
  expirationDate?: Date;
}

// === 조건부 합의 조항 ===
export interface ConditionalClause {
  id: string;
  voterId: string;
  condition: string;
  priority: 'required' | 'preferred' | 'optional';
  status: 'pending' | 'met' | 'waived' | 'failed';
  deadline?: Date;
  verifier?: string;           // 검증자 ID
  verifiedAt?: Date;
}

// === 반대 의견 기록 ===
export interface DissentRecord {
  voterId: string;
  reason: string;
  severity: 'minor' | 'major' | 'fundamental';
  acknowledged: boolean;
  response?: string;           // 반대 의견에 대한 응답
}

// === 에스컬레이션 기록 ===
export interface EscalationRecord {
  level: EscalationLevel;
  reason: string;
  escalatedAt: Date;
  escalatedTo?: string;        // 에스컬레이션 대상
  resolution?: string;
  resolvedAt?: Date;
}

// === 합의 규칙 ===
export interface ConsensusRules {
  method: VotingMethod;
  quorumPercentage: number;
  approvalThreshold: number;   // 승인에 필요한 비율
  maxAttempts: number;         // 최대 재투표 횟수
  autoEscalateOnTie: boolean;
  autoEscalateOnFailure: boolean;
  requireDissentAcknowledgment: boolean;  // 반대 의견 인정 필요
  conditionalApprovalAllowed: boolean;
  cooldownBetweenAttempts: number;  // ms
}
```

### 2. ConsensusEngine 클래스 구현

**파일 위치:** `packages/board/src/consensus/ConsensusEngine.ts`

```typescript
export interface ConsensusEngineOptions {
  defaultRules?: Partial<ConsensusRules>;
  eventBus: EventBus;
  votingManager: VotingManager;
}

export interface EvaluateOptions {
  sessionId: string;
  rules?: Partial<ConsensusRules>;
  forceDecision?: boolean;
}

export interface NegotiateOptions {
  sessionId: string;
  facilitatorId?: string;
  maxRounds?: number;
  timeoutMs?: number;
}

export class ConsensusEngine {
  private results: Map<string, ConsensusResult>;
  private eventBus: EventBus;
  private votingManager: VotingManager;
  private defaultRules: ConsensusRules;

  constructor(options: ConsensusEngineOptions);

  // === 합의 평가 ===
  evaluate(options: EvaluateOptions): ConsensusResult;
  evaluateVotingResult(
    result: VotingSessionResult,
    rules: ConsensusRules
  ): ConsensusResult;

  // === 조건부 합의 ===
  createConditionalConsensus(
    sessionId: string,
    conditions: ConditionalClause[]
  ): ConsensusResult;
  
  verifyCondition(
    resultId: string,
    clauseId: string,
    verified: boolean,
    verifierId: string
  ): ConditionalClause;
  
  checkConditionsStatus(resultId: string): ConditionsStatus;
  finalizeConditionalConsensus(resultId: string): ConsensusResult;

  // === 반대 의견 처리 ===
  recordDissent(
    resultId: string,
    dissent: Omit<DissentRecord, 'acknowledged' | 'response'>
  ): DissentRecord;
  
  acknowledgeDissent(
    resultId: string,
    voterId: string,
    response?: string
  ): DissentRecord;
  
  getUnacknowledgedDissents(resultId: string): DissentRecord[];

  // === 에스컬레이션 ===
  escalate(
    resultId: string,
    level: EscalationLevel,
    reason: string,
    escalateTo?: string
  ): EscalationRecord;
  
  resolveEscalation(
    resultId: string,
    resolution: string
  ): ConsensusResult;

  // === 재투표 ===
  requestRevote(
    resultId: string,
    reason: string
  ): VotingSession;
  
  canRequestRevote(resultId: string): boolean;
  getRemainingAttempts(resultId: string): number;

  // === 협상/타협 ===
  negotiate(options: NegotiateOptions): NegotiationResult;
  proposeCompromise(
    sessionId: string,
    proposal: CompromiseProposal
  ): CompromiseResult;

  // === 조회 ===
  getResult(resultId: string): ConsensusResult | undefined;
  getResultByAgenda(agendaId: string): ConsensusResult | undefined;
  getResultBySession(sessionId: string): ConsensusResult | undefined;
  getAllResults(filter?: ConsensusFilter): ConsensusResult[];

  // === 유틸리티 ===
  determineConsensusType(
    result: VotingSessionResult,
    rules: ConsensusRules
  ): ConsensusType;
  
  calculateApprovalRatio(summary: VoteSummary): number;
  isConsensusReached(result: VotingSessionResult, rules: ConsensusRules): boolean;
}

export interface ConditionsStatus {
  total: number;
  met: number;
  pending: number;
  failed: number;
  waived: number;
  allMet: boolean;
  requiredMet: boolean;
}

export interface CompromiseProposal {
  proposerId: string;
  modifications: string[];
  rationale: string;
  affectedVoters: string[];
}

export interface CompromiseResult {
  accepted: boolean;
  acceptedBy: string[];
  rejectedBy: string[];
  counterProposals?: CompromiseProposal[];
}

export interface NegotiationResult {
  rounds: number;
  finalProposal?: CompromiseProposal;
  accepted: boolean;
  timeline: NegotiationEvent[];
}

export interface NegotiationEvent {
  round: number;
  type: 'proposal' | 'counter' | 'accept' | 'reject' | 'timeout';
  participantId: string;
  content?: string;
  timestamp: Date;
}

export interface ConsensusFilter {
  agendaId?: string;
  status?: ConsensusStatus | ConsensusStatus[];
  type?: ConsensusType;
  hasConditions?: boolean;
  hasEscalation?: boolean;
  reachedAfter?: Date;
  reachedBefore?: Date;
}
```

### 3. 합의 알고리즘 구현

#### 3.1 다수결 합의

```typescript
// packages/board/src/consensus/algorithms/majority.ts

export interface MajorityConsensusOptions {
  result: VotingSessionResult;
  rules: ConsensusRules;
}

export function evaluateMajorityConsensus(
  options: MajorityConsensusOptions
): ConsensusResult {
  const { result, rules } = options;
  const { summary } = result;
  
  // 정족수 체크
  if (!result.quorumMet) {
    return createFailedConsensus(result, 'QUORUM_NOT_MET');
  }
  
  // 승인 비율 계산
  const totalParticipating = summary.approve + summary.reject + summary.conditional;
  const approvalRatio = (summary.approve + summary.conditional) / totalParticipating;
  
  // 승인 임계값 체크
  if (approvalRatio >= rules.approvalThreshold) {
    // 조건부 투표가 있는 경우
    if (summary.conditional > 0) {
      return createConditionalConsensus(result, rules);
    }
    
    return createApprovedConsensus(result, ConsensusType.MAJORITY);
  }
  
  // 거부
  return createRejectedConsensus(result, ConsensusType.MAJORITY);
}

function createApprovedConsensus(
  result: VotingSessionResult,
  type: ConsensusType
): ConsensusResult {
  return {
    id: generateId(),
    agendaId: result.agendaId,
    sessionId: result.sessionId,
    status: ConsensusStatus.REACHED,
    type,
    decision: {
      outcome: 'approved',
      rationale: `${type} 합의에 의해 승인됨`
    },
    votingSummary: result.summary,
    attempts: 1,
    reachedAt: new Date()
  };
}
```

#### 3.2 만장일치 합의

```typescript
// packages/board/src/consensus/algorithms/unanimous.ts

export function evaluateUnanimousConsensus(
  options: { result: VotingSessionResult; rules: ConsensusRules }
): ConsensusResult {
  const { result, rules } = options;
  const { summary } = result;
  
  // 정족수 체크
  if (!result.quorumMet) {
    return createFailedConsensus(result, 'QUORUM_NOT_MET');
  }
  
  // 반대가 하나라도 있으면 실패
  if (summary.reject > 0) {
    const dissents = extractDissents(result);
    
    // 에스컬레이션 필요 여부 판단
    if (rules.autoEscalateOnFailure) {
      return createEscalatedConsensus(result, dissents, EscalationLevel.DISCUSSION);
    }
    
    return createRejectedConsensus(result, ConsensusType.FULL, dissents);
  }
  
  // 조건부 투표가 있는 경우
  if (summary.conditional > 0) {
    return createConditionalConsensus(result, rules);
  }
  
  // 완전 합의
  return createApprovedConsensus(result, ConsensusType.FULL);
}

function extractDissents(result: VotingSessionResult): DissentRecord[] {
  const dissents: DissentRecord[] = [];
  
  for (const [voterId, vote] of result.votes) {
    if (vote.choice === VoteChoice.REJECT) {
      dissents.push({
        voterId,
        reason: vote.reason || '사유 미기재',
        severity: 'major',
        acknowledged: false
      });
    }
  }
  
  return dissents;
}
```

#### 3.3 가중치 합의

```typescript
// packages/board/src/consensus/algorithms/weighted.ts

export function evaluateWeightedConsensus(
  options: {
    result: VotingSessionResult;
    rules: ConsensusRules;
    weights: Map<string, number>;
  }
): ConsensusResult {
  const { result, rules, weights } = options;
  const { weightedSummary } = result;
  
  if (!weightedSummary) {
    throw new Error('Weighted summary required for weighted consensus');
  }
  
  // 정족수 체크 (가중치 기반)
  if (!result.quorumMet) {
    return createFailedConsensus(result, 'QUORUM_NOT_MET');
  }
  
  // 가중치 기반 승인 비율 계산
  const totalWeight = weightedSummary.approveWeight +
                      weightedSummary.rejectWeight +
                      weightedSummary.conditionalWeight;
  
  const approvalWeight = weightedSummary.approveWeight + 
                         weightedSummary.conditionalWeight;
  
  const approvalRatio = approvalWeight / totalWeight;
  
  if (approvalRatio >= rules.approvalThreshold) {
    if (weightedSummary.conditionalWeight > 0) {
      return createConditionalConsensus(result, rules);
    }
    return createApprovedConsensus(result, ConsensusType.MAJORITY);
  }
  
  // 동률 처리
  if (approvalWeight === weightedSummary.rejectWeight) {
    if (rules.autoEscalateOnTie) {
      return createEscalatedConsensus(
        result,
        [],
        EscalationLevel.MEDIATION,
        '가중치 투표 동률'
      );
    }
    return createTiedConsensus(result);
  }
  
  return createRejectedConsensus(result, ConsensusType.MAJORITY);
}
```

#### 3.4 조건부 합의 처리

```typescript
// packages/board/src/consensus/conditional.ts

export class ConditionalConsensusHandler {
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * 조건부 합의 생성
   */
  createConditionalConsensus(
    result: VotingSessionResult,
    rules: ConsensusRules
  ): ConsensusResult {
    const conditions = this.extractConditions(result);
    
    return {
      id: generateId(),
      agendaId: result.agendaId,
      sessionId: result.sessionId,
      status: ConsensusStatus.CONDITIONAL,
      type: ConsensusType.CONDITIONAL,
      decision: {
        outcome: 'approved',
        rationale: '조건부 승인 - 조건 충족 시 효력 발생'
      },
      votingSummary: result.summary,
      conditions,
      attempts: 1,
      reachedAt: new Date()
    };
  }

  /**
   * 조건 추출
   */
  private extractConditions(result: VotingSessionResult): ConditionalClause[] {
    const conditions: ConditionalClause[] = [];
    
    for (const [voterId, vote] of result.votes) {
      if (vote.choice === VoteChoice.CONDITIONAL && vote.conditions) {
        for (const condition of vote.conditions) {
          conditions.push({
            id: generateId(),
            voterId,
            condition,
            priority: 'required',
            status: 'pending'
          });
        }
      }
    }
    
    return conditions;
  }

  /**
   * 조건 검증
   */
  verifyCondition(
    consensus: ConsensusResult,
    clauseId: string,
    verified: boolean,
    verifierId: string
  ): ConditionalClause {
    const clause = consensus.conditions?.find(c => c.id === clauseId);
    
    if (!clause) {
      throw new Error('CONDITION_NOT_FOUND');
    }
    
    clause.status = verified ? 'met' : 'failed';
    clause.verifier = verifierId;
    clause.verifiedAt = new Date();
    
    this.eventBus.publish('consensus.condition.verified', {
      consensusId: consensus.id,
      clause,
      verified
    });
    
    return clause;
  }

  /**
   * 모든 필수 조건 충족 여부 확인
   */
  checkConditionsStatus(consensus: ConsensusResult): ConditionsStatus {
    const conditions = consensus.conditions || [];
    
    const status: ConditionsStatus = {
      total: conditions.length,
      met: 0,
      pending: 0,
      failed: 0,
      waived: 0,
      allMet: false,
      requiredMet: false
    };
    
    const requiredConditions = conditions.filter(c => c.priority === 'required');
    
    for (const condition of conditions) {
      switch (condition.status) {
        case 'met':
          status.met++;
          break;
        case 'pending':
          status.pending++;
          break;
        case 'failed':
          status.failed++;
          break;
        case 'waived':
          status.waived++;
          break;
      }
    }
    
    status.allMet = status.pending === 0 && status.failed === 0;
    status.requiredMet = requiredConditions.every(
      c => c.status === 'met' || c.status === 'waived'
    );
    
    return status;
  }

  /**
   * 조건부 합의 확정
   */
  finalizeConditionalConsensus(consensus: ConsensusResult): ConsensusResult {
    const status = this.checkConditionsStatus(consensus);
    
    if (!status.requiredMet) {
      consensus.status = ConsensusStatus.FAILED;
      consensus.decision.outcome = 'rejected';
      consensus.decision.rationale = '필수 조건 미충족으로 합의 실패';
    } else {
      consensus.status = ConsensusStatus.REACHED;
      consensus.decision.rationale = '모든 필수 조건 충족으로 합의 확정';
    }
    
    this.eventBus.publish('consensus.finalized', { consensus });
    
    return consensus;
  }
}
```

### 4. 에스컬레이션 처리

```typescript
// packages/board/src/consensus/escalation.ts

export class EscalationHandler {
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * 에스컬레이션 실행
   */
  escalate(
    consensus: ConsensusResult,
    level: EscalationLevel,
    reason: string,
    escalateTo?: string
  ): EscalationRecord {
    const record: EscalationRecord = {
      level,
      reason,
      escalatedAt: new Date(),
      escalatedTo
    };
    
    consensus.status = ConsensusStatus.ESCALATED;
    consensus.escalation = record;
    
    this.eventBus.publish('consensus.escalated', {
      consensusId: consensus.id,
      escalation: record
    });
    
    return record;
  }

  /**
   * 에스컬레이션 해결
   */
  resolveEscalation(
    consensus: ConsensusResult,
    resolution: string,
    decision: 'approved' | 'rejected' | 'deferred'
  ): ConsensusResult {
    if (!consensus.escalation) {
      throw new Error('NO_ESCALATION_TO_RESOLVE');
    }
    
    consensus.escalation.resolution = resolution;
    consensus.escalation.resolvedAt = new Date();
    
    consensus.status = ConsensusStatus.REACHED;
    consensus.decision.outcome = decision;
    consensus.decision.rationale = `에스컬레이션 해결: ${resolution}`;
    
    this.eventBus.publish('consensus.escalation.resolved', {
      consensusId: consensus.id,
      resolution,
      decision
    });
    
    return consensus;
  }

  /**
   * 에스컬레이션 레벨 결정
   */
  determineEscalationLevel(
    result: VotingSessionResult,
    attempts: number
  ): EscalationLevel {
    const { summary } = result;
    
    // 완전 교착 상태
    if (summary.approve === summary.reject && attempts >= 2) {
      return EscalationLevel.DEADLOCK;
    }
    
    // 재투표 후에도 해결 안됨
    if (attempts >= 2) {
      return EscalationLevel.MEDIATION;
    }
    
    // 첫 번째 실패
    return EscalationLevel.DISCUSSION;
  }
}
```

### 5. 이벤트 발행

| 이벤트 이름 | 설명 | 페이로드 |
|-----------|------|---------|
| `consensus.evaluated` | 합의 평가 완료 | `{ result: ConsensusResult }` |
| `consensus.reached` | 합의 도달 | `{ result: ConsensusResult }` |
| `consensus.failed` | 합의 실패 | `{ result: ConsensusResult, reason: string }` |
| `consensus.conditional` | 조건부 합의 | `{ result: ConsensusResult }` |
| `consensus.condition.verified` | 조건 검증됨 | `{ consensusId, clause, verified }` |
| `consensus.finalized` | 조건부 합의 확정 | `{ consensus: ConsensusResult }` |
| `consensus.escalated` | 에스컬레이션됨 | `{ consensusId, escalation }` |
| `consensus.escalation.resolved` | 에스컬레이션 해결 | `{ consensusId, resolution, decision }` |
| `consensus.dissent.recorded` | 반대 의견 기록 | `{ consensusId, dissent }` |
| `consensus.dissent.acknowledged` | 반대 의견 인정 | `{ consensusId, dissent }` |
| `consensus.revote.requested` | 재투표 요청 | `{ consensusId, reason }` |

### 6. 테스트 케이스

#### 6.1 다수결 합의 테스트

```typescript
describe('ConsensusEngine majority consensus', () => {
  let engine: ConsensusEngine;
  let votingManager: VotingManager;

  beforeEach(() => {
    const eventBus = createMockEventBus();
    votingManager = new VotingManager(eventBus);
    engine = new ConsensusEngine({ eventBus, votingManager });
  });

  it('should reach consensus when majority approves', () => {
    const session = createMockVotingSession({
      method: VotingMethod.MAJORITY,
      votes: [
        { voterId: 'a', choice: VoteChoice.APPROVE },
        { voterId: 'b', choice: VoteChoice.APPROVE },
        { voterId: 'c', choice: VoteChoice.APPROVE },
        { voterId: 'd', choice: VoteChoice.REJECT },
        { voterId: 'e', choice: VoteChoice.REJECT }
      ]
    });

    const result = engine.evaluate({ sessionId: session.id });

    expect(result.status).toBe(ConsensusStatus.REACHED);
    expect(result.type).toBe(ConsensusType.MAJORITY);
    expect(result.decision.outcome).toBe('approved');
  });

  it('should fail consensus when majority rejects', () => {
    const session = createMockVotingSession({
      method: VotingMethod.MAJORITY,
      votes: [
        { voterId: 'a', choice: VoteChoice.REJECT },
        { voterId: 'b', choice: VoteChoice.REJECT },
        { voterId: 'c', choice: VoteChoice.REJECT },
        { voterId: 'd', choice: VoteChoice.APPROVE }
      ]
    });

    const result = engine.evaluate({ sessionId: session.id });

    expect(result.status).toBe(ConsensusStatus.REACHED);
    expect(result.decision.outcome).toBe('rejected');
  });

  it('should handle tied votes with escalation', () => {
    const session = createMockVotingSession({
      method: VotingMethod.MAJORITY,
      votes: [
        { voterId: 'a', choice: VoteChoice.APPROVE },
        { voterId: 'b', choice: VoteChoice.APPROVE },
        { voterId: 'c', choice: VoteChoice.REJECT },
        { voterId: 'd', choice: VoteChoice.REJECT }
      ]
    });

    const result = engine.evaluate({
      sessionId: session.id,
      rules: { autoEscalateOnTie: true }
    });

    expect(result.status).toBe(ConsensusStatus.ESCALATED);
    expect(result.escalation?.level).toBe(EscalationLevel.MEDIATION);
  });
});
```

#### 6.2 만장일치 합의 테스트

```typescript
describe('ConsensusEngine unanimous consensus', () => {
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = createConsensusEngine();
  });

  it('should reach full consensus when all approve', () => {
    const session = createMockVotingSession({
      method: VotingMethod.UNANIMOUS,
      votes: [
        { voterId: 'a', choice: VoteChoice.APPROVE },
        { voterId: 'b', choice: VoteChoice.APPROVE },
        { voterId: 'c', choice: VoteChoice.APPROVE }
      ]
    });

    const result = engine.evaluate({ sessionId: session.id });

    expect(result.status).toBe(ConsensusStatus.REACHED);
    expect(result.type).toBe(ConsensusType.FULL);
  });

  it('should fail when any rejects', () => {
    const session = createMockVotingSession({
      method: VotingMethod.UNANIMOUS,
      votes: [
        { voterId: 'a', choice: VoteChoice.APPROVE },
        { voterId: 'b', choice: VoteChoice.APPROVE },
        { voterId: 'c', choice: VoteChoice.REJECT, reason: '리스크가 너무 큼' }
      ]
    });

    const result = engine.evaluate({ sessionId: session.id });

    expect(result.status).toBe(ConsensusStatus.FAILED);
    expect(result.dissent).toHaveLength(1);
    expect(result.dissent![0].voterId).toBe('c');
  });

  it('should handle abstain in unanimous voting', () => {
    const session = createMockVotingSession({
      method: VotingMethod.UNANIMOUS,
      votes: [
        { voterId: 'a', choice: VoteChoice.APPROVE },
        { voterId: 'b', choice: VoteChoice.APPROVE },
        { voterId: 'c', choice: VoteChoice.ABSTAIN }
      ]
    });

    const result = engine.evaluate({ sessionId: session.id });

    expect(result.status).toBe(ConsensusStatus.REACHED);
    expect(result.type).toBe(ConsensusType.FULL);
  });
});
```

#### 6.3 조건부 합의 테스트

```typescript
describe('ConsensusEngine conditional consensus', () => {
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = createConsensusEngine();
  });

  it('should create conditional consensus', () => {
    const session = createMockVotingSession({
      method: VotingMethod.MAJORITY,
      votes: [
        { voterId: 'a', choice: VoteChoice.APPROVE },
        { voterId: 'b', choice: VoteChoice.CONDITIONAL, conditions: ['기술실사 완료'] },
        { voterId: 'c', choice: VoteChoice.CONDITIONAL, conditions: ['법무검토 통과'] }
      ]
    });

    const result = engine.evaluate({ sessionId: session.id });

    expect(result.status).toBe(ConsensusStatus.CONDITIONAL);
    expect(result.conditions).toHaveLength(2);
    expect(result.conditions![0].status).toBe('pending');
  });

  it('should verify conditions', () => {
    const result = createConditionalConsensusResult();
    const clauseId = result.conditions![0].id;

    const verifiedClause = engine.verifyCondition(
      result.id,
      clauseId,
      true,
      'verifier-1'
    );

    expect(verifiedClause.status).toBe('met');
    expect(verifiedClause.verifier).toBe('verifier-1');
  });

  it('should finalize when all conditions met', () => {
    const result = createConditionalConsensusResult();
    
    // 모든 조건 충족
    for (const clause of result.conditions!) {
      engine.verifyCondition(result.id, clause.id, true, 'verifier');
    }

    const finalized = engine.finalizeConditionalConsensus(result.id);

    expect(finalized.status).toBe(ConsensusStatus.REACHED);
    expect(finalized.decision.outcome).toBe('approved');
  });

  it('should fail when required condition not met', () => {
    const result = createConditionalConsensusResult();
    
    // 필수 조건 실패
    engine.verifyCondition(
      result.id,
      result.conditions![0].id,
      false,
      'verifier'
    );

    const finalized = engine.finalizeConditionalConsensus(result.id);

    expect(finalized.status).toBe(ConsensusStatus.FAILED);
    expect(finalized.decision.outcome).toBe('rejected');
  });
});
```

#### 6.4 에스컬레이션 테스트

```typescript
describe('ConsensusEngine escalation', () => {
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = createConsensusEngine();
  });

  it('should escalate on failure', () => {
    const failedResult = createFailedConsensusResult();

    const escalated = engine.escalate(
      failedResult.id,
      EscalationLevel.DISCUSSION,
      '추가 토론 필요',
      'chairman'
    );

    expect(escalated.level).toBe(EscalationLevel.DISCUSSION);
    expect(escalated.escalatedTo).toBe('chairman');
  });

  it('should resolve escalation', () => {
    const escalatedResult = createEscalatedConsensusResult();

    const resolved = engine.resolveEscalation(
      escalatedResult.id,
      '회장 결정으로 승인'
    );

    expect(resolved.status).toBe(ConsensusStatus.REACHED);
    expect(resolved.escalation?.resolution).toBe('회장 결정으로 승인');
  });

  it('should determine escalation level based on attempts', () => {
    const result = createMockVotingResult({ tied: true });

    const level1 = engine.determineEscalationLevel(result, 1);
    expect(level1).toBe(EscalationLevel.DISCUSSION);

    const level2 = engine.determineEscalationLevel(result, 2);
    expect(level2).toBe(EscalationLevel.MEDIATION);

    const level3 = engine.determineEscalationLevel(result, 3);
    expect(level3).toBe(EscalationLevel.DEADLOCK);
  });
});
```

#### 6.5 재투표 테스트

```typescript
describe('ConsensusEngine revote', () => {
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = createConsensusEngine({
      defaultRules: { maxAttempts: 3 }
    });
  });

  it('should allow revote after failure', () => {
    const failedResult = createFailedConsensusResult({ attempts: 1 });

    expect(engine.canRequestRevote(failedResult.id)).toBe(true);

    const newSession = engine.requestRevote(failedResult.id, '재검토 요청');

    expect(newSession).toBeDefined();
    expect(newSession.agendaId).toBe(failedResult.agendaId);
  });

  it('should track remaining attempts', () => {
    const result = createFailedConsensusResult({ attempts: 2 });

    expect(engine.getRemainingAttempts(result.id)).toBe(1);
  });

  it('should deny revote when max attempts reached', () => {
    const result = createFailedConsensusResult({ attempts: 3 });

    expect(engine.canRequestRevote(result.id)).toBe(false);
  });

  it('should enforce cooldown between attempts', async () => {
    const result = createFailedConsensusResult({ attempts: 1 });

    engine.requestRevote(result.id, '첫 번째 재투표');

    // 쿨다운 내에서 재시도
    expect(() => {
      engine.requestRevote(result.id, '두 번째 재투표');
    }).toThrow('COOLDOWN_NOT_EXPIRED');
  });
});
```

#### 6.6 반대 의견 처리 테스트

```typescript
describe('ConsensusEngine dissent handling', () => {
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = createConsensusEngine();
  });

  it('should record dissent', () => {
    const result = createConsensusResult();

    const dissent = engine.recordDissent(result.id, {
      voterId: 'cfo',
      reason: '재정적 리스크가 너무 큼',
      severity: 'major'
    });

    expect(dissent.acknowledged).toBe(false);
    expect(result.dissent).toContainEqual(dissent);
  });

  it('should acknowledge dissent', () => {
    const result = createResultWithDissent();

    const acknowledged = engine.acknowledgeDissent(
      result.id,
      'cfo',
      '리스크 완화 조치 포함'
    );

    expect(acknowledged.acknowledged).toBe(true);
    expect(acknowledged.response).toBe('리스크 완화 조치 포함');
  });

  it('should list unacknowledged dissents', () => {
    const result = createResultWithMultipleDissents();

    engine.acknowledgeDissent(result.id, 'cfo');

    const unacknowledged = engine.getUnacknowledgedDissents(result.id);

    expect(unacknowledged).toHaveLength(1);
    expect(unacknowledged[0].voterId).not.toBe('cfo');
  });

  it('should require dissent acknowledgment when rule enabled', () => {
    const rules: ConsensusRules = {
      ...defaultRules,
      requireDissentAcknowledgment: true
    };

    const result = createResultWithDissent();

    expect(() => {
      engine.finalizeConsensus(result.id, rules);
    }).toThrow('UNACKNOWLEDGED_DISSENT');
  });
});
```

### 7. 파일 구조

```
packages/board/
├── src/
│   ├── consensus/
│   │   ├── ConsensusEngine.ts
│   │   ├── ConditionalConsensusHandler.ts
│   │   ├── EscalationHandler.ts
│   │   ├── algorithms/
│   │   │   ├── majority.ts
│   │   │   ├── supermajority.ts
│   │   │   ├── unanimous.ts
│   │   │   ├── weighted.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   └── types/
│       └── consensus.ts
└── test/
    └── consensus/
        ├── ConsensusEngine.test.ts
        ├── ConditionalConsensusHandler.test.ts
        ├── EscalationHandler.test.ts
        └── algorithms/
            ├── majority.test.ts
            ├── unanimous.test.ts
            └── weighted.test.ts
```

### 8. 완료 조건

- [ ] ConsensusEngine 클래스 구현 완료
- [ ] 다수결 합의 알고리즘 구현 완료
- [ ] 2/3 다수결 합의 알고리즘 구현 완료
- [ ] 만장일치 합의 알고리즘 구현 완료
- [ ] 가중치 합의 알고리즘 구현 완료
- [ ] 조건부 합의 처리 구현 완료
- [ ] 에스컬레이션 처리 구현 완료
- [ ] 재투표 메커니즘 구현 완료
- [ ] 반대 의견 처리 구현 완료
- [ ] 이벤트 발행 구현 완료
- [ ] 테스트 커버리지 80% 이상
- [ ] pnpm test 성공

### 9. 의존성

- TASK-037 (VotingManager, VotingSession)
- @obora-kit/core 패키지 (EventBus)

### 10. 참고 문서

- [Blackboard Actor Design](../../architecture/blackboard-actor-design.md)
- [AI 이사회 의사결정 흐름](../../architecture/blackboard-actor-design.md#4-ai-이사회-의사결정-흐름)
