import { describe, expect, it, vi } from "vitest";

import { InMemoryAuditStore } from "../../audit/InMemoryAuditStore.js";
import { DefaultConsensusGate } from "../ConsensusGate.js";

describe("DefaultConsensusGate", () => {
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
});
