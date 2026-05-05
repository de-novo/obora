import { describe, it, expect, vi, beforeEach } from "vitest";
import { StateSectionAccessor } from "../accessors/state-accessor";
import { DecisionsSectionAccessor } from "../accessors/decisions-accessor";
import { KnowledgeSectionAccessor } from "../accessors/knowledge-accessor";
import type { IBlackboard } from "../blackboard-interface";
import { BlackboardError, PathNotFoundError } from "../errors";
import {
  AgentStatusEnum,
  AgendaStatus,
  TaskStatus,
  TaskPriority,
  createAgentId,
} from "../../types";
import type {
  AgentId,
  TaskId,
  AgentStatus,
  Task,
  StateSection,
  DecisionsSection,
  KnowledgeSection,
  Resolution,
} from "../../types";

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

function createDecisionKnowledgeState(): Record<string, unknown> {
  return {
    decisions: {
      current: null,
      pending: [],
      opinions: new Map(),
      history: [],
      voting: {},
    } satisfies DecisionsSection,
    knowledge: {
      facts: [],
      inferences: [],
      patterns: [],
    } satisfies KnowledgeSection,
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

describe("KnowledgeSectionAccessor", () => {
  const agentId = createAgentId("agent-knowledge");

  let board: IBlackboard;
  let accessor: KnowledgeSectionAccessor;

  beforeEach(() => {
    board = createMockBlackboard(createDecisionKnowledgeState());
    accessor = new KnowledgeSectionAccessor(board);
  });

  it("adds, queries, updates, expires, and removes facts", () => {
    const activeFact = accessor.addFact({
      content: "Revenue grew by 20 percent",
      source: agentId,
      confidence: 0.9,
      category: "finance",
      tags: ["revenue", "growth"],
      expiresAt: new Date(Date.now() + 60_000),
    });
    const expiredFact = accessor.addFact({
      content: "Old forecast",
      source: agentId,
      confidence: 0.4,
      category: "finance",
      tags: ["forecast"],
      expiresAt: new Date(Date.now() - 60_000),
    });

    expect(accessor.factCount).toBe(2);
    expect(accessor.getFact(activeFact.id)).toBe(activeFact);
    expect(
      accessor.findFacts({
        validOnly: true,
        category: "finance",
        source: agentId,
        minConfidence: 0.8,
        tag: "growth",
        tags: ["revenue", "growth"],
        text: "revenue",
      })
    ).toEqual([activeFact]);
    expect(accessor.findFacts({ validOnly: true })).toEqual([activeFact]);

    const updated = accessor.updateFact(activeFact.id, {
      content: "Revenue grew by 25 percent",
      confidence: 0.95,
    });
    expect(updated).toMatchObject({
      id: activeFact.id,
      content: "Revenue grew by 25 percent",
      confidence: 0.95,
      createdAt: activeFact.createdAt,
    });
    expect(accessor.updateFact("missing", { content: "noop" })).toBeUndefined();
    expect(accessor.cleanupExpiredFacts()).toBe(1);
    expect(accessor.getFact(expiredFact.id)).toBeUndefined();

    expect(() => accessor.removeFact("missing")).toThrow(BlackboardError);
    accessor.removeFact(activeFact.id);
    expect(accessor.getFactCount()).toBe(0);
  });

  it("validates fact input", () => {
    expect(() =>
      accessor.addFact({
        content: "",
        source: agentId,
        confidence: 0.5,
        category: "finance",
      })
    ).toThrow(BlackboardError);
    expect(() =>
      accessor.addFact({
        content: "Bad confidence",
        source: agentId,
        confidence: Number.NaN,
        category: "finance",
      })
    ).toThrow(BlackboardError);
  });

  it("manages inferences across query, update, and removal paths", () => {
    const inference = accessor.addInference({
      conclusion: "Revenue growth is durable",
      premises: ["fact-1", "fact-2"],
      source: agentId,
      method: "deduction",
      confidence: 0.82,
      tags: ["finance"],
    });

    expect(accessor.inferenceCount).toBe(1);
    expect(accessor.getInference(inference.id)).toBe(inference);
    expect(
      accessor.findInferences({
        source: agentId,
        premises: ["fact-1", "fact-2"],
        minConfidence: 0.8,
      })
    ).toEqual([inference]);
    expect(accessor.findInferencesByPremise("fact-1")).toEqual([inference]);
    expect(accessor.findInferencesByAgent(agentId)).toEqual([inference]);

    const updated = accessor.updateInference(inference.id, { confidence: 0.9 });
    expect(updated).toMatchObject({ id: inference.id, confidence: 0.9 });
    expect(accessor.updateInference("missing", { confidence: 0.1 })).toBeUndefined();
    expect(() => accessor.removeInference("missing")).toThrow(BlackboardError);
    accessor.removeInference(inference.id);
    expect(accessor.getInferenceCount()).toBe(0);
  });

  it("manages patterns including upsert, usage, stats, and clear", () => {
    const pattern = accessor.addPattern({
      name: "Revenue growth",
      description: "Revenue accelerates after product launch",
      conditions: [{ type: "metric", value: "launch" }],
      consequences: [{ type: "metric", value: "revenue-up" }],
      confidence: 0.8,
      tags: ["growth"],
      discoveredBy: agentId,
    });

    const upserted = accessor.upsertPattern({
      name: "Revenue growth",
      description: "Revenue accelerates after launch and retention improves",
      conditions: [{ type: "metric", value: "launch" }],
      consequences: [{ type: "metric", value: "revenue-up" }],
      confidence: 0.9,
    });
    expect(upserted).toMatchObject({ id: pattern.id, confidence: 0.9 });
    expect(accessor.findPatterns({ tag: "growth", minConfidence: 0.7 })).toHaveLength(1);
    expect(accessor.findPatternsByAgent(agentId)).toHaveLength(1);

    accessor.recordPatternUsage(pattern.id, true);
    expect(accessor.getPattern(pattern.id)).toMatchObject({ usageCount: 1, successRate: 1 });
    expect(accessor.updatePattern("missing", { confidence: 0.1 })).toBeUndefined();
    expect(() => accessor.recordPatternUsage("missing", true)).toThrow(BlackboardError);
    expect(() => accessor.removePattern("missing")).toThrow(BlackboardError);
    accessor.removePattern(pattern.id);
    expect(accessor.getPatternCount()).toBe(0);

    accessor.addFact({
      content: "Temporary fact",
      source: agentId,
      confidence: 0.7,
      category: "ops",
      expiresAt: new Date(Date.now() - 1),
    });
    expect(accessor.getStats()).toMatchObject({ facts: 1, inferences: 0, patterns: 0, expiredFacts: 1 });
    accessor.clearAll();
    expect(accessor.getStats()).toEqual({ facts: 0, inferences: 0, patterns: 0, expiredFacts: 0 });
  });
});

describe("DecisionsSectionAccessor", () => {
  const proposer = createAgentId("agent-proposer");
  const reviewer = createAgentId("agent-reviewer");

  let board: IBlackboard;
  let accessor: DecisionsSectionAccessor;

  beforeEach(() => {
    board = createMockBlackboard(createDecisionKnowledgeState());
    accessor = new DecisionsSectionAccessor(board);
  });

  it("submits, promotes, updates, cancels, and clears agendas", () => {
    const agenda = accessor.submitAgenda({
      title: "Launch review",
      description: "Decide whether to launch",
      proposer,
      requiredQuorum: 2,
      votingMethod: "majority",
      tags: ["launch"],
    });

    expect(accessor.pending).toEqual([agenda]);
    expect(accessor.pendingCount).toBe(1);
    expect(accessor.getAllAgendas()).toEqual([agenda]);

    accessor.setCurrentAgenda(agenda.id);
    expect(accessor.current).toMatchObject({ id: agenda.id, status: AgendaStatus.DISCUSSING });
    accessor.updateAgendaStatus(agenda.id, AgendaStatus.VOTING);
    expect(accessor.current).toMatchObject({ id: agenda.id, status: AgendaStatus.VOTING });

    const updated = accessor.updateAgenda(agenda.id, { title: "Launch review v2" });
    expect(updated).toMatchObject({ id: agenda.id, title: "Launch review v2", version: 4 });
    accessor.cancelAgenda(agenda.id, "not ready");
    expect(accessor.current).toBeNull();
    expect(board.emit).toHaveBeenCalledWith(
      "agenda_updated",
      expect.objectContaining({ agendaId: agenda.id, status: AgendaStatus.CANCELLED })
    );

    const pendingAgenda = accessor.submitAgenda({
      title: "Second agenda",
      description: "Pending update path",
      proposer,
    });
    expect(accessor.updateAgenda(pendingAgenda.id, { priority: 5 })).toMatchObject({ priority: 5 });
    expect(accessor.getAgendaCount()).toBe(1);
    accessor.clearAll();
    expect(accessor.getAgendaCount()).toBe(0);
    expect(accessor.getOpinionCount()).toBe(0);
  });

  it("validates agenda input and missing agenda paths", () => {
    expect(() => accessor.submitAgenda({ title: "", description: "desc", proposer })).toThrow(
      BlackboardError
    );
    expect(() =>
      accessor.submitAgenda({ title: "title", description: "", proposer })
    ).toThrow(BlackboardError);
    expect(() => accessor.updateAgendaStatus("missing" as never, AgendaStatus.VOTING)).toThrow(
      BlackboardError
    );
    expect(() => accessor.setCurrentAgenda("missing" as never)).toThrow(BlackboardError);
    expect(() => accessor.cancelAgenda("missing" as never, "reason")).toThrow(BlackboardError);
    expect(() => accessor.updateAgenda("missing" as never, { title: "x" })).toThrow(BlackboardError);
  });

  it("records opinions, summaries, voting results, and opinion updates", () => {
    const agenda = accessor.submitAgenda({
      title: "Approve launch",
      description: "Voting path",
      proposer,
      requiredQuorum: 2,
      votingMethod: "majority",
    });

    const approveOpinion = accessor.submitOpinion({
      agendaId: agenda.id,
      agentId: proposer,
      stance: "approve",
      reason: "Ready",
      confidence: 0.9,
    });
    const conditionalOpinion = accessor.submitOpinion({
      agendaId: agenda.id,
      agentId: reviewer,
      stance: "conditional",
      reason: "Needs rollout guard",
      conditions: ["guarded rollout"],
    });

    expect(accessor.getOpinions(agenda.id)).toHaveLength(2);
    expect(accessor.getAgentOpinion(proposer, agenda.id)).toBe(approveOpinion);
    expect(accessor.getOpinionByAgent(agenda.id, reviewer)).toBe(conditionalOpinion);
    expect(accessor.summarizeOpinions(agenda.id)).toMatchObject({
      total: 2,
      approve: 1,
      conditional: 1,
      approvalRate: 1,
      quorumReached: true,
    });
    expect(accessor.checkVotingResult(agenda.id)).toMatchObject({
      passed: true,
      method: "majority",
    });

    accessor.updateOpinion(approveOpinion.id, { stance: "reject", reason: "Blocked" });
    expect(accessor.getAgentOpinion(proposer, agenda.id)).toMatchObject({ stance: "reject" });
    accessor.removeOpinion(approveOpinion.id);
    expect(accessor.getOpinionCount()).toBe(1);
    accessor.clearOpinions(agenda.id);
    expect(accessor.getOpinionCount()).toBe(0);
  });

  it("validates opinion and voting error paths", () => {
    const agenda = accessor.submitAgenda({
      title: "Opinion errors",
      description: "Error path",
      proposer,
    });

    accessor.submitOpinion({
      agendaId: agenda.id,
      agentId: proposer,
      stance: "approve",
      reason: "ok",
    });
    expect(() =>
      accessor.submitOpinion({
        agendaId: agenda.id,
        agentId: proposer,
        stance: "approve",
        reason: "duplicate",
      })
    ).toThrow(BlackboardError);
    expect(() =>
      accessor.submitOpinion({
        agendaId: agenda.id,
        agentId: reviewer,
        stance: "approve",
        reason: "bad confidence",
        confidence: 2,
      })
    ).toThrow(BlackboardError);
    expect(() =>
      accessor.submitOpinion({
        agendaId: "missing" as never,
        agentId: reviewer,
        stance: "approve",
        reason: "missing agenda",
      })
    ).toThrow(BlackboardError);
    expect(() => accessor.updateOpinion("missing" as never, { reason: "x" })).toThrow(
      BlackboardError
    );
    expect(() => accessor.removeOpinion("missing" as never)).toThrow(BlackboardError);
    expect(() => accessor.checkVotingResult("missing" as never)).toThrow(BlackboardError);
  });

  it("records and queries resolutions while removing resolved agenda references", () => {
    const agenda = accessor.submitAgenda({
      title: "Resolution agenda",
      description: "Resolution path",
      proposer,
    });
    const resolutionInput: Omit<Resolution, "id" | "createdAt" | "updatedAt"> = {
      agendaId: agenda.id,
      decision: "approved",
      summary: "Approved",
      voteSummary: { approve: 1, reject: 0, abstain: 0, conditional: 0, total: 1 },
      conditions: [],
      dissent: [],
      decidedBy: proposer,
      nextActions: [{ description: "Ship", assignee: reviewer, dueDate: null }],
    };

    const resolution = accessor.recordResolution(resolutionInput);

    expect(accessor.history).toEqual([resolution]);
    expect(accessor.historyCount).toBe(1);
    expect(accessor.getHistory({ agendaId: agenda.id, decision: "approved" })).toEqual([resolution]);
    expect(accessor.getRecentResolutions(1)).toEqual([resolution]);
    expect(accessor.getResolution(resolution.id)).toBe(resolution);
    expect(accessor.getResolutionByAgenda(agenda.id)).toBe(resolution);
    expect(accessor.getResolutionCount()).toBe(1);
    expect(accessor.getAgenda(agenda.id)).toBeUndefined();
  });

  it("closes an agenda while keeping it queryable", () => {
    const agenda = accessor.submitAgenda({
      title: "Close agenda",
      description: "Close path",
      proposer,
    });

    accessor.closeAgenda(agenda.id, "deferred");

    expect(accessor.getAgenda(agenda.id)).toMatchObject({
      id: agenda.id,
      status: AgendaStatus.RESOLVED,
    });
    expect(accessor.getResolutionByAgenda(agenda.id)).toMatchObject({
      agendaId: agenda.id,
      decision: "deferred",
    });
  });
});
