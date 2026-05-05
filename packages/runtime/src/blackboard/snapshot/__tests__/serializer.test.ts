import { describe, expect, it } from "vitest";
import {
  StateSerializer,
  calculateChecksum,
  calculateChecksumSync,
  verifyChecksum,
  verifyChecksumSync,
} from "../serializer";
import {
  AgentStatusEnum,
  AgendaStatus,
  TaskPriority,
  TaskStatus,
  createAgentId,
  createAgendaId,
  createOpinionId,
  createSessionId,
  createTaskId,
} from "../../types";
import type {
  AgentStatus,
  Agenda,
  BlackboardState,
  Fact,
  Inference,
  Opinion,
  Pattern,
  Resolution,
  Task,
} from "../../types";
import type { SerializedState } from "../types";

const now = new Date("2026-01-01T00:00:00.000Z");
const later = new Date("2026-01-01T00:10:00.000Z");
const sessionId = createSessionId("session-1");
const agentId = createAgentId("agent-1");
const taskId = createTaskId("task-1");
const agendaId = createAgendaId("agenda-1");

function createState(): BlackboardState {
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
  const task: Task = {
    id: taskId,
    name: "Review release",
    description: "Review release evidence",
    assignedTo: agentId,
    status: TaskStatus.RUNNING,
    priority: TaskPriority.HIGH,
    inputs: { release: "0.1.0" },
    outputs: null,
    dependsOn: [],
    error: null,
    startedAt: now,
    completedAt: null,
    timeout: 1000,
    version: 1,
    createdAt: now,
    updatedAt: later,
  };
  const fact: Fact = {
    id: "fact-1",
    content: "Typecheck passed",
    source: agentId,
    confidence: 0.99,
    category: "gate",
    tags: ["typecheck"],
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const inference: Inference = {
    id: "inference-1",
    conclusion: "Release risk is low",
    premises: ["fact-1"],
    source: agentId,
    confidence: 0.9,
    tags: ["risk"],
    createdAt: now,
    updatedAt: now,
  };
  const pattern: Pattern = {
    id: "pattern-1",
    name: "Green release",
    description: "Release after green gates",
    conditions: [{ type: "gate", value: "green" }],
    consequences: [{ type: "release", value: "approved" }],
    confidence: 0.8,
    tags: ["release"],
    createdAt: now,
    updatedAt: now,
  };
  const agenda: Agenda = {
    id: agendaId,
    title: "Release",
    description: "Release candidate",
    proposer: agentId,
    status: AgendaStatus.VOTING,
    deadline: later,
    requiredQuorum: 1,
    votingMethod: "majority",
    priority: 5,
    tags: ["release"],
    attachments: [],
    version: 1,
    createdAt: now,
    updatedAt: later,
  };
  const opinion: Opinion = {
    id: createOpinionId("opinion-1"),
    agentId,
    agendaId,
    stance: "approve",
    reason: "Gates are green",
    conditions: [],
    confidence: 0.95,
    references: ["fact-1"],
    createdAt: now,
    updatedAt: now,
  };
  const resolution: Resolution = {
    id: "resolution-1",
    agendaId,
    decision: "approved",
    summary: "Approved",
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
    createdAt: now,
    updatedAt: later,
  };

  return {
    meta: {
      version: 3,
      lastUpdated: later,
      sessionId,
      createdAt: now,
    },
    state: {
      phase: "voting",
      context: { release: "0.1.0" },
      agents: new Map([[agentId, agent]]),
      tasks: new Map([[taskId, task]]),
    },
    knowledge: {
      facts: [fact],
      inferences: [inference],
      patterns: [pattern],
    },
    decisions: {
      current: agenda,
      pending: [agenda],
      opinions: new Map([[`${agendaId}:${agentId}`, opinion]]),
      history: [resolution],
      voting: {
        [agendaId]: {
          started: now,
          participants: [agentId],
          votes: { [agentId]: "approve" },
          status: "completed",
        },
      },
    },
  };
}

function cloneSerialized(serialized: SerializedState): SerializedState {
  return JSON.parse(JSON.stringify(serialized)) as SerializedState;
}

describe("StateSerializer", () => {
  it("serializes and deserializes blackboard state with maps and dates", () => {
    const serializer = new StateSerializer({ indent: 2 });
    const state = createState();
    const serialized = serializer.serialize(state);

    expect(serialized.meta).toMatchObject({
      version: 3,
      lastUpdated: later.toISOString(),
      sessionId,
      createdAt: now.toISOString(),
    });
    expect(serialized.state.agents).toHaveLength(1);
    expect(serialized.state.tasks).toHaveLength(1);
    expect(serialized.decisions.opinions).toHaveLength(1);

    const restored = serializer.deserialize(serialized);
    expect(restored.meta.lastUpdated).toEqual(later);
    expect(restored.state.agents.get(agentId)?.metadata).toEqual({ model: "test" });
    expect(restored.state.tasks.get(taskId)?.status).toBe(TaskStatus.RUNNING);
    expect(restored.decisions.current?.id).toBe(agendaId);
    expect(restored.decisions.voting[agendaId]?.status).toBe("completed");
  });

  it("supports timestamp dates, sorted JSON, and JSON parse errors", () => {
    const serializer = new StateSerializer({ dateFormat: "timestamp", sortKeys: true, indent: 2 });
    const state = createState();
    const json = serializer.toJSON(state);

    expect(json.indexOf('"createdAt"')).toBeLessThan(json.indexOf('"lastUpdated"'));
    expect(serializer.fromJSON(json).meta.createdAt).toEqual(now);
    expect(serializer.serialize(state).meta.createdAt).toBe(String(now.getTime()));
    expect(serializer.serializeJSON({ b: 2, a: 1 })).toContain('"a"');
    expect(serializer.deserializeJSON<{ ok: boolean }>('{"ok":true}')).toEqual({ ok: true });
    expect(() => serializer.deserializeJSON("{bad")).toThrow("Invalid JSON");
    expect(() => serializer.fromJSON("{bad")).toThrow("Invalid JSON in serialized state");
    expect(() => serializer.fromJSON("null")).toThrow("parsed data is null or undefined");
  });

  it("reports invalid serialized sections and maps", () => {
    const serializer = new StateSerializer();
    const base = serializer.serialize(createState());

    expect(() => serializer.deserialize(null as unknown as SerializedState)).toThrow(
      "must be an object"
    );
    expect(() =>
      serializer.deserialize({ ...base, state: undefined as unknown as SerializedState["state"] })
    ).toThrow("missing section 'state'");

    expect(() =>
      serializer.deserialize({
        ...base,
        knowledge: { ...base.knowledge, facts: "bad" as unknown as unknown[] },
      })
    ).toThrow("facts must be an array");
    expect(() =>
      serializer.deserialize({
        ...base,
        knowledge: {
          ...base.knowledge,
          facts: [{ content: 1, confidence: 2, createdAt: 1 }],
        },
      })
    ).toThrow("Invalid facts data");
    expect(() =>
      serializer.deserialize({
        ...base,
        knowledge: {
          ...base.knowledge,
          inferences: [{ conclusion: 1, confidence: -1, createdAt: 1 }],
        },
      })
    ).toThrow("Invalid inferences data");
    expect(() =>
      serializer.deserialize({
        ...base,
        knowledge: {
          ...base.knowledge,
          patterns: [{ name: 1, createdAt: 1 }],
        },
      })
    ).toThrow("Invalid patterns data");
    expect(() =>
      serializer.deserialize({
        ...base,
        decisions: { ...base.decisions, current: "bad" },
      })
    ).toThrow("Invalid current agenda");
    expect(() =>
      serializer.deserialize({
        ...base,
        decisions: { ...base.decisions, pending: "bad" as unknown as unknown[] },
      })
    ).toThrow("Invalid pending agendas");
    expect(() =>
      serializer.deserialize({
        ...base,
        decisions: { ...base.decisions, pending: ["bad"] },
      })
    ).toThrow("Invalid pending agenda at index 0");
    expect(() =>
      serializer.deserialize({
        ...base,
        decisions: { ...base.decisions, history: [{ decision: 1 }] },
      })
    ).toThrow("Invalid history data");
    expect(() =>
      serializer.deserialize({
        ...base,
        state: { ...base.state, agents: "bad" as unknown as Array<[string, unknown]> },
      })
    ).toThrow("Invalid map data");
  });

  it("validates date and ID restoration errors", () => {
    const serializer = new StateSerializer();
    const base = cloneSerialized(serializer.serialize(createState()));

    expect(() =>
      serializer.deserialize({
        ...base,
        meta: { ...base.meta, lastUpdated: "not-a-date" },
      })
    ).toThrow('Invalid date value: "not-a-date"');
    expect(() =>
      serializer.deserialize({
        ...base,
        meta: { ...base.meta, createdAt: "   " },
      })
    ).toThrow("string must not be empty");
    expect(() =>
      serializer.deserialize({
        ...base,
        meta: { ...base.meta, sessionId: 42 as unknown as string },
      })
    ).toThrow("Expected string ID");
  });

  it("calculates stable checksums for sorted object keys", async () => {
    const first = { b: 2, a: 1 };
    const second = { a: 1, b: 2 };
    const checksum = calculateChecksumSync(first);

    expect(calculateChecksumSync(second)).toBe(checksum);
    expect(verifyChecksumSync(first, checksum)).toBe(true);
    expect(verifyChecksumSync({ a: 2 }, checksum)).toBe(false);
    await expect(calculateChecksum(second)).resolves.toBe(checksum);
    await expect(verifyChecksum(second, checksum)).resolves.toBe(true);
  });
});
