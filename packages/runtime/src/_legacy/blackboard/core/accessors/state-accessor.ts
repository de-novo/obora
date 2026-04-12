/**
 * @module state-accessor
 * @description 상태 섹션 접근자
 */

import type { Blackboard } from "../blackboard";
import type { BoardPhase, StateSection } from "../../types";
import type { AgentStatus, AgentRole } from "../../types";
import { AgentStatusEnum } from "../../types";
import type { Task, TaskId, TaskError } from "../../types";
import { TaskStatus, TaskPriority } from "../../types";
import type { AgentId } from "../../types";
import { BlackboardError, BlackboardErrorCode, PathNotFoundError } from "../blackboard";

/**
 * 상태 섹션 접근자
 * @description state 섹션에 대한 타입 안전한 접근 제공
 */
export class StateSectionAccessor {
  constructor(private readonly board: Blackboard) {}

  // === 단계 관리 ===

  /** 현재 단계 */
  get phase(): BoardPhase {
    return this.board.read<StateSection>("state").phase;
  }

  set phase(value: BoardPhase) {
    const currentPhase = this.phase;
    if (currentPhase === value) {
      return; // No change, don't emit event
    }
    this.board.write("state.phase", value);
    this.board.emit("state.phase.changed", {
      type: "state.phase.changed",
      previousPhase: currentPhase,
      newPhase: value,
    });
  }

  /** 컨텍스트 데이터 */
  get context(): Record<string, unknown> {
    return this.board.read<StateSection>("state").context;
  }

  setContext(key: string, value: unknown): void {
    this.board.write(`state.context.${key}`, value);
  }

  /**
   * 컨텍스트 값 조회 (기본값 포함)
   */
  getContext<T>(key: string, defaultValue?: T): T | undefined {
    try {
      const value = this.board.read<T>(`state.context.${key}`);
      return value !== undefined ? value : defaultValue;
    } catch (e) {
      if (e instanceof PathNotFoundError) {
        return defaultValue;
      }
      throw e;
    }
  }

  /**
   * 컨텍스트 값 조회 (기본값 포함) - 별칭 메서드
   */
  getContextValue<T>(key: string, defaultValue?: T): T | undefined {
    return this.getContext(key, defaultValue);
  }

  /**
   * 컨텍스트 항목 삭제
   */
  deleteContext(key: string): void {
    try {
      const state = this.board.read<StateSection>("state");
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [key]: _, ...remaining } = state.context;
      this.board.write("state.context", remaining);
    } catch (e) {
      if (e instanceof PathNotFoundError) {
        // 이미 존재하지 않는 키면 무시
        return;
      }
      throw e;
    }
  }

  /**
   * 컨텍스트 병합
   */
  mergeContext(partial: Record<string, unknown>): void {
    const state = this.board.read<StateSection>("state");
    this.board.write("state.context", { ...state.context, ...partial });
  }

  /**
   * 컨텍스트 초기화
   */
  clearContext(): void {
    this.board.write("state.context", {});
  }

  // === 에이전트 관리 ===

  /**
   * 에이전트 등록
   * @param agent - 에이전트 상태 정보
   */
  registerAgent(agent: AgentStatus): void {
    const state = this.board.read<StateSection>("state");

    if (state.agents.has(agent.id)) {
      throw new BlackboardError(
        BlackboardErrorCode.AGENT_ALREADY_REGISTERED,
        `Agent ${agent.id} already registered`
      );
    }

    const updatedAgents = new Map(state.agents);
    updatedAgents.set(agent.id, agent);

    this.board.write("state.agents", updatedAgents);
    this.board.emit("agent_joined", { agentId: agent.id, agent });
  }

  /**
   * 에이전트 상태 업데이트
   * @param agentId - 에이전트 ID
   * @param updates - 업데이트할 필드
   */
  updateAgent(agentId: AgentId, updates: Partial<AgentStatus>): void {
    const state = this.board.read<StateSection>("state");
    const agent = state.agents.get(agentId);

    if (!agent) {
      throw new BlackboardError(BlackboardErrorCode.AGENT_NOT_FOUND, `Agent ${agentId} not found`);
    }

    const updatedAgent = {
      ...agent,
      ...updates,
      updatedAt: new Date(),
    };

    const updatedAgents = new Map(state.agents);
    updatedAgents.set(agentId, updatedAgent);

    this.board.write("state.agents", updatedAgents);

    if (updates.status !== undefined && updates.status !== agent.status) {
      this.board.emit("agent_status_changed", {
        agentId,
        previousStatus: agent.status,
        newStatus: updates.status,
      });
    }
  }

  /**
   * 에이전트 제거
   * @param agentId - 에이전트 ID
   */
  removeAgent(agentId: AgentId): void {
    const state = this.board.read<StateSection>("state");

    if (!state.agents.has(agentId)) {
      throw new BlackboardError(BlackboardErrorCode.AGENT_NOT_FOUND, `Agent ${agentId} not found`);
    }

    const updatedAgents = new Map(state.agents);
    updatedAgents.delete(agentId);

    this.board.write("state.agents", updatedAgents);
    this.board.emit("agent_left", { agentId });
  }

  /**
   * 에이전트 조회
   * @param agentId - 에이전트 ID
   */
  getAgent(agentId: AgentId): AgentStatus | undefined {
    const state = this.board.read<StateSection>("state");
    return state.agents.get(agentId);
  }

  /**
   * 모든 에이전트 조회
   * @param filter - 필터 조건
   */
  getAgents(filter?: { role?: AgentRole; status?: AgentStatusEnum }): AgentStatus[] {
    const state = this.board.read<StateSection>("state");
    const agents = Array.from(state.agents.values());

    if (!filter) {
      return agents;
    }

    return agents.filter((agent) => {
      if (filter.role !== undefined && agent.role !== filter.role) {
        return false;
      }
      if (filter.status !== undefined && agent.status !== filter.status) {
        return false;
      }
      return true;
    });
  }

  /**
   * 에이전트 수 조회 (getter)
   */
  get agentCount(): number {
    return this.board.read<StateSection>("state").agents.size;
  }

  /**
   * 에이전트 수 조회 (호환성 메서드)
   */
  getAgentCount(): number {
    return this.agentCount;
  }

  /**
   * 에이전트 존재 여부 확인
   */
  hasAgent(id: AgentId): boolean {
    return this.board.read<StateSection>("state").agents.has(id);
  }

  /**
   * 에이전트 하트비트 업데이트
   */
  updateAgentHeartbeat(id: AgentId): void {
    const agent = this.getAgent(id);
    if (!agent) {
      throw new BlackboardError(BlackboardErrorCode.AGENT_NOT_FOUND, `Agent ${id} not found`);
    }

    this.updateAgent(id, {
      lastHeartbeat: new Date(),
    });
  }

  /**
   * 활성 에이전트 수 조회 (BUSY 상태 에이전트)
   * @description 현재 작업을 수행 중인(BUSY 상태) 에이전트의 수를 반환합니다.
   * 호환용 별칭입니다. 새 코드는 {@link getBusyAgentCount()} 사용 권장
   */
  getActiveAgentCount(): number {
    return this.getAgents({ status: AgentStatusEnum.BUSY }).length;
  }

  /**
   * BUSY 상태 에이전트 수 조회
   * @description 현재 작업을 수행 중인(BUSY 상태) 에이전트의 수를 반환합니다.
   */
  getBusyAgentCount(): number {
    return this.getAgents({ status: AgentStatusEnum.BUSY }).length;
  }

  // === 작업 관리 ===

  /**
   * 작업 추가
   */
  addTask(task: Task): void {
    const state = this.board.read<StateSection>("state");

    if (state.tasks.has(task.id)) {
      throw new BlackboardError(
        BlackboardErrorCode.TASK_ALREADY_ASSIGNED,
        `Task ${task.id} already exists`
      );
    }

    const updatedTasks = new Map(state.tasks);
    updatedTasks.set(task.id, task);

    this.board.write("state.tasks", updatedTasks);
    this.board.emit("task_created", { taskId: task.id, task });
  }

  /**
   * 작업 업데이트
   */
  updateTask(taskId: TaskId, updates: Partial<Task>): void {
    const state = this.board.read<StateSection>("state");
    const task = state.tasks.get(taskId);

    if (!task) {
      throw new BlackboardError(BlackboardErrorCode.TASK_NOT_FOUND, `Task ${taskId} not found`);
    }

    const updatedTask = {
      ...task,
      ...updates,
      updatedAt: new Date(),
      version: task.version + 1,
    };

    const updatedTasks = new Map(state.tasks);
    updatedTasks.set(taskId, updatedTask);

    this.board.write("state.tasks", updatedTasks);
    this.board.emit("task_updated", { taskId, task: updatedTask });
  }

  /**
   * 작업 조회
   */
  getTask(taskId: TaskId): Task | undefined {
    const state = this.board.read<StateSection>("state");
    return state.tasks.get(taskId);
  }

  /**
   * 작업 목록 조회
   */
  getTasks(filter?: {
    status?: TaskStatus;
    assignedTo?: AgentId;
    priority?: TaskPriority;
  }): Task[] {
    const state = this.board.read<StateSection>("state");
    const tasks = Array.from(state.tasks.values());

    if (!filter) {
      return tasks;
    }

    return tasks.filter((task) => {
      if (filter.status !== undefined && task.status !== filter.status) {
        return false;
      }
      if (filter.assignedTo !== undefined && task.assignedTo !== filter.assignedTo) {
        return false;
      }
      if (filter.priority !== undefined && task.priority !== filter.priority) {
        return false;
      }
      return true;
    });
  }

  /**
   * 작업 삭제
   */
  removeTask(taskId: TaskId): void {
    const state = this.board.read<StateSection>("state");

    if (!state.tasks.has(taskId)) {
      throw new BlackboardError(BlackboardErrorCode.TASK_NOT_FOUND, `Task ${taskId} not found`);
    }

    const updatedTasks = new Map(state.tasks);
    updatedTasks.delete(taskId);

    this.board.write("state.tasks", updatedTasks);
  }

  /**
   * 다음 실행 가능한 작업들
   * @param completedTasks - 완료된 작업 ID 목록
   */
  getNextTasks(completedTasks: Set<TaskId> = new Set()): Task[] {
    const tasks = this.getTasks({ status: TaskStatus.PENDING });

    return tasks
      .filter((task) => {
        // 모든 의존 작업이 완료되어야 함
        return task.dependsOn.every((depId) => completedTasks.has(depId));
      })
      .sort((a, b) => b.priority - a.priority); // 우선순위 내림차순
  }

  /**
   * 에이전트의 현재 작업 조회
   */
  getAgentCurrentTask(agentId: AgentId): Task | undefined {
    const tasks = this.getTasks({ assignedTo: agentId, status: TaskStatus.RUNNING });
    return tasks[0];
  }

  /**
   * 작업 수 조회 (getter)
   */
  get taskCount(): number {
    return this.board.read<StateSection>("state").tasks.size;
  }

  /**
   * 작업 수 조회 (호환성 메서드)
   */
  getTaskCount(): number {
    return this.taskCount;
  }

  /**
   * 작업 존재 여부 확인
   */
  hasTask(id: TaskId): boolean {
    return this.board.read<StateSection>("state").tasks.has(id);
  }

  /**
   * 작업 할당
   * @description 에이전트 존재 여부와 상태를 검증 후 작업을 할당합니다.
   * @param taskId - 할당할 작업 ID
   * @param agentId - 할당받을 에이전트 ID
   */
  assignTask(taskId: TaskId, agentId: AgentId): void {
    // 에이전트 존재 여부 확인
    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new BlackboardError(BlackboardErrorCode.AGENT_NOT_FOUND, `Agent ${agentId} not found`);
    }

    // 에이전트 상태 확인 (BUSY 상태인 에이전트에는 할당하지 않음)
    if (agent.status === AgentStatusEnum.BUSY) {
      throw new BlackboardError(
        BlackboardErrorCode.AGENT_NOT_AVAILABLE,
        `Agent ${agentId} is busy and cannot accept new tasks`
      );
    }

    // 작업 업데이트
    this.updateTask(taskId, {
      assignedTo: agentId,
      status: TaskStatus.RUNNING,
      startedAt: new Date(),
    });

    // 에이전트 상태도 BUSY로 변경
    this.updateAgent(agentId, {
      status: AgentStatusEnum.BUSY,
      currentTask: taskId,
    });
  }

  /**
   * 작업 할당 해제
   */
  unassignTask(taskId: TaskId): void {
    const task = this.getTask(taskId);
    if (!task) {
      throw new BlackboardError(BlackboardErrorCode.TASK_NOT_FOUND, `Task ${taskId} not found`);
    }

    const agentId = task.assignedTo;

    this.updateTask(taskId, {
      assignedTo: null,
      status: TaskStatus.PENDING,
      startedAt: null,
    });

    // agent 상태 리셋 (에이전트가 존재하는 경우에만)
    if (agentId && this.hasAgent(agentId)) {
      this.updateAgent(agentId, {
        status: AgentStatusEnum.IDLE,
        currentTask: null,
      });
    }
  }

  /**
   * 작업 완료 처리
   */
  completeTask(taskId: TaskId, outputs: Record<string, unknown>): void {
    const task = this.getTask(taskId);
    if (!task) {
      throw new BlackboardError(BlackboardErrorCode.TASK_NOT_FOUND, `Task ${taskId} not found`);
    }
    const agentId = task.assignedTo;

    this.updateTask(taskId, {
      status: TaskStatus.COMPLETED,
      outputs,
      completedAt: new Date(),
    });

    // agent 상태 리셋 (에이전트가 존재하는 경우에만)
    if (agentId && this.hasAgent(agentId)) {
      this.updateAgent(agentId, {
        status: AgentStatusEnum.IDLE,
        currentTask: null,
      });
    }
  }

  /**
   * 작업 실패 처리
   */
  failTask(taskId: TaskId, error: TaskError): void {
    const task = this.getTask(taskId);
    const agentId = task?.assignedTo;

    this.updateTask(taskId, {
      status: TaskStatus.FAILED,
      error,
      completedAt: new Date(),
    });

    // agent 상태 리셋 (에이전트가 존재하는 경우에만)
    if (agentId && this.hasAgent(agentId)) {
      this.updateAgent(agentId, {
        status: AgentStatusEnum.IDLE,
        currentTask: null,
      });
    }
  }

  /**
   * 실행 중인 작업 수 조회
   */
  getRunningTaskCount(): number {
    return this.getTasks({ status: TaskStatus.RUNNING }).length;
  }

  /**
   * 대기 중인 작업 수 조회
   */
  getPendingTaskCount(): number {
    return this.getTasks({ status: TaskStatus.PENDING }).length;
  }
}
