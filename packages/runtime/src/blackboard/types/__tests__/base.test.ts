import { describe, expect, it } from "vitest";
import {
  createAgendaId,
  createAgentId,
  createFactId,
  createInferenceId,
  createOpinionId,
  createPatternId,
  createSessionId,
  createTaskId,
  isAgendaId,
  isAgentId,
  isSessionId,
  isTaskId,
} from "../base.js";

describe("blackboard base branded id helpers", () => {
  it("brands supported id primitives without changing their runtime value", () => {
    expect(createAgentId("agent-1")).toBe("agent-1");
    expect(createTaskId("task-1")).toBe("task-1");
    expect(createAgendaId("agenda-1")).toBe("agenda-1");
    expect(createSessionId("session-1")).toBe("session-1");
    expect(createFactId("fact-1")).toBe("fact-1");
    expect(createInferenceId("inference-1")).toBe("inference-1");
    expect(createPatternId("pattern-1")).toBe("pattern-1");
    expect(createOpinionId("opinion-1")).toBe("opinion-1");
  });

  it("accepts non-empty string ids and rejects empty or non-string values", () => {
    for (const guard of [isAgentId, isTaskId, isAgendaId, isSessionId]) {
      expect(guard("id-1")).toBe(true);
      expect(guard("")).toBe(false);
      expect(guard(null)).toBe(false);
      expect(guard(1)).toBe(false);
      expect(guard({ id: "id-1" })).toBe(false);
    }
  });
});
