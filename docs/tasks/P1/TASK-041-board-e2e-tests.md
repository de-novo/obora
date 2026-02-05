# TASK-041: @obora-kit/board E2E 테스트

## 개요
- **상태**: 📋 대기
- 우선순위: P1
- 예상 소요: 8시간
- 담당: 개발자

## 목표
AI 이사회 시스템의 전체 흐름을 검증하는 E2E 테스트를 작성합니다. 정상 흐름, 합의 실패 시나리오, 타임아웃, 에러 상황 등을 포괄적으로 테스트합니다.

## 작업 내용

### 1. 테스트 파일 구조

```
packages/board/
└── test/
    └── e2e/
        ├── full-flow.test.ts           # 전체 흐름 테스트
        ├── consensus-failure.test.ts   # 합의 실패 시나리오
        ├── timeout-scenarios.test.ts   # 타임아웃 테스트
        ├── edge-cases.test.ts          # 엣지 케이스
        ├── error-recovery.test.ts      # 에러 복구 테스트
        ├── concurrent-sessions.test.ts # 동시 세션 테스트
        └── helpers/
            ├── board-factory.ts        # 테스트용 Board 생성
            ├── mock-participants.ts    # 모의 참가자
            └── scenario-runner.ts      # 시나리오 실행기
```

### 2. 테스트 헬퍼 구현

#### 2.1 board-factory.ts

```typescript
// test/e2e/helpers/board-factory.ts

import { Board, BoardOptions } from '../../../src/Board.js';
import { EventBus } from '@obora-kit/core';
import type { StateTimeouts } from '../../../src/types/state-machine.js';

export interface TestBoardOptions {
  participants?: string[];
  quorumPercentage?: number;
  timeouts?: Partial<StateTimeouts>;
  autoMarkPresent?: boolean;
}

export function createTestBoard(options: TestBoardOptions = {}): {
  board: Board;
  eventBus: EventBus;
  events: BoardEventLog;
} {
  const eventBus = new EventBus();
  const events = new BoardEventLog(eventBus);

  const board = new Board({
    eventBus,
    participants: options.participants || ['ceo', 'cto', 'cfo'],
    quorumPercentage: options.quorumPercentage || 0.5,
    stateTimeouts: {
      agendaSetting: 10000,
      discussion: 30000,
      debate: 15000,
      voting: 5000,
      tallying: 1000,
      ...options.timeouts
    }
  });

  if (options.autoMarkPresent !== false) {
    const participants = options.participants || ['ceo', 'cto', 'cfo'];
    for (const p of participants) {
      board.stateMachine.markPresent(p);
    }
  }

  return { board, eventBus, events };
}

export class BoardEventLog {
  private logs: Array<{ event: string; payload: unknown; timestamp: Date }> = [];

  constructor(eventBus: EventBus) {
    eventBus.onAny((event, payload) => {
      this.logs.push({ event, payload, timestamp: new Date() });
    });
  }

  getAll(): typeof this.logs {
    return [...this.logs];
  }

  filter(pattern: string | RegExp): typeof this.logs {
    return this.logs.filter(log =>
      typeof pattern === 'string'
        ? log.event.includes(pattern)
        : pattern.test(log.event)
    );
  }

  has(event: string): boolean {
    return this.logs.some(log => log.event === event);
  }

  clear(): void {
    this.logs = [];
  }
}
```

#### 2.2 mock-participants.ts

```typescript
// test/e2e/helpers/mock-participants.ts

import type { Board } from '../../../src/Board.js';
import { VoteChoice } from '../../../src/types/voting.js';

export interface MockParticipant {
  id: string;
  role: 'director' | 'chairman' | 'secretary';
  votingBehavior: VotingBehavior;
  speakingPriority: number;
}

export type VotingBehavior =
  | { type: 'always_approve' }
  | { type: 'always_reject'; reason: string }
  | { type: 'random'; approveChance: number }
  | { type: 'conditional'; conditions: string[] }
  | { type: 'follow_majority' }
  | { type: 'abstain' };

export class MockParticipantManager {
  private participants: Map<string, MockParticipant> = new Map();

  register(participant: MockParticipant): void {
    this.participants.set(participant.id, participant);
  }

  registerMany(participants: MockParticipant[]): void {
    for (const p of participants) {
      this.register(p);
    }
  }

  /**
   * 참가자의 투표 행동에 따라 투표 제출
   */
  async submitVote(
    board: Board,
    sessionId: string,
    participantId: string
  ): Promise<void> {
    const participant = this.participants.get(participantId);
    if (!participant) {
      throw new Error(`Unknown participant: ${participantId}`);
    }

    const choice = this.determineVoteChoice(participant.votingBehavior);

    board.votingManager.submitVote(sessionId, {
      voterId: participantId,
      choice: choice.choice,
      reason: choice.reason,
      conditions: choice.conditions
    });
  }

  /**
   * 모든 참가자가 투표
   */
  async submitAllVotes(board: Board, sessionId: string): Promise<void> {
    for (const [id] of this.participants) {
      await this.submitVote(board, sessionId, id);
    }
  }

  private determineVoteChoice(behavior: VotingBehavior): {
    choice: VoteChoice;
    reason?: string;
    conditions?: string[];
  } {
    switch (behavior.type) {
      case 'always_approve':
        return { choice: VoteChoice.APPROVE };
      case 'always_reject':
        return { choice: VoteChoice.REJECT, reason: behavior.reason };
      case 'random':
        return {
          choice: Math.random() < behavior.approveChance
            ? VoteChoice.APPROVE
            : VoteChoice.REJECT
        };
      case 'conditional':
        return {
          choice: VoteChoice.CONDITIONAL,
          conditions: behavior.conditions
        };
      case 'abstain':
        return { choice: VoteChoice.ABSTAIN };
      case 'follow_majority':
        // 실제 구현에서는 현재 투표 현황을 확인
        return { choice: VoteChoice.APPROVE };
    }
  }
}

// 미리 정의된 참가자 세트
export const DEFAULT_PARTICIPANTS: MockParticipant[] = [
  {
    id: 'ceo',
    role: 'chairman',
    votingBehavior: { type: 'always_approve' },
    speakingPriority: 1
  },
  {
    id: 'cto',
    role: 'director',
    votingBehavior: { type: 'conditional', conditions: ['기술 실사 완료'] },
    speakingPriority: 2
  },
  {
    id: 'cfo',
    role: 'director',
    votingBehavior: { type: 'always_reject', reason: '재정적 리스크' },
    speakingPriority: 3
  }
];

export const UNANIMOUS_APPROVE_PARTICIPANTS: MockParticipant[] = [
  { id: 'a', role: 'director', votingBehavior: { type: 'always_approve' }, speakingPriority: 1 },
  { id: 'b', role: 'director', votingBehavior: { type: 'always_approve' }, speakingPriority: 2 },
  { id: 'c', role: 'director', votingBehavior: { type: 'always_approve' }, speakingPriority: 3 }
];

export const TIED_PARTICIPANTS: MockParticipant[] = [
  { id: 'a', role: 'director', votingBehavior: { type: 'always_approve' }, speakingPriority: 1 },
  { id: 'b', role: 'director', votingBehavior: { type: 'always_approve' }, speakingPriority: 2 },
  { id: 'c', role: 'director', votingBehavior: { type: 'always_reject', reason: '반대' }, speakingPriority: 3 },
  { id: 'd', role: 'director', votingBehavior: { type: 'always_reject', reason: '반대' }, speakingPriority: 4 }
];
```

#### 2.3 scenario-runner.ts

```typescript
// test/e2e/helpers/scenario-runner.ts

import type { Board } from '../../../src/Board.js';
import { BoardEvent, BoardState } from '../../../src/types/state-machine.js';

export interface ScenarioStep {
  action: 'send' | 'submitAgenda' | 'speak' | 'vote' | 'wait' | 'assert';
  params: Record<string, unknown>;
}

export interface Scenario {
  name: string;
  description?: string;
  steps: ScenarioStep[];
  expectedFinalState: BoardState;
}

export class ScenarioRunner {
  private board: Board;
  private clock?: FakeTimers;

  constructor(board: Board, useFakeTimers = true) {
    this.board = board;
    if (useFakeTimers) {
      this.clock = vi.useFakeTimers();
    }
  }

  async run(scenario: Scenario): Promise<ScenarioResult> {
    const result: ScenarioResult = {
      scenario: scenario.name,
      steps: [],
      success: false,
      finalState: this.board.state
    };

    try {
      for (const step of scenario.steps) {
        const stepResult = await this.executeStep(step);
        result.steps.push(stepResult);

        if (!stepResult.success) {
          break;
        }
      }

      result.finalState = this.board.state;
      result.success = this.board.state === scenario.expectedFinalState;
    } catch (error) {
      result.error = error as Error;
    }

    return result;
  }

  private async executeStep(step: ScenarioStep): Promise<StepResult> {
    const startTime = Date.now();

    try {
      switch (step.action) {
        case 'send':
          this.board.send(step.params.event as BoardEvent, step.params.payload);
          break;

        case 'submitAgenda':
          this.board.submitAgenda(step.params as any);
          break;

        case 'speak':
          this.board.stateMachine.requestToSpeak(step.params.participantId as string);
          this.board.stateMachine.grantSpeaker(step.params.participantId as string);
          if (step.params.endImmediately) {
            this.board.stateMachine.endCurrentSpeaker();
          }
          break;

        case 'vote':
          this.board.votingManager.submitVote(
            step.params.sessionId as string,
            step.params as any
          );
          break;

        case 'wait':
          if (this.clock) {
            this.clock.advanceTimersByTime(step.params.ms as number);
          } else {
            await new Promise(r => setTimeout(r, step.params.ms as number));
          }
          break;

        case 'assert':
          const actual = this.getValueByPath(step.params.path as string);
          if (actual !== step.params.expected) {
            throw new Error(
              `Assertion failed: expected ${step.params.expected}, got ${actual}`
            );
          }
          break;
      }

      return {
        action: step.action,
        success: true,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        action: step.action,
        success: false,
        duration: Date.now() - startTime,
        error: error as Error
      };
    }
  }

  private getValueByPath(path: string): unknown {
    const parts = path.split('.');
    let value: any = this.board;
    for (const part of parts) {
      value = value[part];
    }
    return value;
  }

  cleanup(): void {
    if (this.clock) {
      vi.useRealTimers();
    }
  }
}

export interface ScenarioResult {
  scenario: string;
  steps: StepResult[];
  success: boolean;
  finalState: BoardState;
  error?: Error;
}

export interface StepResult {
  action: string;
  success: boolean;
  duration: number;
  error?: Error;
}
```

### 3. 전체 흐름 테스트

```typescript
// test/e2e/full-flow.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestBoard, BoardEventLog } from './helpers/board-factory.js';
import { MockParticipantManager, UNANIMOUS_APPROVE_PARTICIPANTS } from './helpers/mock-participants.js';
import { BoardState, BoardEvent } from '../../src/types/state-machine.js';
import { VotingMethod, VoteChoice } from '../../src/types/voting.js';
import { ConsensusStatus } from '../../src/types/consensus.js';

describe('Board E2E: Full Flow', () => {
  let board: ReturnType<typeof createTestBoard>['board'];
  let events: BoardEventLog;

  beforeEach(() => {
    vi.useFakeTimers();
    const testBoard = createTestBoard({
      participants: ['ceo', 'cto', 'cfo'],
      timeouts: {
        agendaSetting: 60000,
        discussion: 120000,
        voting: 30000
      }
    });
    board = testBoard.board;
    events = testBoard.events;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should complete full meeting flow with approval', async () => {
    // 1. 회의 시작
    board.start();
    expect(board.state).toBe(BoardState.AGENDA_SETTING);
    expect(events.has('board.session.started')).toBe(true);

    // 2. 안건 제출 및 확정
    const agenda = board.submitAgenda({
      title: '신규 프로젝트 승인',
      description: '2026년 Q2 출시 예정 신규 프로젝트 승인 요청',
      proposer: 'ceo',
      votingMethod: VotingMethod.MAJORITY
    });
    expect(agenda.id).toBeDefined();

    board.send(BoardEvent.CONFIRM_AGENDA);
    expect(board.state).toBe(BoardState.DISCUSSION);

    // 3. 토론 진행
    board.stateMachine.requestToSpeak('ceo', 'ROI 분석');
    board.stateMachine.grantSpeaker('ceo');
    board.stateMachine.endCurrentSpeaker();

    board.stateMachine.requestToSpeak('cto', '기술 검토');
    board.stateMachine.grantSpeaker('cto');
    board.stateMachine.endCurrentSpeaker();

    // 4. 투표 요청
    board.send(BoardEvent.CALL_VOTE);
    expect(board.state).toBe(BoardState.VOTING);

    // 5. 투표 제출
    const sessionId = board.context.currentVotingSessionId!;
    board.votingManager.submitVote(sessionId, {
      voterId: 'ceo',
      choice: VoteChoice.APPROVE,
      reason: 'ROI가 좋음'
    });
    board.votingManager.submitVote(sessionId, {
      voterId: 'cto',
      choice: VoteChoice.APPROVE,
      reason: '기술적으로 실현 가능'
    });
    board.votingManager.submitVote(sessionId, {
      voterId: 'cfo',
      choice: VoteChoice.REJECT,
      reason: '예산 초과 우려'
    });

    // 6. 투표 완료 및 집계
    board.send(BoardEvent.COMPLETE_VOTING);
    expect(board.state).toBe(BoardState.TALLYING);

    // 7. 결과 발표
    board.send(BoardEvent.ANNOUNCE_RESULT);
    expect(board.state).toBe(BoardState.RESOLVED);

    // 8. 결과 확인
    const result = board.consensusEngine.getResultByAgenda(agenda.id);
    expect(result).toBeDefined();
    expect(result!.status).toBe(ConsensusStatus.REACHED);
    expect(result!.decision.outcome).toBe('approved');

    // 9. 회의 종료
    board.send(BoardEvent.ADJOURN);
    expect(board.state).toBe(BoardState.ADJOURNED);

    const session = board.end();
    expect(session.results).toHaveLength(1);
    expect(events.has('board.session.ended')).toBe(true);
  });

  it('should handle multiple agendas in one session', async () => {
    board.start();

    // 첫 번째 안건
    const agenda1 = board.submitAgenda({
      title: '안건 1',
      description: '첫 번째 안건',
      proposer: 'ceo'
    });

    board.send(BoardEvent.CONFIRM_AGENDA);
    simulateSpeaker(board, 'ceo');
    board.send(BoardEvent.CALL_VOTE);

    const session1 = board.context.currentVotingSessionId!;
    submitAllApprove(board, session1, ['ceo', 'cto', 'cfo']);

    board.send(BoardEvent.COMPLETE_VOTING);
    board.send(BoardEvent.ANNOUNCE_RESULT);

    expect(board.state).toBe(BoardState.RESOLVED);

    // 두 번째 안건으로 이동
    const agenda2 = board.submitAgenda({
      title: '안건 2',
      description: '두 번째 안건',
      proposer: 'cto'
    });

    board.send(BoardEvent.CONFIRM_AGENDA);
    expect(board.state).toBe(BoardState.DISCUSSION);
    expect(board.context.currentAgendaId).toBe(agenda2.id);

    simulateSpeaker(board, 'cto');
    board.send(BoardEvent.CALL_VOTE);

    const session2 = board.context.currentVotingSessionId!;
    submitAllApprove(board, session2, ['ceo', 'cto', 'cfo']);

    board.send(BoardEvent.COMPLETE_VOTING);
    board.send(BoardEvent.ANNOUNCE_RESULT);

    // 두 안건 모두 처리 완료
    const session = board.end();
    expect(session.agendas).toHaveLength(2);
    expect(session.results).toHaveLength(2);
  });

  it('should handle debate and return to discussion', async () => {
    board.start();
    board.submitAgenda({
      title: '논쟁적 안건',
      description: '토론이 필요한 안건',
      proposer: 'ceo'
    });

    board.send(BoardEvent.CONFIRM_AGENDA);

    // 첫 번째 발언
    simulateSpeaker(board, 'ceo');

    // 반론 요청
    board.send(BoardEvent.REQUEST_DEBATE);
    expect(board.state).toBe(BoardState.DEBATE);

    // 반론 진행
    simulateSpeaker(board, 'cfo');

    // 토론으로 복귀
    board.send(BoardEvent.END_DEBATE);
    expect(board.state).toBe(BoardState.DISCUSSION);

    // 추가 토론
    simulateSpeaker(board, 'cto');

    // 최종 투표로 이동
    board.send(BoardEvent.CALL_VOTE);
    expect(board.state).toBe(BoardState.VOTING);
  });
});

// 헬퍼 함수
function simulateSpeaker(board: ReturnType<typeof createTestBoard>['board'], participantId: string): void {
  board.stateMachine.requestToSpeak(participantId);
  board.stateMachine.grantSpeaker(participantId);
  board.stateMachine.endCurrentSpeaker();
}

function submitAllApprove(
  board: ReturnType<typeof createTestBoard>['board'],
  sessionId: string,
  voters: string[]
): void {
  for (const voter of voters) {
    board.votingManager.submitVote(sessionId, {
      voterId: voter,
      choice: VoteChoice.APPROVE
    });
  }
}
```

### 4. 합의 실패 시나리오 테스트

```typescript
// test/e2e/consensus-failure.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestBoard } from './helpers/board-factory.js';
import { BoardState, BoardEvent } from '../../src/types/state-machine.js';
import { VotingMethod, VoteChoice, VotingResult } from '../../src/types/voting.js';
import { ConsensusStatus, EscalationLevel } from '../../src/types/consensus.js';

describe('Board E2E: Consensus Failure Scenarios', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Majority Rejection', () => {
    it('should reject when majority votes against', async () => {
      const { board } = createTestBoard({
        participants: ['a', 'b', 'c', 'd', 'e']
      });

      board.start();
      const agenda = board.submitAgenda({
        title: '거부될 안건',
        description: '다수가 반대할 안건',
        proposer: 'a'
      });

      board.send(BoardEvent.CONFIRM_AGENDA);
      simulateSpeaker(board, 'a');
      board.send(BoardEvent.CALL_VOTE);

      const sessionId = board.context.currentVotingSessionId!;

      // 3명 반대, 2명 찬성
      board.votingManager.submitVote(sessionId, { voterId: 'a', choice: VoteChoice.APPROVE });
      board.votingManager.submitVote(sessionId, { voterId: 'b', choice: VoteChoice.APPROVE });
      board.votingManager.submitVote(sessionId, { voterId: 'c', choice: VoteChoice.REJECT });
      board.votingManager.submitVote(sessionId, { voterId: 'd', choice: VoteChoice.REJECT });
      board.votingManager.submitVote(sessionId, { voterId: 'e', choice: VoteChoice.REJECT });

      board.send(BoardEvent.COMPLETE_VOTING);
      board.send(BoardEvent.ANNOUNCE_RESULT);

      const result = board.consensusEngine.getResultByAgenda(agenda.id);
      expect(result!.decision.outcome).toBe('rejected');
    });
  });

  describe('Unanimous Failure', () => {
    it('should fail unanimous vote with single rejection', async () => {
      const { board } = createTestBoard({
        participants: ['a', 'b', 'c']
      });

      board.start();
      const agenda = board.submitAgenda({
        title: '만장일치 필요 안건',
        description: '모든 이사의 동의 필요',
        proposer: 'a',
        votingMethod: VotingMethod.UNANIMOUS
      });

      board.send(BoardEvent.CONFIRM_AGENDA);
      simulateSpeaker(board, 'a');
      board.send(BoardEvent.CALL_VOTE);

      const sessionId = board.context.currentVotingSessionId!;

      board.votingManager.submitVote(sessionId, { voterId: 'a', choice: VoteChoice.APPROVE });
      board.votingManager.submitVote(sessionId, { voterId: 'b', choice: VoteChoice.APPROVE });
      board.votingManager.submitVote(sessionId, {
        voterId: 'c',
        choice: VoteChoice.REJECT,
        reason: '리스크가 너무 큼'
      });

      board.send(BoardEvent.COMPLETE_VOTING);
      board.send(BoardEvent.ANNOUNCE_RESULT);

      const result = board.consensusEngine.getResultByAgenda(agenda.id);
      expect(result!.status).toBe(ConsensusStatus.FAILED);
      expect(result!.dissent).toHaveLength(1);
      expect(result!.dissent![0].voterId).toBe('c');
    });
  });

  describe('Tied Vote', () => {
    it('should handle tied vote with escalation', async () => {
      const { board } = createTestBoard({
        participants: ['a', 'b', 'c', 'd']
      });

      board.start();
      const agenda = board.submitAgenda({
        title: '동률 발생 안건',
        description: '2:2 동률 예상',
        proposer: 'a'
      });

      board.send(BoardEvent.CONFIRM_AGENDA);
      simulateSpeaker(board, 'a');
      board.send(BoardEvent.CALL_VOTE);

      const sessionId = board.context.currentVotingSessionId!;

      board.votingManager.submitVote(sessionId, { voterId: 'a', choice: VoteChoice.APPROVE });
      board.votingManager.submitVote(sessionId, { voterId: 'b', choice: VoteChoice.APPROVE });
      board.votingManager.submitVote(sessionId, { voterId: 'c', choice: VoteChoice.REJECT });
      board.votingManager.submitVote(sessionId, { voterId: 'd', choice: VoteChoice.REJECT });

      board.send(BoardEvent.COMPLETE_VOTING);
      board.send(BoardEvent.ANNOUNCE_RESULT);

      const result = board.consensusEngine.getResultByAgenda(agenda.id);
      expect(result!.status).toBe(ConsensusStatus.ESCALATED);
      expect(result!.escalation?.level).toBe(EscalationLevel.MEDIATION);
    });
  });

  describe('Quorum Failure', () => {
    it('should fail when quorum not met', async () => {
      const { board } = createTestBoard({
        participants: ['a', 'b', 'c', 'd', 'e'],
        quorumPercentage: 0.6
      });

      board.start();
      const agenda = board.submitAgenda({
        title: '정족수 미달 안건',
        description: '투표 참여 부족',
        proposer: 'a'
      });

      board.send(BoardEvent.CONFIRM_AGENDA);
      simulateSpeaker(board, 'a');
      board.send(BoardEvent.CALL_VOTE);

      const sessionId = board.context.currentVotingSessionId!;

      // 5명 중 2명만 투표 (정족수 60% = 3명 필요)
      board.votingManager.submitVote(sessionId, { voterId: 'a', choice: VoteChoice.APPROVE });
      board.votingManager.submitVote(sessionId, { voterId: 'b', choice: VoteChoice.APPROVE });

      board.send(BoardEvent.COMPLETE_VOTING);

      const votingResult = board.votingManager.getResult(sessionId);
      expect(votingResult!.result).toBe(VotingResult.INSUFFICIENT_QUORUM);
    });
  });

  describe('Conditional Consensus Failure', () => {
    it('should fail when conditions are not met', async () => {
      const { board } = createTestBoard({
        participants: ['a', 'b', 'c']
      });

      board.start();
      const agenda = board.submitAgenda({
        title: '조건부 합의 안건',
        description: '조건 충족 필요',
        proposer: 'a'
      });

      board.send(BoardEvent.CONFIRM_AGENDA);
      simulateSpeaker(board, 'a');
      board.send(BoardEvent.CALL_VOTE);

      const sessionId = board.context.currentVotingSessionId!;

      board.votingManager.submitVote(sessionId, { voterId: 'a', choice: VoteChoice.APPROVE });
      board.votingManager.submitVote(sessionId, {
        voterId: 'b',
        choice: VoteChoice.CONDITIONAL,
        conditions: ['기술 실사 완료']
      });
      board.votingManager.submitVote(sessionId, { voterId: 'c', choice: VoteChoice.APPROVE });

      board.send(BoardEvent.COMPLETE_VOTING);
      board.send(BoardEvent.ANNOUNCE_RESULT);

      const result = board.consensusEngine.getResultByAgenda(agenda.id);
      expect(result!.status).toBe(ConsensusStatus.CONDITIONAL);
      expect(result!.conditions).toHaveLength(1);

      // 조건 검증 실패
      board.consensusEngine.verifyCondition(
        result!.id,
        result!.conditions![0].id,
        false,
        'verifier'
      );

      const finalized = board.consensusEngine.finalizeConditionalConsensus(result!.id);
      expect(finalized.status).toBe(ConsensusStatus.FAILED);
    });
  });

  describe('Escalation and Resolution', () => {
    it('should resolve escalation with external decision', async () => {
      const { board } = createTestBoard({
        participants: ['a', 'b', 'c', 'd']
      });

      board.start();
      const agenda = board.submitAgenda({
        title: '에스컬레이션 필요 안건',
        description: '외부 결정 필요',
        proposer: 'a'
      });

      board.send(BoardEvent.CONFIRM_AGENDA);
      simulateSpeaker(board, 'a');
      board.send(BoardEvent.CALL_VOTE);

      const sessionId = board.context.currentVotingSessionId!;

      // 동률 발생
      board.votingManager.submitVote(sessionId, { voterId: 'a', choice: VoteChoice.APPROVE });
      board.votingManager.submitVote(sessionId, { voterId: 'b', choice: VoteChoice.APPROVE });
      board.votingManager.submitVote(sessionId, { voterId: 'c', choice: VoteChoice.REJECT });
      board.votingManager.submitVote(sessionId, { voterId: 'd', choice: VoteChoice.REJECT });

      board.send(BoardEvent.COMPLETE_VOTING);
      board.send(BoardEvent.ANNOUNCE_RESULT);

      // 에스컬레이션 상태 확인
      const result = board.consensusEngine.getResultByAgenda(agenda.id);
      expect(result!.status).toBe(ConsensusStatus.ESCALATED);

      // 외부 결정으로 해결
      const resolved = board.consensusEngine.resolveEscalation(
        result!.id,
        '회장 결정으로 승인'
      );

      expect(resolved.status).toBe(ConsensusStatus.REACHED);
      expect(resolved.decision.outcome).toBe('approved');
    });
  });
});

function simulateSpeaker(board: any, participantId: string): void {
  board.stateMachine.requestToSpeak(participantId);
  board.stateMachine.grantSpeaker(participantId);
  board.stateMachine.endCurrentSpeaker();
}
```

### 5. 타임아웃 시나리오 테스트

```typescript
// test/e2e/timeout-scenarios.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestBoard } from './helpers/board-factory.js';
import { BoardState, BoardEvent } from '../../src/types/state-machine.js';
import { VoteChoice } from '../../src/types/voting.js';

describe('Board E2E: Timeout Scenarios', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Agenda Setting Timeout', () => {
    it('should adjourn when no agenda confirmed', () => {
      const { board } = createTestBoard({
        timeouts: { agendaSetting: 1000 }
      });

      board.start();
      expect(board.state).toBe(BoardState.AGENDA_SETTING);

      // 타임아웃 발생
      vi.advanceTimersByTime(1001);

      expect(board.state).toBe(BoardState.ADJOURNED);
    });
  });

  describe('Discussion Timeout', () => {
    it('should automatically move to voting after discussion timeout', () => {
      const { board } = createTestBoard({
        timeouts: { discussion: 2000 }
      });

      board.start();
      board.submitAgenda({
        title: '토론 타임아웃 테스트',
        description: '테스트',
        proposer: 'ceo'
      });
      board.send(BoardEvent.CONFIRM_AGENDA);

      expect(board.state).toBe(BoardState.DISCUSSION);

      // 토론 타임아웃
      vi.advanceTimersByTime(2001);

      expect(board.state).toBe(BoardState.VOTING);
    });
  });

  describe('Voting Timeout', () => {
    it('should close voting and tally when timeout', () => {
      const { board } = createTestBoard({
        timeouts: {
          discussion: 30000,
          voting: 1000
        }
      });

      board.start();
      board.submitAgenda({
        title: '투표 타임아웃 테스트',
        description: '테스트',
        proposer: 'ceo'
      });
      board.send(BoardEvent.CONFIRM_AGENDA);
      simulateSpeaker(board, 'ceo');
      board.send(BoardEvent.CALL_VOTE);

      const sessionId = board.context.currentVotingSessionId!;

      // 일부만 투표
      board.votingManager.submitVote(sessionId, { voterId: 'ceo', choice: VoteChoice.APPROVE });
      board.votingManager.submitVote(sessionId, { voterId: 'cto', choice: VoteChoice.APPROVE });
      // cfo는 투표 안 함

      expect(board.state).toBe(BoardState.VOTING);

      // 투표 타임아웃
      vi.advanceTimersByTime(1001);

      expect(board.state).toBe(BoardState.TALLYING);
    });
  });

  describe('Debate Timeout', () => {
    it('should move to voting after debate timeout', () => {
      const { board } = createTestBoard({
        timeouts: {
          discussion: 30000,
          debate: 1000
        }
      });

      board.start();
      board.submitAgenda({
        title: '반론 타임아웃 테스트',
        description: '테스트',
        proposer: 'ceo'
      });
      board.send(BoardEvent.CONFIRM_AGENDA);
      simulateSpeaker(board, 'ceo');
      board.send(BoardEvent.REQUEST_DEBATE);

      expect(board.state).toBe(BoardState.DEBATE);

      // 반론 타임아웃
      vi.advanceTimersByTime(1001);

      expect(board.state).toBe(BoardState.VOTING);
    });
  });

  describe('Time Extension', () => {
    it('should extend time during discussion', () => {
      const { board } = createTestBoard({
        timeouts: { discussion: 2000 }
      });

      board.start();
      board.submitAgenda({
        title: '시간 연장 테스트',
        description: '테스트',
        proposer: 'ceo'
      });
      board.send(BoardEvent.CONFIRM_AGENDA);

      // 1.5초 후 시간 연장
      vi.advanceTimersByTime(1500);
      board.stateMachine.extendTime(3000);

      // 원래 타임아웃 시점
      vi.advanceTimersByTime(600);
      expect(board.state).toBe(BoardState.DISCUSSION);

      // 연장된 시간 후
      vi.advanceTimersByTime(3000);
      expect(board.state).toBe(BoardState.VOTING);
    });
  });

  describe('Suspended Timeout', () => {
    it('should adjourn when suspended too long', () => {
      const { board } = createTestBoard({
        timeouts: {
          discussion: 30000
        }
      });

      board.start();
      board.submitAgenda({
        title: '중단 타임아웃 테스트',
        description: '테스트',
        proposer: 'ceo'
      });
      board.send(BoardEvent.CONFIRM_AGENDA);

      // 중단
      board.send(BoardEvent.SUSPEND);
      expect(board.state).toBe(BoardState.SUSPENDED);

      // 1시간 타임아웃
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);

      expect(board.state).toBe(BoardState.ADJOURNED);
    });
  });
});

function simulateSpeaker(board: any, participantId: string): void {
  board.stateMachine.requestToSpeak(participantId);
  board.stateMachine.grantSpeaker(participantId);
  board.stateMachine.endCurrentSpeaker();
}
```

### 6. 엣지 케이스 테스트

```typescript
// test/e2e/edge-cases.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestBoard } from './helpers/board-factory.js';
import { BoardState, BoardEvent } from '../../src/types/state-machine.js';
import { VoteChoice } from '../../src/types/voting.js';

describe('Board E2E: Edge Cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Minimum Participants', () => {
    it('should work with minimum 2 participants', () => {
      const { board } = createTestBoard({
        participants: ['a', 'b'],
        quorumPercentage: 0.5
      });

      board.start();
      expect(board.state).toBe(BoardState.AGENDA_SETTING);

      board.submitAgenda({
        title: '최소 인원 테스트',
        description: '테스트',
        proposer: 'a'
      });

      board.send(BoardEvent.CONFIRM_AGENDA);
      simulateSpeaker(board, 'a');
      board.send(BoardEvent.CALL_VOTE);

      const sessionId = board.context.currentVotingSessionId!;
      board.votingManager.submitVote(sessionId, { voterId: 'a', choice: VoteChoice.APPROVE });
      board.votingManager.submitVote(sessionId, { voterId: 'b', choice: VoteChoice.APPROVE });

      board.send(BoardEvent.COMPLETE_VOTING);
      board.send(BoardEvent.ANNOUNCE_RESULT);

      expect(board.state).toBe(BoardState.RESOLVED);
    });
  });

  describe('All Abstain', () => {
    it('should handle when all vote abstain', () => {
      const { board } = createTestBoard({
        participants: ['a', 'b', 'c']
      });

      board.start();
      board.submitAgenda({
        title: '전원 기권 테스트',
        description: '테스트',
        proposer: 'a'
      });

      board.send(BoardEvent.CONFIRM_AGENDA);
      simulateSpeaker(board, 'a');
      board.send(BoardEvent.CALL_VOTE);

      const sessionId = board.context.currentVotingSessionId!;
      board.votingManager.submitVote(sessionId, { voterId: 'a', choice: VoteChoice.ABSTAIN });
      board.votingManager.submitVote(sessionId, { voterId: 'b', choice: VoteChoice.ABSTAIN });
      board.votingManager.submitVote(sessionId, { voterId: 'c', choice: VoteChoice.ABSTAIN });

      board.send(BoardEvent.COMPLETE_VOTING);

      const result = board.votingManager.getResult(sessionId);
      // 전원 기권 시 정족수 미달 처리
      expect(result).toBeDefined();
    });
  });

  describe('Single Voter', () => {
    it('should handle single voter scenario', () => {
      const { board } = createTestBoard({
        participants: ['a', 'b', 'c']
      });

      board.start();
      board.submitAgenda({
        title: '단일 투표 테스트',
        description: '테스트',
        proposer: 'a'
      });

      board.send(BoardEvent.CONFIRM_AGENDA);
      simulateSpeaker(board, 'a');
      board.send(BoardEvent.CALL_VOTE);

      const sessionId = board.context.currentVotingSessionId!;
      board.votingManager.submitVote(sessionId, { voterId: 'a', choice: VoteChoice.APPROVE });

      // 타임아웃으로 강제 종료
      vi.advanceTimersByTime(5001);

      const result = board.votingManager.getResult(sessionId);
      expect(result).toBeDefined();
    });
  });

  describe('Rapid State Changes', () => {
    it('should handle rapid event sequence', () => {
      const { board } = createTestBoard();

      board.start();
      board.submitAgenda({ title: '빠른 전이 테스트', description: '테스트', proposer: 'ceo' });

      // 빠른 연속 이벤트
      board.send(BoardEvent.CONFIRM_AGENDA);
      simulateSpeaker(board, 'ceo');
      board.send(BoardEvent.CALL_VOTE);

      const sessionId = board.context.currentVotingSessionId!;
      board.votingManager.submitVote(sessionId, { voterId: 'ceo', choice: VoteChoice.APPROVE });
      board.votingManager.submitVote(sessionId, { voterId: 'cto', choice: VoteChoice.APPROVE });
      board.votingManager.submitVote(sessionId, { voterId: 'cfo', choice: VoteChoice.APPROVE });

      board.send(BoardEvent.COMPLETE_VOTING);
      board.send(BoardEvent.ANNOUNCE_RESULT);
      board.send(BoardEvent.ADJOURN);

      expect(board.state).toBe(BoardState.ADJOURNED);
    });
  });

  describe('Invalid Event Handling', () => {
    it('should reject invalid events gracefully', () => {
      const { board } = createTestBoard();

      board.start();

      // IDLE 상태에서 CALL_VOTE 시도 (불가)
      expect(() => board.send(BoardEvent.CALL_VOTE)).toThrow();
      expect(board.state).toBe(BoardState.AGENDA_SETTING);
    });
  });

  describe('Late Participant Join', () => {
    it('should handle late participant joining', () => {
      const { board } = createTestBoard({
        participants: ['a', 'b'],
        autoMarkPresent: false
      });

      board.stateMachine.markPresent('a');
      board.stateMachine.markPresent('b');
      board.start();
      board.submitAgenda({ title: '지각 참가자 테스트', description: '테스트', proposer: 'a' });
      board.send(BoardEvent.CONFIRM_AGENDA);

      // 토론 중 새 참가자 추가
      board.addParticipant('c');
      board.stateMachine.markPresent('c');

      expect(board.context.presentMembers.has('c')).toBe(true);
    });
  });

  describe('Participant Leaving', () => {
    it('should handle participant leaving during discussion', () => {
      const { board, events } = createTestBoard({
        participants: ['a', 'b', 'c']
      });

      board.start();
      board.submitAgenda({ title: '참가자 이탈 테스트', description: '테스트', proposer: 'a' });
      board.send(BoardEvent.CONFIRM_AGENDA);

      // 토론 중 참가자 이탈
      board.stateMachine.markAbsent('c');

      // 정족수 유지 (2/3)
      expect(board.stateMachine.isQuorumMet()).toBe(true);
    });

    it('should suspend when quorum lost', () => {
      const { board } = createTestBoard({
        participants: ['a', 'b', 'c'],
        quorumPercentage: 0.7
      });

      board.start();
      board.submitAgenda({ title: '정족수 상실 테스트', description: '테스트', proposer: 'a' });
      board.send(BoardEvent.CONFIRM_AGENDA);

      // 참가자 이탈로 정족수 미달
      board.stateMachine.markAbsent('b');
      board.stateMachine.markAbsent('c');

      expect(board.stateMachine.isQuorumMet()).toBe(false);
      
      // 수동으로 정족수 미달 이벤트 전송
      board.send(BoardEvent.QUORUM_LOST);
      expect(board.state).toBe(BoardState.SUSPENDED);
    });
  });
});

function simulateSpeaker(board: any, participantId: string): void {
  board.stateMachine.requestToSpeak(participantId);
  board.stateMachine.grantSpeaker(participantId);
  board.stateMachine.endCurrentSpeaker();
}
```

### 7. 에러 복구 테스트

```typescript
// test/e2e/error-recovery.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestBoard } from './helpers/board-factory.js';
import { BoardStateMachine } from '../../src/state-machine/BoardStateMachine.js';
import { BoardState, BoardEvent } from '../../src/types/state-machine.js';
import { VoteChoice } from '../../src/types/voting.js';

describe('Board E2E: Error Recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Session Recovery', () => {
    it('should serialize and restore session state', () => {
      const { board: original } = createTestBoard();

      original.start();
      original.submitAgenda({
        title: '복구 테스트 안건',
        description: '세션 복구 테스트',
        proposer: 'ceo'
      });
      original.send(BoardEvent.CONFIRM_AGENDA);
      simulateSpeaker(original, 'ceo');

      // 직렬화
      const snapshot = original.stateMachine.toJSON();

      // 새 인스턴스로 복구
      const { board: restored, eventBus } = createTestBoard();
      const restoredMachine = BoardStateMachine.fromJSON(snapshot, {
        eventBus,
        agendaManager: restored.agendaManager,
        votingManager: restored.votingManager,
        consensusEngine: restored.consensusEngine
      });

      expect(restoredMachine.state).toBe(BoardState.DISCUSSION);
      expect(restoredMachine.context.currentAgendaId).toBeDefined();
    });
  });

  describe('Emergency Stop and Resume', () => {
    it('should recover from emergency stop', () => {
      const { board } = createTestBoard();

      board.start();
      board.submitAgenda({ title: '긴급 중단 테스트', description: '테스트', proposer: 'ceo' });
      board.send(BoardEvent.CONFIRM_AGENDA);
      simulateSpeaker(board, 'ceo');
      board.send(BoardEvent.CALL_VOTE);

      // 긴급 중단
      board.send(BoardEvent.EMERGENCY_STOP);
      expect(board.state).toBe(BoardState.SUSPENDED);

      // 재개
      board.send(BoardEvent.RESUME);
      // 구현에 따라 이전 상태로 복귀하거나 토론 상태로 복귀
      expect([BoardState.DISCUSSION, BoardState.VOTING]).toContain(board.state);
    });
  });

  describe('Vote Change After Error', () => {
    it('should allow vote change after error', () => {
      const { board } = createTestBoard();

      board.start();
      board.submitAgenda({ title: '투표 변경 테스트', description: '테스트', proposer: 'ceo' });
      board.send(BoardEvent.CONFIRM_AGENDA);
      simulateSpeaker(board, 'ceo');
      board.send(BoardEvent.CALL_VOTE);

      const sessionId = board.context.currentVotingSessionId!;

      // 잘못된 투표
      board.votingManager.submitVote(sessionId, { voterId: 'ceo', choice: VoteChoice.REJECT });

      // 투표 변경
      board.votingManager.changeVote(sessionId, 'ceo', VoteChoice.APPROVE);

      const vote = board.votingManager.getSession(sessionId)?.getVote('ceo');
      expect(vote?.choice).toBe(VoteChoice.APPROVE);
    });
  });

  describe('Concurrent Modification Handling', () => {
    it('should handle concurrent vote submissions gracefully', async () => {
      const { board } = createTestBoard();

      board.start();
      board.submitAgenda({ title: '동시 투표 테스트', description: '테스트', proposer: 'ceo' });
      board.send(BoardEvent.CONFIRM_AGENDA);
      simulateSpeaker(board, 'ceo');
      board.send(BoardEvent.CALL_VOTE);

      const sessionId = board.context.currentVotingSessionId!;

      // 동시 투표 시뮬레이션
      const votes = [
        () => board.votingManager.submitVote(sessionId, { voterId: 'ceo', choice: VoteChoice.APPROVE }),
        () => board.votingManager.submitVote(sessionId, { voterId: 'cto', choice: VoteChoice.APPROVE }),
        () => board.votingManager.submitVote(sessionId, { voterId: 'cfo', choice: VoteChoice.REJECT })
      ];

      // 모든 투표 실행
      votes.forEach(v => v());

      const session = board.votingManager.getSession(sessionId);
      expect(session?.votes.length).toBe(3);
    });
  });
});

function simulateSpeaker(board: any, participantId: string): void {
  board.stateMachine.requestToSpeak(participantId);
  board.stateMachine.grantSpeaker(participantId);
  board.stateMachine.endCurrentSpeaker();
}
```

### 8. 완료 조건

- [ ] test/e2e/ 디렉토리 구조 생성
- [ ] 테스트 헬퍼 구현 완료
  - [ ] board-factory.ts
  - [ ] mock-participants.ts
  - [ ] scenario-runner.ts
- [ ] full-flow.test.ts 작성 완료
- [ ] consensus-failure.test.ts 작성 완료
- [ ] timeout-scenarios.test.ts 작성 완료
- [ ] edge-cases.test.ts 작성 완료
- [ ] error-recovery.test.ts 작성 완료
- [ ] 모든 E2E 테스트 통과
- [ ] pnpm test:e2e 성공

### 9. 의존성

- TASK-036 (AgendaManager)
- TASK-037 (VotingManager)
- TASK-038 (ConsensusEngine)
- TASK-039 (BoardStateMachine)
- TASK-040 (패키지 설정)

### 10. 테스트 시나리오 체크리스트

#### 정상 흐름
- [ ] 단일 안건 승인 흐름
- [ ] 단일 안건 거부 흐름
- [ ] 복수 안건 연속 처리
- [ ] 토론 → 반론 → 토론 → 투표 흐름

#### 합의 실패
- [ ] 다수결 거부
- [ ] 만장일치 실패 (단일 반대)
- [ ] 동률 발생 및 에스컬레이션
- [ ] 정족수 미달
- [ ] 조건부 합의 조건 미충족

#### 타임아웃
- [ ] 안건 설정 타임아웃 → 휴회
- [ ] 토론 타임아웃 → 투표
- [ ] 반론 타임아웃 → 투표
- [ ] 투표 타임아웃 → 집계
- [ ] 중단 상태 타임아웃 → 휴회
- [ ] 시간 연장

#### 엣지 케이스
- [ ] 최소 인원 (2명)
- [ ] 전원 기권
- [ ] 단일 투표자
- [ ] 빠른 연속 이벤트
- [ ] 잘못된 이벤트 처리
- [ ] 지각 참가자
- [ ] 참가자 이탈
- [ ] 정족수 상실

#### 에러 복구
- [ ] 세션 직렬화/역직렬화
- [ ] 긴급 중단 및 재개
- [ ] 투표 변경
- [ ] 동시 투표

### 11. 참고 문서

- [AI 이사회 의사결정 흐름](../../architecture/blackboard-actor-design.md#4-ai-이사회-의사결정-흐름)
- [상태 전이 다이어그램](../../architecture/blackboard-actor-design.md#43-상태-전이-다이어그램)
