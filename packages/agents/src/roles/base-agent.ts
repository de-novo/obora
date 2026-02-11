import { LLMAdapter, ChatMessage, ChatCompletionParams } from "../llm/adapter";
import type { Blackboard } from "@obora-kit/blackboard";

/**
 * 에이전트 ID 타입
 */
export type AgentId = string;

/**
 * 에이전트 역할
 */
export enum AgentRole {
  ANALYST = "analyst",
  EXECUTOR = "executor",
  VERIFIER = "verifier",
  DIRECTOR = "director",
}

/**
 * 에이전트 상태
 */
export enum AgentState {
  IDLE = "idle",
  THINKING = "thinking",
  ACTING = "acting",
  WAITING = "waiting",
  ERROR = "error",
}

/**
 * 회의 단계
 */
export enum MeetingPhase {
  OPENING = "opening",
  DISCUSSION = "discussion",
  VOTING = "voting",
  CONSENSUS = "consensus",
  CLOSING = "closing",
  ESCALATION = "escalation",
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
    this.maxErrors = config.maxErrors ?? 3;
  }

  /**
   * 작업 실행
   */
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

    const startTime = Date.now();
    this.state = AgentState.THINKING;

    try {
      // 1. 관찰 (Observe) - Blackboard에서 정보 읽기
      const observation = await this.observe(context);

      // 2. 사고 (Think) - LLM을 사용하여 의사결정
      const { action, usage } = await this.think(task, observation, context);

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
        tokensUsed: {
          prompt: usage.promptTokens,
          completion: usage.completionTokens,
          total: usage.totalTokens,
        },
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
    const state = (context.board.read("state", { strict: false }) as Record<string, unknown>) ?? {};
    const knowledge =
      (context.board.read("knowledge", { strict: false }) as Record<string, unknown>) ?? {};

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
  ): Promise<{
    action: unknown;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  }> {
    const messages = this.buildMessages(task, observation, context);

    const result = await this.llm.chatCompletion({
      messages,
      temperature: 0.7,
      maxTokens: 2048,
    });

    // 역할별 응답 파싱
    return {
      action: this.parseResponse(result.message.content ?? "", task),
      usage: result.usage,
    };
  }

  /**
   * 실행 - 의사결정 수행 (하위 클래스에서 구현)
   */
  protected abstract act(action: unknown, context: AgentContext): Promise<unknown>;

  /**
   * 보고 - 결과를 Blackboard에 기록
   */
  protected async report(task: Task, result: unknown, context: AgentContext): Promise<void> {
    context.board.write(`state.context.agent.${this.id}.lastResult`, {
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
    const messages: ChatMessage[] = [{ role: "system", content: this.systemPrompt }];

    // 이력에 최근 N개의 메시지 추가
    const recentHistory = context.history.slice(-10);
    messages.push(...recentHistory);

    // 현재 컨텍스트 정보 추가
    messages.push({
      role: "user",
      content: this.formatTaskAndObservation(task, observation),
    });

    return messages;
  }

  /**
   * 작업 및 관찰 포맷팅
   */
  protected formatTaskAndObservation(task: Task, observation: Record<string, unknown>): string {
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
  type: "analysis";
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
  type: "analysis";
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
  type: "execution";
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
  type: "execution";
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
  type: "verification";
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
  type: "verification";
  content: string;
  passed: boolean;
  score: number; // 0-100
  checks: VerificationCheck[];
  findings: Finding[];
  suggestions: string[];
}

/**
 * Director 입력 타입
 */
export interface DirectorInput {
  type: "coordination";
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
  type: "coordination";
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
  status: "passed" | "failed" | "skipped";
  evidence: string;
}

/**
 * 발견된 이슈
 */
export interface Finding {
  id: string;
  type: "error" | "warning" | "info";
  description: string;
  location?: string;
  severity: "low" | "medium" | "high" | "critical";
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
  severity: "minor" | "moderate" | "major";
}

/**
 * 아티팩트
 */
export interface Artifact {
  id: string;
  type: "code" | "document" | "data" | "plan" | "review";
  name: string;
  content: string | Record<string, unknown>;
}

/**
 * Plan 타입 (AnalystInput에서 참조)
 */
export interface Plan {
  id: string;
  description: string;
  steps: string[];
  status: "draft" | "approved" | "completed";
}
