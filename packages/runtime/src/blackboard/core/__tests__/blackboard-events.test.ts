import { afterEach, describe, expect, it, vi } from "vitest";
import { EventAwareBlackboard } from "../blackboard-events";
import {
  AgentStatusEnum,
  TaskPriority,
  TaskStatus,
  createAgentId,
  createSessionId,
  createTaskId,
} from "../../types";
import type { AgentStatus, Task } from "../../types";

const now = new Date("2026-01-01T00:00:00.000Z");
const later = new Date("2026-01-01T00:00:05.000Z");
const sessionId = createSessionId("session-events");
const agentId = createAgentId("agent-1");
const taskId = createTaskId("task-1");

function createAgent(): AgentStatus {
  return {
    id: agentId,
    role: "analyst",
    status: AgentStatusEnum.IDLE,
    currentTask: null,
    lastHeartbeat: now,
    metadata: { model: "test" },
    createdAt: now,
    updatedAt: now,
  };
}

function createTask(): Task {
  return {
    id: taskId,
    name: "Review release",
    description: "Review release evidence",
    assignedTo: null,
    status: TaskStatus.PENDING,
    priority: TaskPriority.NORMAL,
    inputs: {},
    outputs: null,
    dependsOn: [],
    error: null,
    startedAt: now,
    completedAt: null,
    timeout: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function eventTypes(board: EventAwareBlackboard): string[] {
  return board.events.getHistory().map((event) => event.type);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EventAwareBlackboard", () => {
  it("emits events for state, agent, task, knowledge, decision, and system changes", () => {
    const board = new EventAwareBlackboard({
      sessionId,
      eventBusOptions: { historySize: 100 },
    });

    board.setPhase("discussion");
    board.setPhase("discussion");
    board.setContext("release", "0.1.0");

    board.registerAgent(createAgent());
    board.updateAgent(agentId, {
      status: AgentStatusEnum.BUSY,
      lastHeartbeat: later,
    });
    board.removeAgent(agentId, "done");

    board.addTask(createTask());
    board.updateTask(taskId, { assignedTo: agentId });
    board.updateTask(taskId, {
      status: TaskStatus.COMPLETED,
      outputs: { ok: true },
      completedAt: later,
    });
    board.updateTask(taskId, {
      status: TaskStatus.FAILED,
      error: { code: "FAILED", message: "failed", retryable: false },
      completedAt: later,
    });

    board.addFact({
      content: "typecheck passed",
      source: agentId,
      confidence: 0.99,
      category: "gate",
      tags: ["typecheck"],
    });
    board.addInference({
      conclusion: "release risk is low",
      premises: [],
      source: agentId,
      confidence: 0.9,
      tags: ["risk"],
    });
    board.upsertPattern({
      name: "green release",
      description: "release after green gates",
      conditions: [{ type: "gate", value: "green" }],
      consequences: [{ type: "release", value: "approved" }],
      confidence: 0.8,
      tags: ["release"],
      discoveredBy: agentId,
    });

    const agenda = board.submitAgenda({
      title: "Release",
      description: "Release candidate",
      proposer: agentId,
      requiredQuorum: 1,
    });
    board.setCurrentAgenda(agenda.id);
    board.submitOpinion({
      agendaId: agenda.id,
      agentId,
      stance: "approve",
      reason: "green gates",
      confidence: 0.95,
    });
    board.recordResolution({
      agendaId: agenda.id,
      decision: "approved",
      summary: "approved",
      voteSummary: {
        approve: 1,
        reject: 0,
        abstain: 0,
        conditional: 0,
        total: 1,
      },
      conditions: [],
      dissent: [],
      decidedBy: agentId,
      nextActions: [],
    });

    const cancelled = board.submitAgenda({
      title: "Cancel",
      description: "Cancel stale agenda",
      proposer: agentId,
    });
    board.cancelAgenda(cancelled.id, "stale");

    board.emitSnapshotCreated("snapshot-1");
    board.emitSnapshotRestored("snapshot-1");
    board.emitSystemError("E_TEST", "failed", { taskId });
    board.emitVersionConflict("state.phase", 1, 2);

    expect(eventTypes(board)).toEqual(
      expect.arrayContaining([
        "state.phase.changed",
        "state.context.updated",
        "state.agent.registered",
        "agent.status.changed",
        "state.agent.removed",
        "state.task.created",
        "state.task.assigned",
        "task.assigned",
        "state.task.completed",
        "task.completed",
        "state.task.failed",
        "task.failed",
        "task.status.changed",
        "knowledge.fact.added",
        "knowledge.inference.added",
        "knowledge.pattern.learned",
        "decisions.agenda.created",
        "decision.agenda.submitted",
        "decisions.agenda.started",
        "decision.agenda.status_changed",
        "decisions.opinion.submitted",
        "decision.opinion.submitted",
        "decisions.consensus.reached",
        "decisions.agenda.resolved",
        "decision.consensus.reached",
        "system.snapshot.created",
        "system.snapshot.restored",
        "system.error",
        "system.version.conflict",
      ])
    );

    expect(eventTypes(board).filter((type) => type === "state.phase.changed")).toHaveLength(1);
  });

  it("supports manual events while auto emission is disabled", async () => {
    const board = new EventAwareBlackboard({
      sessionId,
      autoEmitEvents: false,
      eventBusOptions: { historySize: 10 },
    });

    board.setPhase("discussion");
    expect(board.events.getHistory()).toEqual([]);

    const event = board.eventFactory.createStateInitialized("manual-session");
    board.emitCustomEvent(event);
    await board.emitCustomEventAsync(board.eventFactory.createSystemError("E_TEST", "async"));

    expect(eventTypes(board)).toEqual(["state.initialized", "system.error"]);
  });

  it("logs or throws event factory failures according to options", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const loggingBoard = new EventAwareBlackboard({ sessionId });
    vi.spyOn(loggingBoard.eventFactory, "createPhaseChanged").mockImplementation(() => {
      throw new Error("factory failed");
    });

    expect(() => loggingBoard.setPhase("discussion")).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith("Error emitting event:", expect.any(Error));

    const throwingBoard = new EventAwareBlackboard({
      sessionId,
      throwOnEventError: true,
    });
    vi.spyOn(throwingBoard.eventFactory, "createPhaseChanged").mockImplementation(() => {
      throw new Error("factory failed");
    });

    expect(() => throwingBoard.setPhase("discussion")).toThrow("factory failed");
  });
});
