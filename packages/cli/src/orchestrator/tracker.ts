/**
 * Workflow Tracker
 *
 * 모든 워크플로우 실행을 중앙 DB에 기록
 */

import {
  getDb,
  eq,
  projects,
  sessions,
  workflows,
  workflowSteps,
  agentRuns,
  type DrizzleDb,
  type WorkflowType,
  type WorkflowStatus,
  type StepStatus,
  type AgentRunStatus,
} from "@obora/database";
import { initializeDb } from "./db-init.js";
import type { AgentResult, WorkflowPlan } from "./types.js";

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
  private projectId: string | null = null;
  private sessionId: string | null = null;
  private workflowId: string | null = null;
  private stepIds: Map<number, string> = new Map();

  /**
   * 트래커 초기화 (DB 연결 및 프로젝트 등록)
   */
  async initialize(projectPath: string): Promise<boolean> {
    // DB 초기화 (없으면 생성)
    await initializeDb();

    this.db = getDb();
    if (!this.db) {
      console.warn("[Tracker] Database not available");
      return false;
    }

    // 프로젝트 등록 또는 조회
    this.projectId = await this.ensureProject(projectPath);
    return true;
  }

  /**
   * 프로젝트 등록 또는 기존 프로젝트 조회
   */
  private async ensureProject(projectPath: string): Promise<string> {
    if (!this.db) throw new Error("Database not initialized");

    // 기존 프로젝트 조회
    const existing = this.db
      .select()
      .from(projects)
      .where(eq(projects.path, projectPath))
      .get();

    if (existing) {
      // 업데이트 시간 갱신
      this.db
        .update(projects)
        .set({ updatedAt: new Date() })
        .where(eq(projects.id, existing.id))
        .run();
      return existing.id;
    }

    // 새 프로젝트 생성
    const id = generateId("proj");
    const name = projectPath.split("/").pop() || "Unknown";

    this.db
      .insert(projects)
      .values({
        id,
        name,
        path: projectPath,
      })
      .run();

    return id;
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  /**
   * 세션 시작 (CLI/Chat 시작 시 호출)
   */
  startSession(): string | null {
    if (!this.db || !this.projectId) return null;

    const id = generateId("sess");
    this.db
      .insert(sessions)
      .values({
        id,
        projectId: this.projectId,
        status: "active",
      })
      .run();

    this.sessionId = id;
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
  }

  /**
   * 세션 실패
   */
  failSession(): void {
    if (!this.db || !this.sessionId) return;

    this.db
      .update(sessions)
      .set({
        status: "failed",
        endedAt: new Date(),
      })
      .where(eq(sessions.id, this.sessionId))
      .run();
  }

  // ==========================================================================
  // Workflow Management
  // ==========================================================================

  /**
   * 워크플로우 시작 (executeWorkflow 시작 시 호출)
   */
  startWorkflow(type: WorkflowType, name: string, input?: Record<string, unknown>): string | null {
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
      this.db!
        .insert(workflowSteps)
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
  }

  /**
   * 스텝 완료
   */
  completeStep(stepIndex: number, result: AgentResult, tokensUsed: number = 0): void {
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
  }

  // ==========================================================================
  // Agent Run Tracking
  // ==========================================================================

  /**
   * 에이전트 실행 기록
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
    const stepId = stepIndex !== undefined ? this.stepIds.get(stepIndex) : undefined;

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
    return this.projectId;
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
