/**
 * Workflow Core Type Definitions
 */

// ============================================================================
// Project Configuration (.obora/project.yaml)
// ============================================================================

/**
 * 프로젝트 설정 파일 구조 (.obora/project.yaml)
 *
 * Git에 커밋되어 팀과 공유됨
 * 프로젝트 고유 식별자로 경로 변경/머신 변경에도 동일 프로젝트 인식
 */
export interface ProjectConfig {
  /** 프로젝트 고유 ID (UUID 형식, 한 번 생성되면 변경 불가) */
  id: string;

  /** 프로젝트 이름 */
  name: string;

  /** 프로젝트 설명 (선택) */
  description?: string;

  /** 생성 시간 */
  createdAt: string;

  /** 워크플로우 설정 */
  workflow?: {
    /** 기본 워크플로우 타입 */
    defaultType?: "implement" | "fix" | "review" | "commit" | "refactor" | "test" | "custom";
    /** 피드백 루프 기본 설정 */
    feedbackLoop?: {
      enabled: boolean;
      maxIterations: number;
    };
  };

  /** 클라우드 동기화 설정 (SaaS) */
  sync?: {
    /** 동기화 활성화 여부 */
    enabled: boolean;
    /** 조직 ID (SaaS 연동 시) */
    organizationId?: string;
    /** 자동 동기화 여부 */
    autoSync?: boolean;
  };
}

/**
 * 프로젝트 식별자 (해석 우선순위)
 */
export interface ProjectIdentifier {
  /** .obora/project.yaml의 id (최우선) */
  configId?: string;
  /** Git remote origin URL */
  gitRemote?: string;
  /** 프로젝트 로컬 경로 (fallback) */
  localPath: string;
}

/**
 * 해석된 프로젝트 정보
 */
export interface ResolvedProject {
  /** DB 내부 ID */
  id: string;
  /** 프로젝트 이름 */
  name: string;
  /** 프로젝트 경로 */
  path: string;
  /** 식별 방식 */
  identifiedBy: "config" | "git" | "path";
  /** 설정 파일 존재 여부 */
  hasConfig: boolean;
  /** 동기화 활성화 여부 */
  syncEnabled: boolean;
}

// ============================================================================
// Agent Definitions
// ============================================================================

export interface AgentDefinition {
  name: string;
  description: string;
  allowedTools: string[];
  systemPrompt: string;
}

export interface WorkflowStep {
  agent: string;
  task: string;
  reason?: string;
  critical?: boolean;
  parallelWith?: string[];
}

export interface FeedbackLoop {
  enabled: boolean;
  maxIterations: number;
}

export interface WorkflowPlan {
  analysis: string;
  workflow: WorkflowStep[];
  feedbackLoop?: FeedbackLoop;
}

export interface AgentResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface SessionInfo {
  sessionId: string;
  startedAt: Date;
  cwd: string;
}

// ============================================================================
// AgentProvider Interface (Provider-Agnostic)
// ============================================================================

/**
 * Provider-agnostic agent execution interface
 *
 * Implementations:
 * - ClaudeAgentProvider (using @anthropic-ai/claude-agent-sdk)
 * - OpenAIAgentProvider (future)
 * - CustomAgentProvider (custom implementation)
 */
export interface AgentProvider {
  /** Provider name (e.g., "claude", "openai") */
  readonly name: string;

  /**
   * Run an agent with the given task
   *
   * @param agent - Agent definition
   * @param task - Task to execute
   * @param cwd - Working directory
   * @param options - Additional options
   * @returns AsyncIterable of agent messages (for streaming)
   */
  runAgent(
    agent: AgentDefinition,
    task: string,
    cwd: string,
    options?: AgentRunOptions
  ): AsyncIterable<AgentMessage>;
}

export interface AgentRunOptions {
  /** Maximum number of turns */
  maxTurns?: number;
  /** Message callback for streaming */
  onMessage?: (message: AgentMessage) => void;
  /** Workflow tracker for DB logging */
  tracker?: WorkflowTracker;
  /** Model to use (provider-specific) */
  model?: string;
}

export interface AgentMessage {
  type: "text" | "tool_use" | "tool_result" | "result" | "error";
  content: string;
  metadata?: {
    toolName?: string;
    toolInput?: Record<string, unknown>;
    tokens?: TokenUsage;
  };
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * WorkflowTracker interface
 *
 * Full interface for workflow tracking and DB logging
 */
export interface WorkflowTracker {
  // Session lifecycle
  initialize(cwd: string): Promise<boolean>;
  startSession(): string | null;
  completeSession(summary?: string): void;
  failSession(error?: string): void;

  // Workflow lifecycle
  startWorkflow(
    type: string,
    name: string,
    input?: Record<string, unknown>
  ): string | null;
  planCompleted(plan: WorkflowPlan): void;
  completeWorkflow(output?: Record<string, unknown>): void;
  failWorkflow(error: string): void;

  // Step tracking
  startStep(stepIndex: number): void;
  completeStep(stepIndex: number, result: AgentResult, tokensUsed?: number): void;

  // Agent run tracking
  startAgentRun(
    agentType: string,
    model: string,
    prompt: string,
    stepIndex?: number
  ): string | null;
  updateCurrentTool(toolName: string, toolInput?: Record<string, unknown>): void;
  completeToolCall(toolName: string): void;
  completeAgentRun(
    result: AgentResult,
    tokensUsed?: number,
    inputTokens?: number,
    outputTokens?: number
  ): void;

  // Getters
  getProject(): ResolvedProject | null;
  getSessionId(): string | null;
  getWorkflowId(): string | null;
  getProjectId(): string | null;
}
