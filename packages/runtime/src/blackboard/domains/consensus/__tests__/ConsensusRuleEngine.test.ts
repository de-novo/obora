import { describe, expect, it } from "vitest";

import { createAgentId, createAgendaId, createSessionId } from "../../../types";
import { evaluateConsensus } from "../ConsensusRuleEngine";
import { isConsensusResult, type VotingSessionSnapshot } from "../types";

function snapshot(overrides: Partial<VotingSessionSnapshot["tally"]> = {}): VotingSessionSnapshot {
  return {
    sessionId: createSessionId("session-consensus"),
    policy: "majority",
    tally: {
      sessionId: createSessionId("session-consensus"),
      totalVotes: 3,
      approves: 2,
      rejects: 1,
      abstains: 0,
      passed: true,
      quorumMet: true,
      ...overrides,
    },
  };
}

describe("ConsensusRuleEngine", () => {
  it("evaluates majority, weighted, unanimous, and quorum failure decisions", () => {
    expect(evaluateConsensus(snapshot(), { method: "majority" })).toMatchObject({
      status: "APPROVED",
      approved: true,
      summary: "majority rule evaluated",
    });
    expect(evaluateConsensus(snapshot({ passed: false }), { method: "weighted" })).toMatchObject({
      status: "REJECTED",
      approved: false,
    });
    expect(evaluateConsensus(snapshot({ approves: 2, rejects: 0, abstains: 1 }), { method: "unanimous" })).toMatchObject({
      status: "APPROVED",
      approved: true,
    });
    expect(evaluateConsensus(snapshot({ quorumMet: false }), { method: "majority" })).toMatchObject({
      status: "REJECTED",
      approved: false,
    });
  });

  it("applies supermajority thresholds and falls back for invalid thresholds", () => {
    expect(evaluateConsensus(snapshot({ approves: 2, totalVotes: 3 }), { method: "supermajority" })).toMatchObject({
      status: "APPROVED",
      approved: true,
    });
    expect(
      evaluateConsensus(snapshot({ approves: 2, totalVotes: 3 }), {
        method: "supermajority",
        supermajorityThreshold: 0.8,
      }),
    ).toMatchObject({
      status: "REJECTED",
      approved: false,
    });
    expect(
      evaluateConsensus(snapshot({ approves: 2, totalVotes: 3 }), {
        method: "supermajority",
        supermajorityThreshold: Number.NaN,
      }),
    ).toMatchObject({
      status: "APPROVED",
      approved: true,
    });
  });

  it("normalizes conditional codes and lets escalation override approval status", () => {
    const conditional = evaluateConsensus(snapshot(), {
      conditionalCodes: [" audit ", "", "audit", "legal"],
      summary: "approved with follow-ups",
    });

    expect(conditional).toMatchObject({
      status: "CONDITIONAL",
      approved: true,
      summary: "approved with follow-ups",
      conditions: [
        { code: "audit", description: "audit" },
        { code: "legal", description: "legal" },
      ],
    });

    expect(
      evaluateConsensus(snapshot(), {
        escalation: { reason: "requires owner", requiredRoles: ["owner"] },
      }),
    ).toMatchObject({
      status: "ESCALATED",
      approved: true,
      escalation: { reason: "requires owner", requiredRoles: ["owner"] },
    });
  });

  it("guards public consensus result shape", () => {
    const result = evaluateConsensus(snapshot());

    expect(isConsensusResult(result)).toBe(true);
    expect(isConsensusResult({ ...result, status: "UNKNOWN" })).toBe(false);
    expect(isConsensusResult({ ...result, approved: "yes" })).toBe(false);
    expect(isConsensusResult({ ...result, snapshot: { sessionId: "s", tally: { sessionId: "s" } } })).toBe(false);
    expect(
      isConsensusResult({
        ...result,
        conditions: [{ code: "audit", description: 42 }],
      }),
    ).toBe(false);
    expect(
      isConsensusResult({
        ...result,
        escalation: { reason: "owner", requiredRoles: [createAgentId("owner")] },
      }),
    ).toBe(true);
    expect(
      isConsensusResult({
        ...result,
        escalation: { reason: "owner", requiredRoles: [createAgendaId("agenda")] },
      }),
    ).toBe(true);
    expect(
      isConsensusResult({
        ...result,
        escalation: { reason: "owner", requiredRoles: [1] },
      }),
    ).toBe(false);
  });
});
