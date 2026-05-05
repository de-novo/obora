import { describe, expect, it, vi } from "vitest";

import { InMemoryAuditStore } from "../../audit/InMemoryAuditStore.js";
import { DefaultConsensusGate } from "../ConsensusGate.js";

describe("DefaultConsensusGate", () => {
  it("validates setup and session lookup inputs", () => {
    const gate = new DefaultConsensusGate({ executionId: "exec-validation" });

    expect(() =>
      gate.setup({
        type: "majority",
        voters: [{ id: "a" }],
        minRequired: 0,
      })
    ).toThrow("ConsensusConfig.minRequired must be greater than 0");

    expect(() =>
      gate.setup({
        type: "majority",
        voters: [{ id: "a" }, { id: "a" }],
        minRequired: 1,
      })
    ).toThrow("ConsensusConfig.voters must be unique");

    expect(() => gate.evaluate("missing")).toThrow("Consensus session not found: missing");
    expect(() => gate.onTimeout("missing")).toThrow("Consensus session not found: missing");
    expect(() => gate.markBestEffort("missing", "a")).toThrow("Consensus session not found: missing");
    expect(() => gate.registerVote("missing", { voterId: "a", approved: true })).toThrow(
      "Consensus session not found: missing"
    );
  });

  it("returns pending until minRequired votes are met, then passes majority", () => {
    const gate = new DefaultConsensusGate({
      executionId: "exec-1",
      sessionIdFactory: () => "session-1",
    });

    const session = gate.setup({
      type: "majority",
      voters: [{ id: "opus" }, { id: "codex" }, { id: "glm" }],
      minRequired: 2,
    });

    expect(session.id).toBe("session-1");
    expect(gate.evaluate(session.id)).toEqual({ status: "pending", received: 0, required: 2 });

    gate.registerVote(session.id, { voterId: "opus", approved: true });
    expect(gate.evaluate(session.id)).toEqual({ status: "pending", received: 1, required: 2 });

    gate.registerVote(session.id, { voterId: "codex", approved: true });
    const result = gate.evaluate(session.id);
    expect(result.status).toBe("pass");
  });

  it("records consensus_vote and consensus_result into AuditTrail", async () => {
    const auditTrail = new InMemoryAuditStore();
    const gate = new DefaultConsensusGate({
      executionId: "exec-2",
      auditTrail,
      sessionIdFactory: () => "session-audit",
    });

    const session = gate.setup({
      type: "unanimous",
      voters: [{ id: "a" }, { id: "b" }],
      minRequired: 2,
    });

    gate.registerVote(session.id, { voterId: "a", approved: true });
    gate.registerVote(session.id, { voterId: "b", approved: false });
    gate.evaluate(session.id);

    const events = await auditTrail.query({ executionId: "exec-2" });
    expect(events.some((event) => event.type === "consensus_vote")).toBe(true);
    expect(events.some((event) => event.type === "consensus_result")).toBe(true);
  });

  it("supports timeout and best-effort voter marking", () => {
    const now = vi.fn(() => new Date("2026-02-16T00:00:00.000Z"));
    const gate = new DefaultConsensusGate({
      executionId: "exec-3",
      now,
      sessionIdFactory: () => "session-timeout",
    });

    const session = gate.setup({
      type: "majority",
      voters: [{ id: "required" }, { id: "best-effort" }],
      minRequired: 2,
      bestEffort: ["best-effort"],
    });

    gate.markBestEffort(session.id, "best-effort");
    gate.registerVote(session.id, { voterId: "required", approved: true });

    const result = gate.evaluate(session.id);
    expect(result.status).toBe("pass");

    const timeoutResult = gate.onTimeout(session.id);
    expect(timeoutResult.status).toBe("timeout");
  });

  it("parses timeout units and custom evaluators through public evaluation", () => {
    let now = new Date("2026-02-16T00:00:00.000Z");
    const gate = new DefaultConsensusGate({
      executionId: "exec-timeout-units",
      now: () => now,
    });

    const msSession = gate.setup({
      type: "majority",
      voters: [{ id: "a" }],
      minRequired: 1,
      timeout: "1ms",
    });
    gate.registerVote(msSession.id, { voterId: "a", approved: true, timestamp: new Date("2026-02-16T00:00:00.000Z") });
    now = new Date("2026-02-16T00:00:00.002Z");
    expect(gate.evaluate(msSession.id)).toMatchObject({ status: "timeout" });

    const minutesSession = gate.setup({
      type: "majority",
      voters: [{ id: "a" }],
      minRequired: 1,
      timeout: "1m",
    });
    gate.registerVote(minutesSession.id, { voterId: "a", approved: true });
    expect(gate.evaluate(minutesSession.id)).toMatchObject({ status: "pass" });

    const hoursSession = gate.setup({
      type: "majority",
      voters: [{ id: "a" }],
      minRequired: 1,
      timeout: "1h",
    });
    gate.registerVote(hoursSession.id, { voterId: "a", approved: true });
    expect(gate.evaluate(hoursSession.id)).toMatchObject({ status: "pass" });

    const invalidTimeoutSession = gate.setup({
      type: "majority",
      voters: [{ id: "a" }],
      minRequired: 1,
      timeout: "soon",
    });
    gate.registerVote(invalidTimeoutSession.id, { voterId: "a", approved: true });
    expect(gate.evaluate(invalidTimeoutSession.id)).toMatchObject({ status: "pass" });

    const custom = new DefaultConsensusGate({
      executionId: "exec-custom",
      sessionIdFactory: () => "custom-session",
    });
    const customEvaluate = vi.fn(() => ({ status: "fail" as const, reason: "custom fail", votes: [] }));
    const customSession = custom.setup({
      type: "custom",
      voters: [{ id: "a" }],
      minRequired: 1,
      customEvaluate,
    });
    custom.registerVote(customSession.id, { voterId: "a", approved: true });
    expect(custom.evaluate(customSession.id)).toMatchObject({ status: "fail", reason: "custom fail" });
    expect(customEvaluate).toHaveBeenCalledOnce();
  });

  it("M2-03A: majority excludes best_effort votes from verdict", () => {
    const gate = new DefaultConsensusGate({
      executionId: "exec-m2-03a-1",
      sessionIdFactory: () => "session-be-majority",
    });

    const session = gate.setup({
      type: "majority",
      voters: [{ id: "reqA" }, { id: "reqB" }, { id: "optC" }],
      minRequired: 2,
      bestEffort: ["optC"],
    });

    gate.registerVote(session.id, { voterId: "reqA", approved: false });
    gate.registerVote(session.id, { voterId: "reqB", approved: false });
    gate.registerVote(session.id, { voterId: "optC", approved: true });

    const result = gate.evaluate(session.id);
    expect(result.status).toBe("fail");
  });

  it("M2-03A: unanimous ignores best_effort rejection", () => {
    const gate = new DefaultConsensusGate({
      executionId: "exec-m2-03a-2",
      sessionIdFactory: () => "session-be-unanimous",
    });

    const session = gate.setup({
      type: "unanimous",
      voters: [{ id: "reqA" }, { id: "reqB" }, { id: "optC" }],
      minRequired: 2,
      bestEffort: ["optC"],
    });

    gate.registerVote(session.id, { voterId: "reqA", approved: true });
    gate.registerVote(session.id, { voterId: "reqB", approved: true });
    gate.registerVote(session.id, { voterId: "optC", approved: false });

    const result = gate.evaluate(session.id);
    expect(result.status).toBe("pass");
  });

  it("M2-03A: weighted excludes best_effort weight from verdict", () => {
    const gate = new DefaultConsensusGate({
      executionId: "exec-m2-03a-3",
      sessionIdFactory: () => "session-be-weighted",
    });

    const session = gate.setup({
      type: "weighted",
      voters: [{ id: "reqA", weight: 1 }, { id: "reqB", weight: 1 }, { id: "optC", weight: 100 }],
      minRequired: 2,
      bestEffort: ["optC"],
    });

    gate.registerVote(session.id, { voterId: "reqA", approved: false });
    gate.registerVote(session.id, { voterId: "reqB", approved: false });
    gate.registerVote(session.id, { voterId: "optC", approved: true });

    const result = gate.evaluate(session.id);
    expect(result.status).toBe("fail");
  });

  it("handles weighted pass and invalid total weight", () => {
    const passGate = new DefaultConsensusGate({
      executionId: "exec-weighted-pass",
      sessionIdFactory: () => "session-weighted-pass",
    });
    const passSession = passGate.setup({
      type: "weighted",
      voters: [{ id: "a", weight: 3 }, { id: "b", weight: 1 }],
      minRequired: 2,
    });
    passGate.registerVote(passSession.id, { voterId: "a", approved: true });
    passGate.registerVote(passSession.id, { voterId: "b", approved: false });
    expect(passGate.evaluate(passSession.id)).toMatchObject({ status: "pass" });

    const invalidGate = new DefaultConsensusGate({
      executionId: "exec-weighted-invalid",
      sessionIdFactory: () => "session-weighted-invalid",
    });
    const invalidSession = invalidGate.setup({
      type: "weighted",
      voters: [{ id: "a", weight: 0 }, { id: "b", weight: 0 }],
      minRequired: 2,
    });
    invalidGate.registerVote(invalidSession.id, { voterId: "a", approved: true });
    invalidGate.registerVote(invalidSession.id, { voterId: "b", approved: true });
    expect(invalidGate.evaluate(invalidSession.id)).toMatchObject({
      status: "fail",
      reason: "invalid total vote weight",
    });
  });

  it("M2-03A: score-threshold excludes best_effort from average", () => {
    const gate = new DefaultConsensusGate({
      executionId: "exec-m2-03a-4",
      sessionIdFactory: () => "session-be-score",
    });

    const session = gate.setup({
      type: "score-threshold",
      voters: [{ id: "reqA" }, { id: "reqB" }, { id: "optC" }],
      minRequired: 2,
      threshold: 0.7,
      bestEffort: ["optC"],
    });

    gate.registerVote(session.id, { voterId: "reqA", approved: false, score: 0.3 });
    gate.registerVote(session.id, { voterId: "reqB", approved: false, score: 0.4 });
    gate.registerVote(session.id, { voterId: "optC", approved: true, score: 1.0 });

    const result = gate.evaluate(session.id);
    expect(result.status).toBe("fail");
  });

  it("fails score-threshold when no scored votes are provided", () => {
    const gate = new DefaultConsensusGate({
      executionId: "exec-score-empty",
      sessionIdFactory: () => "session-score-empty",
    });

    const session = gate.setup({
      type: "score-threshold",
      voters: [{ id: "a" }],
      minRequired: 1,
      threshold: 0.5,
    });

    gate.registerVote(session.id, { voterId: "a", approved: true });
    expect(gate.evaluate(session.id)).toMatchObject({
      status: "fail",
      reason: "no scored votes provided",
    });
  });
});

describe("M2-03B: score clamp policy", () => {
  it("clamps score > 1 to 1", () => {
    const gate = new DefaultConsensusGate({
      executionId: "exec-m2-03b-1",
      sessionIdFactory: () => "session-clamp-hi",
    });

    const session = gate.setup({
      type: "score-threshold",
      voters: [{ id: "v1" }],
      minRequired: 1,
      threshold: 0.5,
    });

    gate.registerVote(session.id, { voterId: "v1", approved: true, score: 5.0 });
    const result = gate.evaluate(session.id);
    expect(result.status).toBe("pass");
    if (result.status === "pass") {
      expect(result.votes[0].score).toBe(1);
    }
  });

  it("clamps score < 0 to 0", () => {
    const gate = new DefaultConsensusGate({
      executionId: "exec-m2-03b-2",
      sessionIdFactory: () => "session-clamp-lo",
    });

    const session = gate.setup({
      type: "score-threshold",
      voters: [{ id: "v1" }],
      minRequired: 1,
      threshold: 0.5,
    });

    gate.registerVote(session.id, { voterId: "v1", approved: true, score: -3.0 });
    const result = gate.evaluate(session.id);
    expect(result.status).toBe("fail");
    if (result.status === "fail") {
      expect(result.votes[0].score).toBe(0);
    }
  });

  it("passes through undefined score unchanged", () => {
    const gate = new DefaultConsensusGate({
      executionId: "exec-m2-03b-3",
      sessionIdFactory: () => "session-clamp-undef",
    });

    const session = gate.setup({
      type: "majority",
      voters: [{ id: "v1" }],
      minRequired: 1,
    });

    gate.registerVote(session.id, { voterId: "v1", approved: true });
    const result = gate.evaluate(session.id);
    expect(result.status).toBe("pass");
    if (result.status === "pass") {
      expect(result.votes[0].score).toBeUndefined();
    }
  });
});
