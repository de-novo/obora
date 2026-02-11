<review>
  <mode>checklist_verification</mode>
  <task>
    <name>TASK-031-agent-roles</name>
    <spec><![CDATA[
# TASK-031: 역할별 에이전트 구현

## 개요
- **상태**: 📋 대기
- 우선순위: P1
- 예상 소요: 12시간
- 담당: 개발자
- Phase: Week 5-6

## 목표
역할별 AI 에이전트 구현 (Analyst/Executor/Verifier/Director)

> **설계 원칙 (4모델 토론 결과)**
> - 모든 에이전트는 공통 `execute(input: AgentInput): Promise<AgentOutput>` 메서드 사용
> - 역할별 특화 메서드 대신 **입출력 타입**으로 역할 구분
> - LLM Adapter는 `chatCompletion()` 메서드명 통일

## 작업 내용

### 추가: DecisionsSection 타입 확장
- `DecisionsSection`에 `voting: Record<string, VotingSession>` 필드 추가
- `VotingSession` 인터페이스 정의 (DirectorAgent.startVotingSession/tallyVotes 지원)
- Blackboard 초기 상태에 `voting: {}` 기본값 추가

### 1. BaseAgent 추상 클래스

**파일 위치:** `packages/agents/src/roles/base-agent.ts`

```typescript
import { LLMAdapter, ChatMessage, ChatCompletionParams } from '../llm/adapter';
import type { Blackboard } from '@obora-kit/blackboard';

/**
 * 에이전트 ID 타입
 */
export type AgentId = string;

/**
 * 에이전트 역할
 */
export enum AgentRole {
  ANALYST = 'analyst',
  EXECUTOR = 'executor',
  VERIFIER = 'verifier',
  DIRECTOR = 'director',
}

/**
 * 에이전트 상태
 */
export enum AgentState {
  IDLE = 'idle',
  THINKING = 'thinking',
  ACTING = 'acting',
  WAITING = 'waiting',
  ERROR = 'error',
}

/**
 * 회의 단계
 */
export enum MeetingPhase {
  OPENING = 'opening',
  DISCUSSION = 'discussion',
  VOTING = 'voting',
  CONSENSUS = 'consensus',
  CLOSING = 'closing',
  ESCALATION = 'escalation',
}

/**
 * 에이전트 상태 정보
 */
export interface AgentStatus {
  id: AgentId;
  role: AgentRole;
  state: AgentState;
  lastActivity: Date;
  currentTask?: string;
  errorCount: number;
}

/**
 * 에이전트 컨텍스트
 */
export interface AgentContext {
  sessionId: string;
  board: Blackboard;
  currentTask?: Task;
  history: ChatMessage[];
}

/**
 * 작업
 */
export interface Task {
  id: string;
  type: string;
  description: string;
  input: Record<string, unknown>;
  priority: number;
  deadline?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * 작업 결과
 */
export interface TaskResult {
  taskId: string;
  success: boolean;
  output: unknown;
  error?: Error;
  duration: number;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * 기반 에이전트 추상 클래스
 */
export abstract class BaseAgent {
  readonly id: AgentId;
  readonly role: AgentRole;
  protected state: AgentState = AgentState.IDLE;
  protected llm: LLMAdapter;
  protected systemPrompt: string;
  protected errorCount: number = 0;
  protected maxErrors: number = 3;

  constructor(config: BaseAgentConfig) {
    this.id = config.id ?? `${config.role}-${Date.now()}`;
    this.role = config.role;
    this.llm = config.llm;
    this.systemPrompt = config.systemPrompt ?? this.getDefaultSystemPrompt();
  }

  /**
   * 작업 실행
   */
  async execute(task: Task, context: AgentContext): Promise<TaskResult> {
    const startTime = Date.now();
    this.state = AgentState.THINKING;

    try {
      // 1. 관찰 (Observe) - Blackboard에서 정보 읽기
      const observation = await this.observe(context);

      // 2. 사고 (Think) - LLM을 사용하여 의사결정
      const action = await this.think(task, observation, context);

      // 3. 실행 (Act) - 의사결정 수행
      this.state = AgentState.ACTING;
      const result = await this.act(action, context);

      // 4. 보고 (Report) - 결과를 Blackboard에 기록
      await this.report(task, result, context);

      this.state = AgentState.IDLE;
      this.errorCount = 0;

      return {
        taskId: task.id,
        success: true,
        output: result,
        duration: Date.now() - startTime,
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
      };
    } catch (error) {
      this.state = AgentState.ERROR;
      this.errorCount++;

      return {
        taskId: task.id,
        success: false,
        output: null,
        error: error as Error,
        duration: Date.now() - startTime,
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
      };
    }
  }

  /**
   * 관찰 - Blackboard에서 정보 수집
   */
  protected async observe(context: AgentContext): Promise<Record<string, unknown>> {
    const state = context.board.read('state') as Record<string, unknown>;
    const knowledge = context.board.read('knowledge') as Record<string, unknown>;

    return {
      currentState: state,
      availableKnowledge: knowledge,
      currentTask: context.currentTask,
      sessionId: context.sessionId,
    };
  }

  /**
   * 사고 - LLM을 사용하여 의사결정
   */
  protected async think(
    task: Task,
    observation: Record<string, unknown>,
    context: AgentContext
  ): Promise<unknown> {
    const messages = this.buildMessages(task, observation, context);

    const result = await this.llm.chatCompletion({
      messages,
      temperature: 0.7,
      maxTokens: 2048,
    });

    // 역할별 응답 파싱
    return this.parseResponse(result.message.content ?? '', task);
  }

  /**
   * 실행 - 의사결정 수행 (하위 클래스에서 구현)
   */
  protected abstract act(action: unknown, context: AgentContext): Promise<unknown>;

  /**
   * 보고 - 결과를 Blackboard에 기록
   */
  protected async report(
    task: Task,
    result: unknown,
    context: AgentContext
  ): Promise<void> {
    context.board.write(`state.agent.${this.id}.lastResult`, {
      taskId: task.id,
      timestamp: new Date(),
      result,
    });
  }

  /**
   * 메시지 빌드
   */
  protected buildMessages(
    task: Task,
    observation: Record<string, unknown>,
    context: AgentContext
  ): ChatMessage[] {
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
    ];

    // 이력에 최근 N개의 메시지 추가
    const recentHistory = context.history.slice(-10);
    messages.push(...recentHistory);

    // 현재 컨텍스트 정보 추가
    messages.push({
      role: 'user',
      content: this.formatTaskAndObservation(task, observation),
    });

    return messages;
  }

  /**
   * 작업 및 관찰 포맷팅
   */
  protected formatTaskAndObservation(
    task: Task,
    observation: Record<string, unknown>
  ): string {
    return `
Current Task:
- ID: ${task.id}
- Type: ${task.type}
- Description: ${task.description}
- Input: ${JSON.stringify(task.input, null, 2)}

Current Context:
- Session ID: ${observation.sessionId}
- Available: ${JSON.stringify(observation, null, 2)}

Please analyze and provide your response in the appropriate format.
`.trim();
  }

  /**
   * 응답 파싱 (하위 클래스에서 구현)
   */
  protected abstract parseResponse(content: string, task: Task): unknown;

  /**
   * 기본 시스템 프롬프트 (하위 클래스에서 오버라이드)
   */
  protected abstract getDefaultSystemPrompt(): string;

  /**
   * 상태 가져오기
   */
  getStatus(): AgentStatus {
    return {
      id: this.id,
      role: this.role,
      state: this.state,
      lastActivity: new Date(),
      currentTask: undefined,
      errorCount: this.errorCount,
    };
  }

  /**
   * 에러 카운트 리셋
   */
  resetErrorCount(): void {
    this.errorCount = 0;
  }

  /**
   * 최대 에러 도달 여부 확인
   */
  hasExceededMaxErrors(): boolean {
    return this.errorCount >= this.maxErrors;
  }
}

/**
 * 기반 에이전트 설정
 */
export interface BaseAgentConfig {
  id?: AgentId;
  role: AgentRole;
  llm: LLMAdapter;
  systemPrompt?: string;
  maxErrors?: number;
}

// ============================================
// 역할별 입출력 타입 정의 (스펙 14-ai-agents.md와 일치)
// ============================================

/**
 * Analyst 입력 타입
 */
export interface AnalystInput {
  type: 'analysis';
  content: string;
  goal?: string;
  constraints?: string[];
  resources?: string[];
  previousPlans?: Plan[];
  context?: Record<string, unknown>;
}

/**
 * Analyst 출력 타입
 */
export interface AnalystOutput {
  type: 'analysis';
  content: string;
  summary: string;
  keyFindings: string[];
  recommendations: string[];
  confidence: number;
  reasoning: string;
  sources?: string[];
}

/**
 * Executor 입력 타입
 */
export interface ExecutorInput {
  type: 'execution';
  content: string;
  taskDescription: string;
  inputs?: Record<string, unknown>;
  expectedOutput?: string;
  tools?: string[];
  context?: Record<string, unknown>;
}

/**
 * Executor 출력 타입
 */
export interface ExecutorOutput {
  type: 'execution';
  content: string;
  action: string;
  tool?: string;
  parameters: Record<string, unknown>;
  steps: string[];
  expectedOutcome: string;
}

/**
 * Verifier 입력 타입
 */
export interface VerifierInput {
  type: 'verification';
  content: string;
  artifact: Artifact;
  criteria?: string[];
  requirements?: string[];
  context?: Record<string, unknown>;
}

/**
 * Verifier 출력 타입
 */
export interface VerifierOutput {
  type: 'verification';
  content: string;
  passed: boolean;
  score: number;  // 0-100
  checks: VerificationCheck[];
  findings: Finding[];
  suggestions: string[];
}

/**
 * Director 입력 타입
 */
export interface DirectorInput {
  type: 'coordination';
  content: string;
  agenda: string;
  participants: string[];
  currentOpinions?: string[];
  conflict?: Conflict;
  context?: Record<string, unknown>;
}

/**
 * Director 출력 타입 (스펙 14-ai-agents.md와 일치)
 */
export interface DirectorOutput {
  type: 'coordination';
  content: string;
  agenda: string;
  participants: string[];
  steps: CoordinationStep[];
  timeline: string[];
  expectedOutcome: string;
  // 스펙에 없는 필드:
  // - phase: 테스트용 추가 필드, 구현에서는 불필요
  // - action: 테스트용 추가 필드, 구현에서는 불필요
}

/**
 * 검증 체크 항목
 */
export interface VerificationCheck {
  name: string;
  description: string;
  status: 'passed' | 'failed' | 'skipped';
  evidence: string;
}

/**
 * 발견된 이슈
 */
export interface Finding {
  id: string;
  type: 'error' | 'warning' | 'info';
  description: string;
  location?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * 조율 단계
 */
export interface CoordinationStep {
  step: number;
  description: string;
  assignee?: string;
  dependencies: string[];
  estimatedDuration?: string;
}

/**
 * 갈등 정보
 */
export interface Conflict {
  id: string;
  topic: string;
  parties: string[];
  positions: Record<string, string>;
  severity: 'minor' | 'moderate' | 'major';
}

/**
 * 아티팩트
 */
export interface Artifact {
  id: string;
  type: 'code' | 'document' | 'data' | 'plan' | 'review';
  name: string;
  content: string | Record<string, unknown>;
}
```

### 2. AnalystAgent 구현

**파일 위치:** `packages/agents/src/roles/analyst-agent.ts`

```typescript
import { BaseAgent, AgentContext, Task, AgentRole, AnalystInput, AnalystOutput } from './base-agent';

/**
 * Analyst 에이전트
 * 역할: 데이터 분석, 위험 평가, 패턴 인식
 * 
 * 입력: AnalystInput
 * 출력: AnalystOutput
 */
export class AnalystAgent extends BaseAgent {
  constructor(config: Omit<Parameters<typeof BaseAgent.prototype>[0], 'role'>) {
    super({ ...config, role: AgentRole.ANALYST });
  }

  protected getDefaultSystemPrompt(): string {
    return `You are an expert analyst with deep expertise in data analysis, risk assessment, and pattern recognition.

Your responsibilities:
1. Analyze the provided information thoroughly
2. Identify key findings and patterns
3. Provide actionable recommendations
4. Assess confidence in your conclusions
5. Support your findings with reasoning

When providing analysis, structure your response as follows:
- Summary: A concise overview of your analysis
- Key Findings: Bullet points of important discoveries
- Recommendations: Actionable suggestions based on findings
- Confidence: A score from 0-100 indicating your certainty
- Reasoning: Your thought process and evidence

Be thorough, objective, and analytical in your approach.`;
  }

  protected async act(action: unknown, context: AgentContext): Promise<unknown> {
    const analysis = action as AnalysisResult;

    // 분석 결과를 지식 베이스에 저장
    context.board.write(`knowledge.analysis.${this.id}.${Date.now()}`, analysis);

    // 이벤트 발행
    context.board.emit('analysis.completed', {
      agentId: this.id,
      result: analysis,
    });

    return analysis;
  }

  protected parseResponse(content: string, task: Task): AnalystOutput {
    // JSON 형식으로 파싱 시도
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        return { type: 'analysis', content, ...parsed } as AnalystOutput;
      }

      // JSON 블록 없으면 전체에서 파싱 시도
      const cleanContent = content.replace(/^[^{]*({[\s\S]*})[^}]*$/, '$1');
      const parsed = JSON.parse(cleanContent);
      return { type: 'analysis', content, ...parsed } as AnalystOutput;
    } catch {
      // 파싱 실패 시 기본 형식으로 변환
      return {
        type: 'analysis',
        content,
        summary: content,
        keyFindings: [],
        recommendations: [],
        confidence: 0.5,
        reasoning: content,
      };
    }
  }
}

/**
 * 분석 에이전트 생성
 */
export function createAnalystAgent(
  id: string,
  llm: BaseAgentConfig['llm']
): AnalystAgent {
  return new AnalystAgent({ id, llm });
}
```

### 3. ExecutorAgent 구현

**파일 위치:** `packages/agents/src/roles/executor-agent.ts`

```typescript
import { BaseAgent, AgentContext, Task, AgentRole, ExecutorInput, ExecutorOutput } from './base-agent';
import { ToolRegistry } from '../tools';

/**
 * Executor 에이전트
 * 역할: 작업 실행, API 호출, 파일 처리
 *
 * 입력: ExecutorInput
 * 출력: ExecutorOutput
 */
export class ExecutorAgent extends BaseAgent {
  private toolRegistry?: ToolRegistry;

  constructor(
    config: Omit<Parameters<typeof BaseAgent.prototype>[0], 'role'> & {
      toolRegistry?: ToolRegistry;
    }
  ) {
    super({ ...config, role: AgentRole.EXECUTOR });
    this.toolRegistry = config.toolRegistry;
  }

  protected getDefaultSystemPrompt(): string {
    const availableTools = this.toolRegistry
      ? this.toolRegistry.listTools().map(t => t.name).join(', ')
      : 'none';

    return `You are an executor agent responsible for taking action and executing tasks.

Your responsibilities:
1. Understand the task requirements clearly
2. Determine the best approach to complete the task
3. Execute the action using available tools
4. Report the outcome accurately
5. Handle errors gracefully

Available tools: ${availableTools}

When planning execution, structure your response as follows:
- Action: What action will you take?
- Tool: Which tool will you use? (if applicable)
- Parameters: What parameters are needed for the tool?
- Steps: Break down the execution into steps
- Expected Outcome: What result do you expect?

Be precise, efficient, and safety-conscious in your execution.`;
  }

  protected async act(action: unknown, context: AgentContext): Promise<unknown> {
    const plan = action as ExecutionPlan;

    if (plan.tool && this.toolRegistry) {
      // 도구 레지스트리에서 도구 실행
      const result = await this.toolRegistry.execute(
        plan.tool,
        plan.parameters
      );

      // 실행 결과를 상태에 저장
      context.board.write(`state.execution.${this.id}.${Date.now()}`, {
        plan,
        result,
        timestamp: new Date(),
      });

      return result;
    }

    // 도구 없는 경우 기본 실행
    const result = {
      action: plan.action,
      steps: plan.steps,
      outcome: plan.expectedOutcome,
      timestamp: new Date(),
    };

    context.board.write(`state.execution.${this.id}.${Date.now()}`, result);

    return result;
  }

  protected parseResponse(content: string, task: Task): ExecutorOutput {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        return { type: 'execution', content, ...parsed } as ExecutorOutput;
      }

      const cleanContent = content.replace(/^[^{]*({[\s\S]*})[^}]*$/, '$1');
      const parsed = JSON.parse(cleanContent);
      return { type: 'execution', content, ...parsed } as ExecutorOutput;
    } catch {
      return {
        type: 'execution',
        content,
        action: content,
        parameters: {},
        steps: [content],
        expectedOutcome: 'Task execution',
      };
    }
  }

  /**
   * 도구 레지스트리 설정
   */
  setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry;
  }
}

/**
 * 실행 에이전트 생성
 */
export function createExecutorAgent(
  id: string,
  llm: BaseAgentConfig['llm'],
  toolRegistry?: ToolRegistry
): ExecutorAgent {
  return new ExecutorAgent({ id, llm, toolRegistry });
}
```

### 4. VerifierAgent 구현

**파일 위치:** `packages/agents/src/roles/verifier-agent.ts`

```typescript
import { BaseAgent, AgentContext, Task, AgentRole, VerifierInput, VerifierOutput, VerificationCheck, Finding } from './base-agent';

/**
 * Verifier 에이전트
 * 역할: 결과 검증, 품질 체크, 정확성 확인
 *
 * 입력: VerifierInput
 * 출력: VerifierOutput
 */
export class VerifierAgent extends BaseAgent {
  constructor(config: Omit<Parameters<typeof BaseAgent.prototype>[0], 'role'>) {
    super({ ...config, role: AgentRole.VERIFIER });
  }

  protected getDefaultSystemPrompt(): string {
    return `You are a verifier agent responsible for validating results and ensuring quality.

Your responsibilities:
1. Review the provided work thoroughly
2. Check against requirements and specifications
3. Identify any issues or discrepancies
4. Provide specific feedback for improvements
5. Verify correctness and completeness

When conducting verification, structure your response as follows:
- Passed: Overall pass/fail status (true/false)
- Checks: List of specific verification checks performed
- Summary: Brief overview of the verification
- Issues: Detailed list of issues found, with severity levels
- Suggestions: Recommendations for improvement

Issue severity levels:
- Critical: Must be fixed before proceeding
- High: Should be fixed soon
- Medium: Can be addressed later
- Low: Minor improvements or suggestions

Be thorough, objective, and constructive in your verification.`;
  }

  protected async act(action: unknown, context: AgentContext): Promise<unknown> {
    const verification = action as VerifierOutput;

    // 검증 결과를 지식 베이스에 저장
    context.board.write(`knowledge.verification.${this.id}.${Date.now()}`, verification);

    // 이벤트 발행
    context.board.emit('verification.completed', {
      agentId: this.id,
      result: verification,
    });

    // Critical 이슈가 있는 경우 경고 이벤트
    if (verification.findings.some(f => f.severity === 'critical')) {
      context.board.emit('verification.critical', {
        agentId: this.id,
        findings: verification.findings.filter(f => f.severity === 'critical'),
      });
    }

    return verification;
  }

  protected parseResponse(content: string, task: Task): VerifierOutput {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        return { type: 'verification', content, ...parsed } as VerifierOutput;
      }

      const cleanContent = content.replace(/^[^{]*({[\s\S]*})[^}]*$/, '$1');
      const parsed = JSON.parse(cleanContent);
      return { type: 'verification', content, ...parsed } as VerifierOutput;
    } catch {
      return {
        type: 'verification',
        content,
        passed: false,
        score: 0,
        checks: [],
        findings: [],
        suggestions: [],
      };
    }
  }
}

/**
 * 검증 에이전트 생성
 */
export function createVerifierAgent(
  id: string,
  llm: BaseAgentConfig['llm']
): VerifierAgent {
  return new VerifierAgent({ id, llm });
}
```

### 5. DirectorAgent 구현

**파일 위치:** `packages/agents/src/roles/director-agent.ts`

```typescript
import { BaseAgent, AgentContext, Task, AgentRole, DirectorInput, DirectorOutput, CoordinationStep } from './base-agent';

/**
 * Director 에이전트
 * 역할: 조율, 진행 관리, 합의 도출
 *
 * 입력: DirectorInput
 * 출력: DirectorOutput
 */
export class DirectorAgent extends BaseAgent {
  constructor(config: Omit<Parameters<typeof BaseAgent.prototype>[0], 'role'>) {
    super({ ...config, role: AgentRole.DIRECTOR });
  }

  protected getDefaultSystemPrompt(): string {
    return `You are a director agent responsible for coordinating activities and facilitating collaboration.

Your responsibilities:
1. Understand the overall goal and requirements
2. Coordinate between different agents and stakeholders
3. Facilitate discussions and consensus-building
4. Monitor progress and adjust plans as needed
5. Provide clear direction and guidance

When creating a coordination plan, structure your response as follows (JSON format):
{
  "type": "coordination",
  "content": "Description of the coordination plan",
  "agenda": "Main goal or purpose",
  "participants": ["participant1", "participant2", ...],
  "steps": [
    {
      "step": 1,
      "description": "First step description",
      "assignee": "who handles this step",
      "dependencies": [],
      "estimatedDuration": "time estimate"
    },
    ...
  ],
  "timeline": ["step1 timeline", "step2 timeline", ...],
  "expectedOutcome": "What should be achieved"
}

Key principles for effective coordination:
- Clear communication
- Inclusive participation
- Transparent decision-making
- Agile adaptation to changes
- Focus on results

Be diplomatic, organized, and results-oriented in your coordination.`;
  }

  protected async act(action: unknown, context: AgentContext): Promise<unknown> {
    const plan = action as DirectorOutput;

    // 조율 계획을 결정 섹션에 저장
    context.board.write(`decisions.coordination.${this.id}.${Date.now()}`, plan);

    // 이벤트 발행
    context.board.emit('coordination.started', {
      agentId: this.id,
      plan,
    });

    return plan;
  }

  protected parseResponse(content: string, task: Task): DirectorOutput {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        return { type: 'coordination', content, ...parsed } as DirectorOutput;
      }

      const cleanContent = content.replace(/^[^{]*({[\s\S]*})[^}]*$/, '$1');
      const parsed = JSON.parse(cleanContent);
      return { type: 'coordination', content, ...parsed } as DirectorOutput;
    } catch {
      return {
        type: 'coordination',
        content,
        agenda: content,
        participants: [],
        steps: [],
        timeline: [],
        expectedOutcome: 'Coordination complete',
      };
    }
  }

  /**
   * 투표 세션 시작
   */
  async startVotingSession(
    agendaId: string,
    participants: string[],
    context: AgentContext
  ): Promise<void> {
    context.board.write(`decisions.voting.${agendaId}`, {
      started: new Date(),
      participants,
      votes: {},
      status: 'in-progress',
    });

    context.board.emit('voting.started', {
      agendaId,
      participants,
    });
  }

  /**
   * 투표 집계
   */
  async tallyVotes(
    agendaId: string,
    context: AgentContext
  ): Promise<Record<string, number>> {
    const voting = context.board.read('decisions') as Record<string, unknown>;
    const session = voting[`voting.${agendaId}`] as Record<string, unknown>;

    if (!session || (session.status as string) !== 'completed') {
      throw new Error(`Voting session ${agendaId} not completed`);
    }

    return session.votes as Record<string, number>;
  }
}

/**
 * 디렉터 에이전트 생성
 */
export function createDirectorAgent(
  id: string,
  llm: BaseAgentConfig['llm']
): DirectorAgent {
  return new DirectorAgent({ id, llm });
}
```

### 6. 에이전트 팩토리

**파일 위치:** `packages/agents/src/roles/factory.ts`

```typescript
import { BaseAgent } from './base-agent';
import { AnalystAgent, createAnalystAgent } from './analyst-agent';
import { ExecutorAgent, createExecutorAgent } from './executor-agent';
import { VerifierAgent, createVerifierAgent } from './verifier-agent';
import { DirectorAgent, createDirectorAgent } from './director-agent';
import type { ToolRegistry } from '../tools';

/**
 * 에이전트 생성 설정
 */
export interface CreateAgentConfig {
  id: string;
  role: 'analyst' | 'executor' | 'verifier' | 'director';
  llm: BaseAgent['llm'];
  toolRegistry?: ToolRegistry;
}

/**
 * 에이전트 생성
 */
export function createAgent(config: CreateAgentConfig): BaseAgent {
  switch (config.role) {
    case 'analyst':
      return createAnalystAgent(config.id, config.llm);

    case 'executor':
      return createExecutorAgent(config.id, config.llm, config.toolRegistry);

    case 'verifier':
      return createVerifierAgent(config.id, config.llm);

    case 'director':
      return createDirectorAgent(config.id, config.llm);

    default:
      throw new Error(`Unknown agent role: ${config.role}`);
  }
}

/**
 * 에이전트 팀 생성
 */
export function createAgentTeam(
  config: Omit<CreateAgentConfig, 'id' | 'role'> & {
    analysts?: number;
    executors?: number;
    verifiers?: number;
    directors?: number;
  }
): BaseAgent[] {
  const agents: BaseAgent[] = [];
  const baseConfig = {
    llm: config.llm,
    toolRegistry: config.toolRegistry,
  };

  const count = config.analysts ?? 1;
  for (let i = 0; i < count; i++) {
    agents.push(createAgent({
      id: `analyst-${i + 1}`,
      role: 'analyst',
      ...baseConfig,
    }));
  }

  const executorCount = config.executors ?? 1;
  for (let i = 0; i < executorCount; i++) {
    agents.push(createAgent({
      id: `executor-${i + 1}`,
      role: 'executor',
      ...baseConfig,
    }));
  }

  const verifierCount = config.verifiers ?? 1;
  for (let i = 0; i < verifierCount; i++) {
    agents.push(createAgent({
      id: `verifier-${i + 1}`,
      role: 'verifier',
      ...baseConfig,
    }));
  }

  const directorCount = config.directors ?? 1;
  for (let i = 0; i < directorCount; i++) {
    agents.push(createAgent({
      id: `director-${i + 1}`,
      role: 'director',
      ...baseConfig,
    }));
  }

  return agents;
}
```

### 7. 내보내기 설정

**파일 위치:** `packages/agents/src/roles/index.ts`

```typescript
export * from './base-agent';
export * from './analyst-agent';
export * from './executor-agent';
export * from './verifier-agent';
export * from './director-agent';
export * from './factory';
```

## 완료 조건
- [ ] BaseAgent 추상 클래스 구현 완료
- [ ] AnalystAgent 구현 완료
- [ ] ExecutorAgent 구현 완료
- [ ] VerifierAgent 구현 완료
- [ ] DirectorAgent 구현 완료
- [ ] 에이전트 팩토리 구현 완료
- [ ] 단위 테스트 작성

## 의존성
- TASK-030 (LLM Adapter)
- @obora-kit/blackboard 패키지
- TASK-033 (Tool Integration, ExecutorAgent용)

## 사용 예시

### 단일 에이전트 생성
```typescript
import { createLLMAdapterFromEnv } from '@obora-kit/agents';
import { createAnalystAgent } from '@obora-kit/agents';

const llm = createLLMAdapterFromEnv();
const analyst = createAnalystAgent('analyst-1', llm);

const result = await analyst.execute(
  {
    id: 'task-1',
    type: 'analysis',
    description: 'Analyze the market trends',
    input: { data: marketData },
    priority: 1,
  },
  {
    sessionId: 'session-123',
    board: blackboard,
    history: [],
  }
);
```

### 에이전트 팀 생성
```typescript
import { createAgentTeam, createLLMAdapterFromEnv } from '@obora-kit/agents';
import { ToolRegistry } from '@obora-kit/agents';

const llm = createLLMAdapterFromEnv();
const toolRegistry = new ToolRegistry();

const team = createAgentTeam({
  llm,
  toolRegistry,
  analysts: 2,
  executors: 2,
  verifiers: 1,
  directors: 1,
});

console.log(`Created team with ${team.length} agents`);
```

### 병렬 에이전트 실행
```typescript
const tasks = [
  { id: 'task-1', type: 'analysis', description: 'Analyze A', input: {}, priority: 1 },
  { id: 'task-2', type: 'execution', description: 'Execute B', input: {}, priority: 1 },
  { id: 'task-3', type: 'verification', description: 'Verify C', input: {}, priority: 1 },
];

const results = await Promise.all(
  team.map((agent, i) => agent.execute(tasks[i], context))
);
```

## 엣지 케이스
1. LLM 응답 파싱 실패 시 기본 응답 반환
2. Blackboard 연결 실패 처리
3. 툴 레지스트리에 도구가 없는 경우 처리
4. 에이전트 오류 발생 시 재시도 로직
5. 동시 작업 처리 시 상태 충돌 방지
6. 메시지 기록이 너무 길어지는 경우 트리밍
7. 최대 에러 도달 시 에이전트 비활성화

## 참고 자료
- ADR-001: Blackboard + Actor 아키텍처 선택
- TASK-030: Pi Mono LLM Adapter 구현
- TASK-033: Function Calling / 도구 통합
- @obora-kit/blackboard 패키지 문서

---

*작성일: 2026-02-04*
*버전: 1.0.0*
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
# 생성 시각: 2026-02-12 00:10:48

1. `report` 메서드의 Blackboard 경로가 스펙과 불일치
2. `ExecutorAgent.act`에서 도구 실행 결과를 반환하지 않음
  </checklist>

  <source_files>

  </source_files>

  <test_files>

  </test_files>

  <output_format>
# 체크리스트 검증 결과

## 총점
X/10

## 항목별 검증
각 항목에 대해 PASS/FAIL + 근거(파일:라인) 출력

## 수정이 필요한 항목
FAIL 항목에 대한 수정 코드 제시
  </output_format>
</review>

위의 XML 프롬프트를 따라서 체크리스트 검증을 수행하고 결과를 마크다운 형식으로 출력하세요.
