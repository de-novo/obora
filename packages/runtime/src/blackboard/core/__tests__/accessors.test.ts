import { describe, it, expect, vi, beforeEach } from "vitest";
import { StateSectionAccessor } from "../accessors/state-accessor";
import type { IBlackboard } from "../blackboard-interface";
import { BlackboardError, PathNotFoundError } from "../errors";
import { AgentStatusEnum, TaskStatus, TaskPriority } from "../../types";
import type { AgentId, TaskId, AgentStatus, Task, StateSection } from "../../types";

function createMockBlackboard(initialState: Record<string, unknown> = {}): IBlackboard {
  const store: Record<string, unknown> = { ...initialState };

  return {
    read<T>(path: string): T {
      const parts = path.split(".");
      let current: unknown = store;
      for (const part of parts) {
        if (current && typeof current === "object" && part in current) {
          current = (current as Record<string, unknown>)[part];
        } else {
          throw new PathNotFoundError(`Path not found: ${path}`);
        }
      }
      return current as T;
    },
    write(path: string, value: unknown) {
      const parts = path.split(".");
      let current: Record<string, unknown> = store;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current) || typeof current[part] !== "object") {
          current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]] = value;
    },
    emit: vi.fn().mockReturnValue(true),
  };
}

function createInitialState(): Record<string, unknown> {
  return {
    state: {
      phase: "discussion" as const,
      context: { key1: "value1" },
      agents: new Map<string, AgentStatus>(),
      tasks: new Map<string, Task>(),
    } satisfies StateSection,
  };
}

describe("StateSectionAccessor", () => {
  let board: IBlackboard;
  let accessor: StateSectionAccessor;

  beforeEach(() => {
    board = createMockBlackboard(createInitialState());
    accessor = new StateSectionAccessor(board);
  });

  it("reads and writes phase", () => {
    expect(accessor.phase).toBe("discussion");
    accessor.phase = "voting";
    expect(accessor.phase).toBe("voting");
  });

  it("does not emit when phase is unchanged", () => {
    accessor.phase = "discussion";
    expect(board.emit).not.toHaveBeenCalledWith("state.phase.changed", expect.anything());
  });

  it("reads context", () => {
    expect(accessor.context).toEqual({ key1: "value1" });
  });

  it("sets context value", () => {
    accessor.setContext("key2", "value2");
    expect(accessor.context).toEqual({ key1: "value1", key2: "value2" });
  });

  it("gets context with default", () => {
    expect(accessor.getContext("key1")).toBe("value1");
    expect(accessor.getContext("missing", "default")).toBe("default");
  });

  it("deletes context key", () => {
    accessor.deleteContext("key1");
    expect(accessor.context).toEqual({});
  });

  it("ignores deleting non-existent context key", () => {
    expect(() => accessor.deleteContext("missing")).not.toThrow();
  });

  it("merges context", () => {
    accessor.mergeContext({ key2: "value2" });
    expect(accessor.context).toEqual({ key1: "value1", key2: "value2" });
  });

  it("clears context", () => {
    accessor.clearContext();
    expect(accessor.context).toEqual({});
  });

  it("registers and retrieves agent", () => {
    const agent: AgentStatus = {
      id: "agent-1" as AgentId,
      name: "Test Agent",
      role: "reviewer",
      status: AgentStatusEnum.IDLE,
      joinedAt: new Date(),
    };
    accessor.registerAgent(agent);
    expect(accessor.getAgent("agent-1" as AgentId)).toEqual(agent);
    expect(accessor.agentCount).toBe(1);
    expect(accessor.hasAgent("agent-1" as AgentId)).toBe(true);
  });

  it("throws when registering duplicate agent", () => {
    const agent: AgentStatus = {
      id: "agent-1" as AgentId,
      name: "Test",
      role: "reviewer",
      status: AgentStatusEnum.IDLE,
      joinedAt: new Date(),
    };
    accessor.registerAgent(agent);
    expect(() => accessor.registerAgent(agent)).toThrow(BlackboardError);
  });

  it("updates agent status", () => {
    const agent: AgentStatus = {
      id: "agent-1" as AgentId,
      name: "Test",
      role: "reviewer",
      status: AgentStatusEnum.IDLE,
      joinedAt: new Date(),
    };
    accessor.registerAgent(agent);
    accessor.updateAgent("agent-1" as AgentId, { status: AgentStatusEnum.BUSY });
    expect(accessor.getAgent("agent-1" as AgentId)?.status).toBe(AgentStatusEnum.BUSY);
  });

  it("throws when updating non-existent agent", () => {
    expect(() => accessor.updateAgent("missing" as AgentId, { status: AgentStatusEnum.BUSY })).toThrow(
      BlackboardError
    );
  });

  it("removes agent", () => {
    const agent: AgentStatus = {
      id: "agent-1" as AgentId,
      name: "Test",
      role: "reviewer",
      status: AgentStatusEnum.IDLE,
      joinedAt: new Date(),
    };
    accessor.registerAgent(agent);
    accessor.removeAgent("agent-1" as AgentId);
    expect(accessor.hasAgent("agent-1" as AgentId)).toBe(false);
  });

  it("throws when removing non-existent agent", () => {
    expect(() => accessor.removeAgent("missing" as AgentId)).toThrow(BlackboardError);
  });

  it("filters agents by status", () => {
    const agent1: AgentStatus = {
      id: "agent-1" as AgentId,
      name: "Test1",
      role: "reviewer",
      status: AgentStatusEnum.BUSY,
      joinedAt: new Date(),
    };
    const agent2: AgentStatus = {
      id: "agent-2" as AgentId,
      name: "Test2",
      role: "reviewer",
      status: AgentStatusEnum.IDLE,
      joinedAt: new Date(),
    };
    accessor.registerAgent(agent1);
    accessor.registerAgent(agent2);
    expect(accessor.getAgents({ status: AgentStatusEnum.BUSY })).toHaveLength(1);
    expect(accessor.getAgents({ status: AgentStatusEnum.IDLE })).toHaveLength(1);
    expect(accessor.getBusyAgentCount()).toBe(1);
  });

  it("updates agent heartbeat", () => {
    const agent: AgentStatus = {
      id: "agent-1" as AgentId,
      name: "Test",
      role: "reviewer",
      status: AgentStatusEnum.IDLE,
      joinedAt: new Date(),
    };
    accessor.registerAgent(agent);
    accessor.updateAgentHeartbeat("agent-1" as AgentId);
    expect(accessor.getAgent("agent-1" as AgentId)?.lastHeartbeat).toBeDefined();
  });

  it("adds and retrieves task", () => {
    const task: Task = {
      id: "task-1" as TaskId,
      title: "Test Task",
      status: TaskStatus.PENDING,
      priority: TaskPriority.MEDIUM,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    accessor.addTask(task);
    expect(accessor.getTask("task-1" as TaskId)).toEqual(task);
    expect(accessor.taskCount).toBe(1);
  });

  it("throws when adding duplicate task", () => {
    const task: Task = {
      id: "task-1" as TaskId,
      title: "Test",
      status: TaskStatus.PENDING,
      priority: TaskPriority.MEDIUM,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    accessor.addTask(task);
    expect(() => accessor.addTask(task)).toThrow(BlackboardError);
  });

  it("updates task", () => {
    const task: Task = {
      id: "task-1" as TaskId,
      title: "Test",
      status: TaskStatus.PENDING,
      priority: TaskPriority.MEDIUM,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    accessor.addTask(task);
    accessor.updateTask("task-1" as TaskId, { status: TaskStatus.IN_PROGRESS });
    expect(accessor.getTask("task-1" as TaskId)?.status).toBe(TaskStatus.IN_PROGRESS);
  });
});
