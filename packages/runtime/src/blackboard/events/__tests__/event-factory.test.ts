import { describe, expect, it } from "vitest";
import { EventFactory } from "../event-factory";
import {
  AgentStatusEnum,
  AgendaStatus,
  TaskPriority,
  TaskStatus,
  createAgentId,
  createAgendaId,
  createOpinionId,
  createTaskId,
} from "../../types";
import type {
  AgentId,
  AgentStatus,
  Agenda,
  Fact,
  Inference,
  Opinion,
  Pattern,
  Resolution,
  Task,
  TaskError,
} from "../../types";

interface EventLike {
  id: string;
  type: string;
  timestamp: Date;
  source: AgentId | "system";
  correlationId?: string;
  payload: unknown;
}

const now = new Date("2026-01-01T00:00:00.000Z");
const later = new Date("2026-01-01T00:05:00.000Z");

const agentId = createAgentId("agent-1");
const verifierId = createAgentId("verifier-1");
const taskId = createTaskId("task-1");
const agendaId = createAgendaId("agenda-1");

const agent: AgentStatus = {
  id: agentId,
  role: "analyst",
  status: AgentStatusEnum.IDLE,
  currentTask: null,
  lastHeartbeat: now,
  metadata: { model: "test" },
  createdAt: now,
  updatedAt: now,
};

const busyAgent: AgentStatus = {
  ...agent,
  status: AgentStatusEnum.BUSY,
  currentTask: taskId,
  updatedAt: later,
};

const task: Task = {
  id: taskId,
  name: "Review findings",
  description: "Classify review findings",
  assignedTo: null,
  status: TaskStatus.PENDING,
  priority: TaskPriority.NORMAL,
  inputs: { reviewId: "review-1" },
  outputs: null,
  dependsOn: [],
  error: null,
  startedAt: null,
  completedAt: null,
  timeout: null,
  version: 1,
  createdAt: now,
  updatedAt: now,
};

const taskError: TaskError = {
  code: "TASK_FAILED",
  message: "Task failed",
  retryable: true,
};

const agenda: Agenda = {
  id: agendaId,
  title: "Release decision",
  description: "Decide whether to release",
  proposer: agentId,
  status: AgendaStatus.SUBMITTED,
  deadline: later,
  requiredQuorum: 2,
  votingMethod: "majority",
  priority: 5,
  tags: ["release"],
  attachments: [],
  version: 1,
  createdAt: now,
  updatedAt: now,
};

const opinion: Opinion = {
  id: createOpinionId("opinion-1"),
  agentId,
  agendaId,
  stance: "approve",
  reason: "Gates are green",
  conditions: [],
  confidence: 0.91,
  references: ["fact-1"],
  createdAt: now,
  updatedAt: now,
};

const resolution: Resolution = {
  id: "resolution-1",
  agendaId,
  decision: "approved",
  summary: "Approved for release",
  voteSummary: {
    approve: 2,
    reject: 0,
    abstain: 0,
    conditional: 0,
    total: 2,
  },
  conditions: [],
  dissent: [],
  decidedBy: verifierId,
  nextActions: [],
  createdAt: now,
  updatedAt: now,
};

const fact: Fact = {
  id: "fact-1",
  content: "All gates passed",
  source: agentId,
  confidence: 0.99,
  category: "release",
  tags: ["gate"],
  expiresAt: null,
  createdAt: now,
  updatedAt: now,
};

const inference: Inference = {
  id: "inference-1",
  conclusion: "Release risk is low",
  premises: ["fact-1"],
  source: agentId,
  method: "deduction",
  confidence: 0.9,
  tags: ["risk"],
  createdAt: now,
  updatedAt: now,
};

const pattern: Pattern = {
  id: "pattern-1",
  name: "Green gate release",
  description: "Release after green gates",
  conditions: [{ type: "gate", value: "green" }],
  consequences: [{ type: "decision", value: "release" }],
  confidence: 0.88,
  tags: ["release"],
  discoveredBy: agentId,
  usageCount: 3,
  successRate: 1,
  createdAt: now,
  updatedAt: now,
};

function createFactory(): EventFactory {
  let counter = 0;
  return new EventFactory(() => `event-${++counter}`);
}

function expectEvent(event: EventLike, type: string, payload: unknown): void {
  expect(event.id).toMatch(/^event-\d+$/);
  expect(event.type).toBe(type);
  expect(event.timestamp).toBeInstanceOf(Date);
  expect(event.source).toBe("system");
  expect(event.correlationId).toBeUndefined();
  expect(event.payload).toEqual(payload);
}

describe("EventFactory", () => {
  it("generates ids by default and accepts options or source overloads", () => {
    const defaultFactory = new EventFactory();
    expect(defaultFactory.createStateInitialized("session-1").id).toBe("evt_1");
    expect(defaultFactory.createStateInitialized("session-2").id).toBe("evt_2");

    const factory = createFactory();
    const withOptions = factory.createPhaseChanged("idle", "discussion", {
      source: agentId,
      correlationId: "corr-1",
    });
    expect(withOptions).toMatchObject({
      id: "event-1",
      type: "state.phase.changed",
      source: agentId,
      correlationId: "corr-1",
      payload: { previousPhase: "idle", newPhase: "discussion" },
    });

    const withSource = factory.createPhaseChanged("discussion", "voting", agentId);
    expect(withSource).toMatchObject({
      id: "event-2",
      source: agentId,
      payload: { previousPhase: "discussion", newPhase: "voting" },
    });
  });

  it("propagates source and correlation options across event families", () => {
    const factory = createFactory();
    const options = { source: agentId, correlationId: "corr-options" };
    const events: EventLike[] = [
      factory.createContextUpdated("key", "old", "new", options),
      factory.createStateTaskCompleted(taskId, { ok: true }, 10, options),
      factory.createAgentRemoved(agentId, "finished", options),
      factory.createTaskStarted(taskId, agentId, options),
      factory.createDecisionsAgendaStarted(agendaId, options),
      factory.createVoteRequested(agendaId, later, [agentId], options),
      factory.createFactAdded(fact, options),
      factory.createSystemError("E_TEST", "failed", { detail: true }, options),
      factory.createSystemSnapshotCreated("system-snapshot-1", later, options),
      factory.createSystemSnapshotRestored("system-snapshot-1", later, options),
      factory.createStateInitialized("session-options", options),
      factory.createSnapshotCreated("snapshot-1", 1, options),
      factory.createSnapshotRestored("snapshot-1", 2, 3, options),
    ];

    for (const event of events) {
      expect(event.source).toBe(agentId);
      expect(event.correlationId).toBe("corr-options");
    }
  });

  it("creates state, agent, and task events", () => {
    const factory = createFactory();

    const scenarios: Array<{ event: EventLike; type: string; payload: unknown }> = [
      {
        event: factory.createContextUpdated("phase", "old", "new"),
        type: "state.context.updated",
        payload: { key: "phase", previousValue: "old", newValue: "new" },
      },
      {
        event: factory.createStateAgentRegistered(agent),
        type: "state.agent.registered",
        payload: { agent },
      },
      {
        event: factory.createStateAgentUpdated(agentId, agent, busyAgent),
        type: "state.agent.updated",
        payload: { agentId, previousStatus: agent, newStatus: busyAgent },
      },
      {
        event: factory.createStateTaskCreated(task),
        type: "state.task.created",
        payload: { task },
      },
      {
        event: factory.createStateTaskAssigned(taskId, agentId),
        type: "state.task.assigned",
        payload: { taskId, assignedTo: agentId },
      },
      {
        event: factory.createStateTaskCompleted(taskId, { ok: true }, 12),
        type: "state.task.completed",
        payload: { taskId, result: { ok: true }, duration: 12 },
      },
      {
        event: factory.createStateTaskFailed(taskId, taskError, true),
        type: "state.task.failed",
        payload: { taskId, error: taskError, retryable: true },
      },
      {
        event: factory.createAgentRegistered(agent),
        type: "state.agent.registered",
        payload: { agent },
      },
      {
        event: factory.createAgentStatusChanged(agentId, agent, busyAgent),
        type: "agent.status.changed",
        payload: { agentId, previousStatus: agent, newStatus: busyAgent },
      },
      {
        event: factory.createAgentRemoved(agentId, "left"),
        type: "state.agent.removed",
        payload: { agentId, reason: "left" },
      },
      {
        event: factory.createAgentUpdated(agentId, { status: AgentStatusEnum.BUSY }, { status: AgentStatusEnum.IDLE }),
        type: "state.agent.updated",
        payload: {
          agentId,
          changes: { status: AgentStatusEnum.BUSY },
          previousValues: { status: AgentStatusEnum.IDLE },
        },
      },
      {
        event: factory.createTaskCreated(task),
        type: "task.created",
        payload: { task },
      },
      {
        event: factory.createTaskAssigned(taskId, agentId),
        type: "task.assigned",
        payload: { taskId, assignedTo: agentId },
      },
      {
        event: factory.createTaskStatusChanged(taskId, TaskStatus.PENDING, TaskStatus.RUNNING),
        type: "task.status.changed",
        payload: { taskId, previousStatus: TaskStatus.PENDING, newStatus: TaskStatus.RUNNING },
      },
      {
        event: factory.createTaskCompleted(taskId, { result: "ok" }, 20),
        type: "task.completed",
        payload: { taskId, outputs: { result: "ok" }, duration: 20 },
      },
      {
        event: factory.createTaskFailed(taskId, taskError, 30),
        type: "task.failed",
        payload: { taskId, error: taskError, duration: 30 },
      },
      {
        event: factory.createTaskStarted(taskId, agentId),
        type: "task.started",
        payload: { taskId, agentId, startedAt: expect.any(Date) },
      },
      {
        event: factory.createTaskCancelled(taskId, "duplicate"),
        type: "task.cancelled",
        payload: { taskId, reason: "duplicate" },
      },
    ];

    for (const scenario of scenarios) {
      expectEvent(scenario.event, scenario.type, scenario.payload);
    }
  });

  it("creates decision events for current and previous decision surfaces", () => {
    const factory = createFactory();
    const votingResult = {
      passed: true,
      method: "majority",
      summary: {
        total: 2,
        approve: 2,
        reject: 0,
        abstain: 0,
        approvalRate: 1,
        quorumReached: true,
      },
    };

    const scenarios: Array<{ event: EventLike; type: string; payload: unknown }> = [
      {
        event: factory.createDecisionsAgendaCreated(agenda),
        type: "decisions.agenda.created",
        payload: { agenda },
      },
      {
        event: factory.createDecisionsAgendaStarted(agendaId),
        type: "decisions.agenda.started",
        payload: { agendaId },
      },
      {
        event: factory.createDecisionsOpinionSubmitted(opinion),
        type: "decisions.opinion.submitted",
        payload: { opinion },
      },
      {
        event: factory.createDecisionsVotingStarted(agendaId, later),
        type: "decisions.voting.started",
        payload: { agendaId, deadline: later },
      },
      {
        event: factory.createDecisionsVoteSubmitted(agendaId, agentId, "approve"),
        type: "decisions.vote.submitted",
        payload: { agendaId, agentId, vote: "approve" },
      },
      {
        event: factory.createDecisionsVotingEnded(agendaId, resolution),
        type: "decisions.voting.ended",
        payload: { agendaId, result: resolution },
      },
      {
        event: factory.createDecisionsConsensusReached(resolution),
        type: "decisions.consensus.reached",
        payload: { resolution },
      },
      {
        event: factory.createDecisionsAgendaResolved(agendaId, resolution),
        type: "decisions.agenda.resolved",
        payload: { agendaId, resolution },
      },
      {
        event: factory.createAgendaSubmitted(agenda),
        type: "decision.agenda.submitted",
        payload: { agenda },
      },
      {
        event: factory.createAgendaStatusChanged(agendaId, AgendaStatus.SUBMITTED, AgendaStatus.VOTING),
        type: "decision.agenda.status_changed",
        payload: {
          agendaId,
          previousStatus: AgendaStatus.SUBMITTED,
          newStatus: AgendaStatus.VOTING,
        },
      },
      {
        event: factory.createOpinionSubmitted(opinion),
        type: "decision.opinion.submitted",
        payload: { opinion },
      },
      {
        event: factory.createVoteRequested(agendaId, later, [agentId, verifierId]),
        type: "decision.vote.requested",
        payload: { agendaId, deadline: later, requiredVoters: [agentId, verifierId] },
      },
      {
        event: factory.createConsensusReached(resolution),
        type: "decision.consensus.reached",
        payload: { resolution },
      },
      {
        event: factory.createVotingCompleted(agendaId, votingResult),
        type: "decision.voting.completed",
        payload: { agendaId, result: votingResult },
      },
    ];

    for (const scenario of scenarios) {
      expectEvent(scenario.event, scenario.type, scenario.payload);
    }
  });

  it("creates knowledge and system events", () => {
    const factory = createFactory();

    const scenarios: Array<{ event: EventLike; type: string; payload: unknown }> = [
      {
        event: factory.createFactAdded(fact),
        type: "knowledge.fact.added",
        payload: { fact },
      },
      {
        event: factory.createInferenceAdded(inference),
        type: "knowledge.inference.added",
        payload: { inference },
      },
      {
        event: factory.createKnowledgePatternLearned(pattern),
        type: "knowledge.pattern.learned",
        payload: { pattern },
      },
      {
        event: factory.createFactUpdated(fact.id, { confidence: 0.95 }, { confidence: 0.99 }),
        type: "knowledge.fact.updated",
        payload: { factId: fact.id, changes: { confidence: 0.95 }, previousValues: { confidence: 0.99 } },
      },
      {
        event: factory.createFactRemoved(fact.id, "expired"),
        type: "knowledge.fact.removed",
        payload: { factId: fact.id, reason: "expired" },
      },
      {
        event: factory.createPatternAdded(pattern),
        type: "knowledge.pattern.added",
        payload: { pattern },
      },
      {
        event: factory.createSystemSnapshotCreated("snapshot-1", now),
        type: "system.snapshot.created",
        payload: { snapshotId: "snapshot-1", timestamp: now },
      },
      {
        event: factory.createSystemSnapshotRestored("snapshot-1", later),
        type: "system.snapshot.restored",
        payload: { snapshotId: "snapshot-1", timestamp: later },
      },
      {
        event: factory.createSystemError("E_RUNTIME", "Runtime failed", { taskId }),
        type: "system.error",
        payload: { code: "E_RUNTIME", message: "Runtime failed", details: { taskId } },
      },
      {
        event: factory.createVersionConflict("state.phase", 1, 2),
        type: "system.version.conflict",
        payload: { path: "state.phase", expectedVersion: 1, actualVersion: 2 },
      },
      {
        event: factory.createStateInitialized("session-1"),
        type: "state.initialized",
        payload: { sessionId: "session-1" },
      },
      {
        event: factory.createSnapshotCreated("snapshot-1", 1),
        type: "snapshot.created",
        payload: { snapshotId: "snapshot-1", version: 1 },
      },
      {
        event: factory.createSnapshotRestored("snapshot-1", 1, 2),
        type: "snapshot.restored",
        payload: { snapshotId: "snapshot-1", previousVersion: 1, restoredVersion: 2 },
      },
    ];

    for (const scenario of scenarios) {
      expectEvent(scenario.event, scenario.type, scenario.payload);
    }
  });
});
