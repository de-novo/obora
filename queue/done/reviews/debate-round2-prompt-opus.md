<debate>
  <round>2</round>
  <task_spec><![CDATA[
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
]]></task_spec>

  <reviews>
    <opus_review><![CDATA[


I'll start by exploring the relevant source and test files to verify each checklist item.
Now let me read all the test files and source files in parallel:
Now let me run the tests to verify they pass:
I have all the data needed. Now let me analyze each checklist item against the actual code and test results.

# 체크리스트 검증 결과

## 총점
4/10

## 항목별 검증

### 1. base-agent.test.ts execute 블록의 context.board가 undefined로 고정됨
**[PASS]**

이전에 `context`가 execute 블록 내부에서 shadow 선언되어 `board: undefined`로 고정되는 이슈였습니다. 현재 코드에서는:
- `base-agent.test.ts:24` - 외부 `beforeEach`에서 `context`를 `board: blackboard`로 초기화
- `base-agent.test.ts:109` - 주석으로 `// outer beforeEach에서 초기화된 context 사용 (shadow 선언 제거)` 명시
- execute 블록 내부에 별도의 context 재선언 없음

**수정 확인됨.**

---

### 2. analyst-agent.test.ts execute 블록의 context.board가 undefined로 고정됨
**[PASS]**

현재 코드에서는:
- `analyst-agent.test.ts:58-66` - execute describe 블록 내부에 `let context` 선언 후 `beforeEach`에서 `board: blackboard`로 초기화

```typescript
// line 60-66
beforeEach(() => {
  context = {
    sessionId: "session-1",
    board: blackboard,
    history: [],
  };
});
```

**수정 확인됨.**

---

### 3. analyst-agent.test.ts act 블록의 context.board가 undefined로 고정됨
**[PASS]**

현재 코드에서는:
- `analyst-agent.test.ts:287-295` - act describe 블록 내부에 `let context` 선언 후 `beforeEach`에서 `board: blackboard`로 초기화

```typescript
// line 289-295
beforeEach(() => {
  context = {
    sessionId: "session-1",
    board: blackboard,
    history: [],
  };
});
```

테스트 실행 결과에서도 `act > should write analysis result to knowledge` 테스트가 **PASS**로 확인됨.

**수정 확인됨.**

---

### 4. MockLLMAdapter 응답 키 매칭 실패
**[FAIL]**

`mock-adapter.ts:25-26`에서 마지막 user 메시지의 **전체 content**를 키로 사용합니다:
```typescript
const lastUserMessage = params.messages.filter((m) => m.role === "user").pop();
const key = lastUserMessage?.content ?? "default";
```

`mock-adapter.ts:32-38`에서 부분 매칭 로직이 추가되어 있습니다:
```typescript
const partialKey = Object.keys(this.responses).find(
  (k) => k !== "*" && k.length > 0 && key.includes(k)
);
```

그러나 테스트에서 `setResponse("Test content", ...)` 또는 `setResponse("Analyze market data", ...)`로 설정하는데, 실제 user 메시지는 `formatTaskAndObservation()`에 의해 `"Current Task:\n- ID: task-1\n- Type: analysis\n- Description: Analyze market data\n..."` 형태로 변환됩니다.

- `"Analyze market data"` 키는 부분 매칭으로 동작하여 첫 번째 테스트만 통과
- `"Test content"` 키는 실제 메시지에 포함되지 않아 매칭 실패

테스트 실행 결과에서 6개 테스트가 실패하며, 모두 MockLLMAdapter가 fallback 응답 `"Mock response to: ..."` 을 반환하는 것이 원인입니다:
- `analyst-agent.test.ts:99` - "should parse JSON response correctly" FAIL
- `analyst-agent.test.ts:113` - "should handle non-JSON response gracefully" FAIL
- `analyst-agent.test.ts:135` - "should parse JSON without markdown code block" FAIL
- `analyst-agent.test.ts:160` - "should write analysis to knowledge section" FAIL
- `analyst-agent.test.ts:198` - "should include content from original response" FAIL
- `base-agent.test.ts:118` - "should execute task successfully" FAIL

`setResponse("", () => "Test response")` (빈 문자열 키)도 부분 매칭에서 `k.length > 0` 조건으로 제외되어 매칭 실패합니다.

**이슈가 여전히 존재함.**

---

### 5. createAgentTeam 기본값 정책 불일치로 테스트 실패
**[PASS]**

현재 `factory.ts:58-65`에서 기본값 정책이 수정되었습니다:
```typescript
const hasCustomCounts = [
  config.analysts,
  config.executors,
  config.verifiers,
  config.directors,
].some((value) => value !== undefined);

const defaultCount = hasCustomCounts ? 0 : 1;
```

테스트와 일치하는 동작:
- `createAgentTeam({ llm })` → 모든 역할 1개씩 = 4개 (테스트 line 90: `toHaveLength(4)` ✓)
- `createAgentTeam({ llm, analysts: 2 })` → analysts 2개만 = 2개 (테스트 line 186: `toHaveLength(2)` ✓)
- `createAgentTeam({ llm, analysts: 0, ... })` → 0개 (테스트 line 177: `toHaveLength(0)` ✓)

테스트 실행 결과에서도 factory 테스트 파일의 **모든 15개 테스트가 PASS**.

**수정 확인됨.**

---

### 6. execute()에서 최대 에러 초과 시 실행 차단 로직 누락
**[PASS]**

현재 `base-agent.ts:117-127`에서 `execute()` 메서드 시작 시 차단 로직이 구현되어 있습니다:
```typescript
async execute(task: Task, context: AgentContext): Promise<TaskResult> {
    if (this.hasExceededMaxErrors()) {
      this.state = AgentState.ERROR;
      return {
        taskId: task.id,
        success: false,
        output: null,
        error: new Error(`Agent ${this.id} has exceeded maximum error count (${this.maxErrors})`),
        duration: 0,
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
      };
    }
    // ...
```

테스트 `base-agent.test.ts:227-242`의 "should block execution when max errors exceeded"도 **PASS**.

**수정 확인됨.**

---

## 수정이 필요한 항목

### 4. MockLLMAdapter 응답 키 매칭 실패

**문제**: 테스트에서 `setResponse("Test content", ...)` 또는 `setResponse("", () => ...)` 형태로 mock 응답을 설정하지만, 실제 LLM에 전달되는 user 메시지는 `formatTaskAndObservation()`으로 포맷팅된 긴 문자열입니다. 빈 문자열(`""`) 키는 `k.length > 0` 조건에 의해 부분 매칭에서도 제외되어 fallback 응답이 반환됩니다.

**영향받는 테스트** (6개 FAIL):
- `base-agent.test.ts:118` - "should execute task successfully"
- `analyst-agent.test.ts:99` - "should parse JSON response correctly"
- `analyst-agent.test.ts:113` - "should handle non-JSON response gracefully"
- `analyst-agent.test.ts:135` - "should parse JSON without markdown code block"
- `analyst-agent.test.ts:160` - "should write analysis to knowledge section"
- `analyst-agent.test.ts:198` - "should include content from original response"

**수정 방안**: 빈 문자열(`""`) 키를 와일드카드(`"*"`)와 동일하게 처리하거나, 테스트에서 와일드카드 키를 사용하도록 변경해야 합니다.

**방안 A** - MockLLMAdapter에서 빈 문자열 키를 와일드카드로 처리:

```typescript
// mock-adapter.ts:92-94
setResponse(key: string, response: string | ((params: ChatCompletionParams) => string)): void {
    const effectiveKey = key === "" ? "*" : key;
    this.responses[effectiveKey] = response;
}
```

**방안 B** - 테스트에서 `""` 대신 `"*"` 사용:

```typescript
// base-agent.test.ts:112
mockLlm.setResponse("*", () => "Test response");

// analyst-agent.test.ts 해당 위치들
mockLlm.setResponse("*", ...);
```
]]></opus_review>
    <codex_review><![CDATA[
# Checklist Verification Results

## Total Score
10/10

## Item-by-Item Verification
1. PASS `packages/agents/src/__tests__/roles/base-agent.test.ts:34-38`  
2. PASS `packages/agents/src/__tests__/roles/analyst-agent.test.ts:61-65`  
3. PASS `packages/agents/src/__tests__/roles/analyst-agent.test.ts:90-94`  
4. PASS `packages/agents/src/llm/mock-adapter.ts:22-44`  
5. PASS `packages/agents/src/roles/factory.ts:58-66`  
6. PASS `packages/agents/src/roles/base-agent.ts:16-27`  

## Items Requiring Fixes
None.
]]></codex_review>
    <glm_review><![CDATA[
# 체크리스트 검증 결과

## 총점
10/10

## 항목별 검증

1. **base-agent.test.ts execute 블록의 context.board가 undefined로 고정됨**
   - [PASS] shadow 선언이 제거되었으며, outer beforeEach에서 초기화된 context를 사용함 (base-agent.test.ts:24, 34-38, 109)

2. **analyst-agent.test.ts execute 블록의 context.board가 undefined로 고정됨**
   - [PASS] context.board는 undefined가 아니며, `board: blackboard`로 올바르게 초기화됨 (analyst-agent.test.ts:58, 60-66)

3. **analyst-agent.test.ts act 블록의 context.board가 undefined로 고정됨**
   - [PASS] context.board는 undefined가 아니며, `board: blackboard`로 올바르게 초기화됨 (analyst-agent.test.ts:287, 289-295)

4. **MockLLMAdapter 응답 키 매칭 실패**
   - [PASS] 부분 매칭 로직이 구현되어 있음 (mock-adapter.ts:32-39)

5. **createAgentTeam 기본값 정책 불일치로 테스트 실패**
   - [PASS] hasCustomCounts 기반 기본값 정책이 올바르게 구현되어 있음 (factory.ts:58-65)

6. **execute()에서 최대 에러 초과 시 실행 차단 로직 누락**
   - [PASS] hasExceededMaxErrors() 체크가 실행 시작 시 수행됨 (base-agent.ts:117-127)
]]></glm_review>
  </reviews>

  <source_code>

  </source_code>

  <previous_rounds><![CDATA[
## Round 1 결과\n\n### opus\n

I need to examine the actual code to verify the issues raised in the reviews, particularly the MockLLMAdapter key matching issue that Opus flagged but Codex and GLM passed.
Now let me run the tests to see the actual results and also check the remaining source files:
The test output confirms the issue. Let me verify the confidence value discrepancy in analyst-agent.test.ts as well:
Now I have all the evidence needed. Let me compile the final judgment.

## 최종 점수
- **총점: 4/10**

## 확정된 이슈

### [P0] MockLLMAdapter에서 빈 문자열(`""`) 키가 부분 매칭에서 제외되어 테스트 6개 실패

- **파일**: `packages/agents/src/llm/mock-adapter.ts:34`
- **문제점**: 테스트에서 `mockLlm.setResponse("", () => "Test response")` 또는 `mockLlm.setResponse("Test content", ...)` 형태로 mock 응답을 설정하지만, 실제 LLM에 전달되는 user 메시지는 `formatTaskAndObservation()`에 의해 `"Current Task:\n- ID: task-1\n..."` 형태의 긴 문자열로 변환된다.

  - 빈 문자열(`""`) 키: `k.length > 0` 조건(line 34)에 의해 부분 매칭에서 제외됨 → fallback `"Mock response to: ..."` 반환
  - `"Test content"` 키: 실제 메시지에 `"Test content"`라는 문자열이 포함되지 않음 → 역시 매칭 실패

  테스트 실행 결과 **6개 테스트 FAIL** 확인:
  - `base-agent.test.ts:118` - "should execute task successfully"
  - `analyst-agent.test.ts:99` - "should parse JSON response correctly"
  - `analyst-agent.test.ts:113` - "should handle non-JSON response gracefully"
  - `analyst-agent.test.ts:135` - "should parse JSON without markdown code block"
  - `analyst-agent.test.ts:160` - "should write analysis to knowledge section"
  - `analyst-agent.test.ts:198` - "should include content from original response"

- **수정 전 코드**:
```typescript
setResponse(key: string, response: string | ((params: ChatCompletionParams) => string)): void {
    this.responses[key] = response;
}
```

- **수정 후 코드**:
```typescript
setResponse(key: string, response: string | ((params: ChatCompletionParams) => string)): void {
    const effectiveKey = key === "" ? "*" : key;
    this.responses[effectiveKey] = response;
}
```

  추가로, `"Test content"` 키를 사용하는 analyst-agent.test.ts의 5개 테스트도 수정 필요. 테스트의 task description이 `"Analyze market data"`이므로, `"Test content"` 키가 포맷팅된 메시지에 포함되지 않는다. `"Test content"` → `"*"` 로 변경하거나 task description에 포함되는 문자열로 변경해야 한다.

- **analyst-agent.test.ts 수정 전** (line 94, 107, 127-128, 147, 174, 193):
```typescript
mockLlm.setResponse("Test content", `\`\`\`json\n${jsonResponse}\n\`\`\``);
```

- **analyst-agent.test.ts 수정 후**:
```typescript
mockLlm.setResponse("*", `\`\`\`json\n${jsonResponse}\n\`\`\``);
```

  각 해당 테스트 위치:
  - line 94: `setResponse("Test content", ...)` → `setResponse("*", ...)`
  - line 107: `setResponse("Test content", ...)` → `setResponse("*", ...)`
  - line 127-128: `setResponse("Test content", ...)` → `setResponse("*", ...)`
  - line 147: `setResponse("Test content", ...)` → `setResponse("*", ...)`
  - line 174: `setResponse("Test content", ...)` → `setResponse("*", ...)`
  - line 193: `setResponse("Test content", ...)` → `setResponse("*", ...)`

## 기각된 이슈

### 1. base-agent.test.ts execute 블록의 context.board가 undefined로 고정됨
- **기각 이유**: 3개 리뷰 모두 PASS 판정. 실제 코드 확인 결과, shadow 선언이 제거되어 올바르게 수정됨 (line 109 주석으로 확인).

### 2. analyst-agent.test.ts execute 블록의 context.board가 undefined로 고정됨
- **기각 이유**: 3개 리뷰 모두 PASS 판정. 실제 코드 확인 결과 `board: blackboard`로 올바르게 초기화됨 (line 60-66).

### 3. analyst-agent.test.ts act 블록의 context.board가 undefined로 고정됨
- **기각 이유**: 3개 리뷰 모두 PASS 판정. 실제 코드 확인 결과 `board: blackboard`로 올바르게 초기화됨 (line 289-295).

### 4. createAgentTeam 기본값 정책 불일치로 테스트 실패
- **기각 이유**: 3개 리뷰 모두 PASS 판정. `hasCustomCounts` 기반 기본값 정책이 올바르게 구현됨.

### 5. execute()에서 최대 에러 초과 시 실행 차단 로직 누락
- **기각 이유**: 3개 리뷰 모두 PASS 판정. `base-agent.ts:117-127`에 차단 로직이 올바르게 구현됨.

## Fixer 지시사항
확정된 P0/P1 이슈만 아래 순서대로 수정하세요:
1. `packages/agents/src/llm/mock-adapter.ts:92-94`의 `setResponse` 메서드에서 빈 문자열 키를 와일드카드(`"*"`)로 변환하도록 수정
2. `packages/agents/src/__tests__/roles/analyst-agent.test.ts`의 6곳에서 `setResponse("Test content", ...)` 호출을 `setResponse("*", ...)`로 변경 (line 94, 107, 127-128, 147, 174, 193)
3. 수정 후 `npx vitest run packages/agents/src/__tests__/roles/` 실행하여 6개 실패 테스트가 모두 통과하는지 확인\n\n### codex\n## 최종 점수
- **총점: 9/10**

## 확정된 이슈

### [P1] MockLLMAdapter 빈 키 응답 매칭 실패
- **파일**: `packages/agents/src/llm/mock-adapter.ts:92`
- **문제점**: 테스트에서 `setResponse("")`로 설정한 응답이 실제 매칭 로직에서 사용되지 않습니다. `chatCompletion()`은 마지막 user 메시지 전체를 키로 사용하고, 부분 매칭은 `k.length > 0` 조건으로 빈 문자열을 제외하므로 `""` 키는 어떤 경우에도 매칭되지 않습니다. 그 결과 `Mock response to: ...`로 fallback되어 테스트가 실패합니다.
- **수정 전 코드**:
```typescript
setResponse(key: string, response: string | ((params: ChatCompletionParams) => string)): void {
  this.responses[key] = response;
}
```
- **수정 후 코드**:
```typescript
setResponse(key: string, response: string | ((params: ChatCompletionParams) => string)): void {
  const effectiveKey = key === "" ? "*" : key;
  this.responses[effectiveKey] = response;
}
```

## 기각된 이슈

### (없음)
- **기각 이유**: 해당 없음

## Fixer 지시사항
확정된 P0/P1 이슈만 아래 순서대로 수정하세요:
1. MockLLMAdapter 빈 키 응답 매칭 실패 (`packages/agents/src/llm/mock-adapter.ts:92`)\n\n### glm\nThe test results confirm that 6 tests are failing due to the MockLLMAdapter response matching issue. Let me verify the exact fix needed:
Now let me check which tests in analyst-agent.test.ts use "Test content" key:
## 최종 점수
- **총점: 7/10**

## 확정된 이슈

### [P0] MockLLMAdapter 응답 키 매칭 실패
- **파일**: packages/agents/src/llm/mock-adapter.ts:32-34
- **문제점**: `setResponse("", ...)`로 빈 문자열 키를 설정할 경우 부분 매칭 시 `k.length > 0` 조건에 의해 제외되어 fallback 응답이 반환됨. 테스트에서 빈 문자열 키는 와일드카드(`"*"`)처럼 동작해야 함
- **수정 전 코드**:
```typescript
const partialKey = Object.keys(this.responses).find(
  (k) => k !== "*" && k.length > 0 && key.includes(k)
);
```
- **수정 후 코드**:
```typescript
// 빈 문자열 키를 와일드카드처럼 처리
const partialKey = Object.keys(this.responses).find(
  (k) => k !== "*" && (k.length === 0 || key.includes(k))
);
```

## 기각된 이슈

### 1. base-agent.test.ts execute 블록의 context.board가 undefined로 고정됨
- **기각 이유**: 이미 수정됨. shadow 선언이 제거되었으며 outer beforeEach에서 초기화된 context를 올바르게 사용함

### 2. analyst-agent.test.ts execute 블록의 context.board가 undefined로 고정됨
- **기각 이유**: 이미 수정됨. execute 블록 내부에서 context를 `board: blackboard`로 올바르게 초기화함

### 3. analyst-agent.test.ts act 블록의 context.board가 undefined로 고정됨
- **기각 이유**: 이미 수정됨. act 블록 내부에서 context를 `board: blackboard`로 올바르게 초기화함

### 4. createAgentTeam 기본값 정책 불일치로 테스트 실패
- **기각 이유**: 이미 수정됨. hasCustomCounts 기반 기본값 정책이 올바르게 구현되어 있으며 테스트 통과

### 5. execute()에서 최대 에러 초과 시 실행 차단 로직 누락
- **기각 이유**: 이미 수정됨. execute() 메서드 시작 시 hasExceededMaxErrors() 체크가 구현되어 있음

## Fixer 지시사항
확정된 P0 이슈를 수정하세요:
1. MockLLMAdapter 응답 키 매칭 실패 수정 (`packages/agents/src/llm/mock-adapter.ts:32-34`)\n\n
]]></previous_rounds>

  <instructions>
    위의 3개 리뷰를 모두 읽고 다음을 수행하세요:

    1. 각 리뷰에서 발견된 이슈를 종합하세요
    2. 각 이슈에 대해 실제 코드를 확인한 후 유효한지 판단하세요
    3. 최종 확정된 이슈 목록 (P0/P1만)과 기각된 이슈 목록을 작성하세요
    4. 확정된 이슈에는 구체적인 수정 코드를 포함하세요
    5. 최종 점수를 부여하세요 (10점 만점)

    규칙:
    - 스펙에 명시되지 않은 기능의 부재는 이슈가 아닙니다
    - P2는 통과 여부에 영향 없음
    - 근거 없는 이슈는 기각하세요
  </instructions>

  <output_format>
    아래 형식을 정확히 따라주세요.

    ## 최종 점수
    - **총점: X/10**

    ## 확정된 이슈

    ### [P0] 이슈 제목
    - **파일**: 파일경로:라인번호
    - **문제점**: 구체적 설명
    - **수정 전 코드**:
    ```typescript
    현재 코드
    ```
    - **수정 후 코드**:
    ```typescript
    수정된 코드
    ```

    ### [P1] 이슈 제목
    - **파일**: 파일경로:라인번호
    - **문제점**: 구체적 설명
    - **수정 전 코드**:
    ```typescript
    현재 코드
    ```
    - **수정 후 코드**:
    ```typescript
    수정된 코드
    ```

    ## 기각된 이슈

    ### 이슈 제목
    - **기각 이유**: 설명

    ## Fixer 지시사항
    확정된 P0/P1 이슈만 아래 순서대로 수정하세요:
    1. (첫 번째 수정할 이슈)
    2. (두 번째 수정할 이슈)
    P2 이슈는 수정하지 마세요.
  </output_format>
</debate>

위의 내용을 바탕으로 3개 리뷰를 종합 판정하고 마크다운으로 출력하세요.
