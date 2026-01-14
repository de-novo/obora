/**
 * Workflow Tracker
 *
 * 모든 워크플로우 실행을 중앙 DB에 기록
 * ProjectService와 통합하여 프로젝트 식별
 * 이벤트 소싱 패턴으로 SaaS 동기화 준비
 */

import {
  getDb,
  eq,
  sql,
  sessions,
  workflows,
  workflowSteps,
  agentRuns,
  syncEvents,
  type DrizzleDb,
  type WorkflowType,
  type StepStatus,
  type AgentRunStatus,
  type SyncEventType,
  type SyncEntityType,
} from "@obora/database";
import { getProjectService, type ProjectService } from "./project-service.js";
import type { AgentResult, WorkflowPlan, ResolvedProject } from "./types.js";

// ============================================================================
// ID Generation
// ============================================================================

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// WorkflowTracker Class
// ============================================================================

export class WorkflowTracker {
  private db: DrizzleDb | null = null;
  private projectService: ProjectService;
  private project: ResolvedProject | null = null;
  private sessionId: string | null = null;
  private workflowId: string | null = null;
  private stepIds: Map<number, string> = new Map();

  constructor() {
    this.projectService = getProjectService();
  }

  /**
   * 트래커 초기화 (프로젝트 해석 및 DB 연결)
   */
  async initialize(cwd: string): Promise<boolean> {
    // ProjectService 초기화
    const initialized = await this.projectService.initialize();
    if (!initialized) {
      console.warn("[Tracker] ProjectService initialization failed");
      return false;
    }

    this.db = getDb();
    if (!this.db) {
      console.warn("[Tracker] Database not available");
      return false;
    }

    // 프로젝트 해석
    this.project = await this.projectService.resolveProject(cwd);
    return true;
  }

  /**
   * 현재 프로젝트 정보 반환
   */
  getProject(): ResolvedProject | null {
    return this.project;
  }

  // ==========================================================================
  // Event Recording (Event Sourcing)
  // ==========================================================================

  /**
   * 이벤트 기록 (SaaS 동기화용)
   */
  private recordEvent(
    eventType: SyncEventType,
    entityType: SyncEntityType,
    entityId: string,
    payload?: Record<string, unknown>
  ): void {
    if (!this.db || !this.project) return;

    try {
      this.db
        .insert(syncEvents)
        .values({
          id: generateId("evt"),
          projectId: this.project.id,
          eventType,
          entityType,
          entityId,
          payload,
          syncStatus: this.project.syncEnabled ? "pending" : "skipped",
        })
        .run();
    } catch (error) {
      // 이벤트 기록 실패는 주요 동작에 영향 없음 - 디버그 로깅만 수행
      if (process.env.DEBUG) {
        console.debug("[tracker] sync event failed:", error);
      }
    }
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  /**
   * 세션 시작 (CLI/Chat 시작 시 호출)
   */
  startSession(): string | null {
    if (!this.db || !this.project) return null;

    const id = generateId("sess");
    this.db
      .insert(sessions)
      .values({
        id,
        projectId: this.project.id,
        status: "active",
      })
      .run();

    this.sessionId = id;

    // 이벤트 기록
    this.recordEvent("session.started", "session", id, {
      projectId: this.project.id,
      projectName: this.project.name,
      identifiedBy: this.project.identifiedBy,
    });

    return id;
  }

  /**
   * 세션 완료
   */
  completeSession(summary?: string): void {
    if (!this.db || !this.sessionId) return;

    this.db
      .update(sessions)
      .set({
        status: "completed",
        endedAt: new Date(),
        summary,
      })
      .where(eq(sessions.id, this.sessionId))
      .run();

    // 이벤트 기록
    this.recordEvent("session.completed", "session", this.sessionId, {
      summary,
    });

  }

  /**
   * 세션 실패
   */
  failSession(error?: string): void {
    if (!this.db || !this.sessionId) return;

    this.db
      .update(sessions)
      .set({
        status: "failed",
        endedAt: new Date(),
        metadata: error ? { error } : undefined,
      })
      .where(eq(sessions.id, this.sessionId))
      .run();

    // 이벤트 기록
    this.recordEvent("session.failed", "session", this.sessionId, {
      error,
    });
  }

  // ==========================================================================
  // Workflow Management
  // ==========================================================================

  /**
   * 워크플로우 시작 (executeWorkflow 시작 시 호출)
   */
  startWorkflow(
    type: WorkflowType,
    name: string,
    input?: Record<string, unknown>
  ): string | null {
    if (!this.db || !this.sessionId) return null;

    const id = generateId("wf");
    this.db
      .insert(workflows)
      .values({
        id,
        sessionId: this.sessionId,
        name,
        type,
        status: "planning",
        startedAt: new Date(),
        input,
      })
      .run();

    this.workflowId = id;
    this.stepIds.clear();

    // 이벤트 기록
    this.recordEvent("workflow.started", "workflow", id, {
      type,
      name,
      input,
    });

    return id;
  }

  /**
   * 워크플로우 계획 완료
   */
  planCompleted(plan: WorkflowPlan): void {
    if (!this.db || !this.workflowId) return;

    this.db
      .update(workflows)
      .set({
        status: "running",
        input: { analysis: plan.analysis, feedbackLoop: plan.feedbackLoop },
      })
      .where(eq(workflows.id, this.workflowId))
      .run();

    // 스텝 미리 생성
    plan.workflow.forEach((step, index) => {
      const stepId = generateId("step");
      this.db!.insert(workflowSteps)
        .values({
          id: stepId,
          workflowId: this.workflowId!,
          stepNumber: index,
          agentType: step.agent,
          taskDescription: step.task,
          status: "pending",
        })
        .run();
      this.stepIds.set(index, stepId);
    });

    // 이벤트 기록
    this.recordEvent("workflow.planned", "workflow", this.workflowId, {
      analysis: plan.analysis,
      stepCount: plan.workflow.length,
      feedbackLoopEnabled: plan.feedbackLoop?.enabled,
    });
  }

  /**
   * 워크플로우 완료
   */
  completeWorkflow(output?: Record<string, unknown>): void {
    if (!this.db || !this.workflowId) return;

    // 총 토큰 계산
    const stepsResult = this.db
      .select({ tokensUsed: workflowSteps.tokensUsed })
      .from(workflowSteps)
      .where(eq(workflowSteps.workflowId, this.workflowId))
      .all();

    const totalTokens = stepsResult.reduce((sum, s) => sum + s.tokensUsed, 0);

    this.db
      .update(workflows)
      .set({
        status: "completed",
        endedAt: new Date(),
        output,
        tokensUsed: totalTokens,
      })
      .where(eq(workflows.id, this.workflowId))
      .run();

    // 세션 토큰 업데이트
    if (this.sessionId) {
      const session = this.db
        .select({ totalTokens: sessions.totalTokens })
        .from(sessions)
        .where(eq(sessions.id, this.sessionId))
        .get();

      if (session) {
        this.db
          .update(sessions)
          .set({ totalTokens: session.totalTokens + totalTokens })
          .where(eq(sessions.id, this.sessionId))
          .run();
      }
    }

    // 이벤트 기록
    this.recordEvent("workflow.completed", "workflow", this.workflowId, {
      output,
      tokensUsed: totalTokens,
    });

  }

  /**
   * 워크플로우 실패
   */
  failWorkflow(error: string): void {
    if (!this.db || !this.workflowId) return;

    this.db
      .update(workflows)
      .set({
        status: "failed",
        endedAt: new Date(),
        error,
      })
      .where(eq(workflows.id, this.workflowId))
      .run();

    // 이벤트 기록
    this.recordEvent("workflow.failed", "workflow", this.workflowId, {
      error,
    });
  }

  // ==========================================================================
  // Step Management
  // ==========================================================================

  /**
   * 스텝 시작
   */
  startStep(stepIndex: number): void {
    if (!this.db) return;

    const stepId = this.stepIds.get(stepIndex);
    if (!stepId) return;

    this.db
      .update(workflowSteps)
      .set({
        status: "running",
        startedAt: new Date(),
      })
      .where(eq(workflowSteps.id, stepId))
      .run();

    // 이벤트 기록
    this.recordEvent("step.started", "step", stepId, {
      stepIndex,
    });

  }

  /**
   * 스텝 완료
   */
  completeStep(
    stepIndex: number,
    result: AgentResult,
    tokensUsed: number = 0
  ): void {
    if (!this.db) return;

    const stepId = this.stepIds.get(stepIndex);
    if (!stepId) return;

    const status: StepStatus = result.success ? "completed" : "failed";

    this.db
      .update(workflowSteps)
      .set({
        status,
        endedAt: new Date(),
        output: { result: result.output },
        error: result.error,
        tokensUsed,
      })
      .where(eq(workflowSteps.id, stepId))
      .run();

    // 이벤트 기록
    const eventType: SyncEventType = result.success
      ? "step.completed"
      : "step.failed";
    this.recordEvent(eventType, "step", stepId, {
      stepIndex,
      success: result.success,
      error: result.error,
      tokensUsed,
    });
  }

  // ==========================================================================
  // Agent Run Tracking (Real-time)
  // ==========================================================================

  private currentAgentRunId: string | null = null;

  /**
   * 에이전트 실행 시작 (실시간 추적)
   */
  startAgentRun(
    agentType: string,
    model: string,
    prompt: string,
    stepIndex?: number
  ): string | null {
    if (!this.db || !this.sessionId) return null;

    const id = generateId("ar");
    const stepId =
      stepIndex !== undefined ? this.stepIds.get(stepIndex) : undefined;

    this.db
      .insert(agentRuns)
      .values({
        id,
        sessionId: this.sessionId,
        workflowStepId: stepId,
        agentType,
        status: "running",
        model,
        prompt: prompt.slice(0, 50000),
        startedAt: new Date(),
        tokensUsed: 0,
        inputTokens: 0,
        outputTokens: 0,
        toolCallCount: 0,
        lastStreamUpdate: new Date(),
      })
      .run();

    this.currentAgentRunId = id;

    // 이벤트 기록
    this.recordEvent("agent.started", "agent_run", id, {
      agentType,
      model,
      stepIndex,
    });

    return id;
  }

  /**
   * 현재 도구 업데이트 (실시간)
   */
  updateCurrentTool(toolName: string, toolInput?: Record<string, unknown>): void {
    if (!this.db || !this.currentAgentRunId) return;

    this.db
      .update(agentRuns)
      .set({
        currentTool: toolName,
        currentToolInput: toolInput,
        lastStreamUpdate: new Date(),
      })
      .where(eq(agentRuns.id, this.currentAgentRunId))
      .run();
  }

  /**
   * 도구 호출 완료 (카운트 증가)
   */
  completeToolCall(toolName: string): void {
    if (!this.db || !this.currentAgentRunId) return;

    try {
      // tool_call_count 증가, current_tool 클리어
      // raw SQL로 increment 수행
      this.db.run(sql`
        UPDATE agent_runs
        SET
          current_tool = NULL,
          current_tool_input = NULL,
          tool_call_count = COALESCE(tool_call_count, 0) + 1,
          last_stream_update = ${Math.floor(Date.now() / 1000)}
        WHERE id = ${this.currentAgentRunId}
      `);
    } catch {
      // 에러 무시 - 추적 실패가 워크플로우를 중단시키면 안 됨
    }
  }

  /**
   * 에이전트 실행 완료
   */
  completeAgentRun(
    result: AgentResult,
    tokensUsed: number = 0,
    inputTokens: number = 0,
    outputTokens: number = 0
  ): void {
    if (!this.db || !this.currentAgentRunId) return;

    const status: AgentRunStatus = result.success ? "completed" : "failed";

    this.db
      .update(agentRuns)
      .set({
        status,
        endedAt: new Date(),
        tokensUsed,
        inputTokens,
        outputTokens,
        output: result.output?.slice(0, 50000),
        result: { output: result.output?.slice(0, 10000) },
        error: result.error,
        currentTool: null,
        currentToolInput: null,
        lastStreamUpdate: new Date(),
      })
      .where(eq(agentRuns.id, this.currentAgentRunId))
      .run();

    // 이벤트 기록
    const eventType: SyncEventType = result.success
      ? "agent.completed"
      : "agent.failed";
    this.recordEvent(eventType, "agent_run", this.currentAgentRunId, {
      success: result.success,
      error: result.error,
      tokensUsed,
      inputTokens,
      outputTokens,
    });

    this.currentAgentRunId = null;
  }

  /**
   * 현재 에이전트 실행 ID
   */
  getCurrentAgentRunId(): string | null {
    return this.currentAgentRunId;
  }

  /**
   * 에이전트 실행 기록 (레거시 - 호환성 유지)
   */
  recordAgentRun(
    agentType: string,
    result: AgentResult,
    stepIndex?: number,
    tokensUsed: number = 0,
    toolsCalled?: string[]
  ): string | null {
    if (!this.db || !this.sessionId) return null;

    const id = generateId("ar");
    const status: AgentRunStatus = result.success ? "completed" : "failed";
    const stepId =
      stepIndex !== undefined ? this.stepIds.get(stepIndex) : undefined;

    this.db
      .insert(agentRuns)
      .values({
        id,
        sessionId: this.sessionId,
        workflowStepId: stepId,
        agentType,
        status,
        endedAt: new Date(),
        tokensUsed,
        toolsCalled,
        result: { output: result.output },
        error: result.error,
      })
      .run();

    // 이벤트 기록
    const eventType: SyncEventType = result.success
      ? "agent.completed"
      : "agent.failed";
    this.recordEvent(eventType, "agent_run", id, {
      agentType,
      stepIndex,
      success: result.success,
      error: result.error,
      tokensUsed,
      toolsCalled,
    });

    return id;
  }

  // ==========================================================================
  // Getters
  // ==========================================================================

  getSessionId(): string | null {
    return this.sessionId;
  }

  getWorkflowId(): string | null {
    return this.workflowId;
  }

  getProjectId(): string | null {
    return this.project?.id ?? null;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let trackerInstance: WorkflowTracker | null = null;

/**
 * 글로벌 트래커 인스턴스 획득
 */
export function getTracker(): WorkflowTracker {
  if (!trackerInstance) {
    trackerInstance = new WorkflowTracker();
  }
  return trackerInstance;
}

/**
 * 트래커 인스턴스 리셋 (테스트용)
 */
export function resetTracker(): void {
  trackerInstance = null;
}
