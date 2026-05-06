import { describe, expect, it } from "vitest";

import { persistStructuredAuditEvent, toStructuredAuditEvent } from "../AuditReplay.js";
import type { AuditEvent } from "../types.js";

describe("AuditReplay mapper", () => {
  it("maps consensus_vote into structured vote + actor", () => {
    const event: AuditEvent = {
      id: "e1",
      executionId: "run-1",
      timestamp: new Date("2026-02-18T00:00:00.000Z"),
      type: "consensus_vote",
      data: {
        stepName: "review",
        vote: {
          voterId: "agent-b",
          approved: true,
          score: 0.92,
        },
      },
    };

    const mapped = toStructuredAuditEvent("run-1", event);
    expect(mapped.category).toBe("consensus");
    expect(mapped.actor).toBe("agent-b");
    expect(mapped.vote).toEqual({ decision: "approve", confidence: 0.92, reasoning: undefined });
  });

  it("prefers detail.action over event.type", () => {
    const event: AuditEvent = {
      id: "e2",
      executionId: "run-1",
      timestamp: new Date("2026-02-18T00:00:01.000Z"),
      type: "recovery_start",
      data: {
        stepName: "runtime",
        action: "policy_drift_detected",
      },
    };

    const mapped = toStructuredAuditEvent("run-1", event);
    expect(mapped.category).toBe("recovery");
    expect(mapped.action).toBe("policy_drift_detected");
  });

  it("falls back to runtime step name when stepName is missing", () => {
    const event: AuditEvent = {
      id: "e3",
      executionId: "run-1",
      timestamp: new Date("2026-02-18T00:00:02.000Z"),
      type: "execution_start",
      data: { workflowName: "wf" },
    };

    const mapped = toStructuredAuditEvent("run-1", event);
    expect(mapped.stepName).toBe("runtime");
    expect(mapped.category).toBe("execution");
  });

  it("maps policy, gate, recovery, and non-object details", () => {
    const policy = toStructuredAuditEvent("run-1", {
      id: "e4",
      executionId: "run-1",
      timestamp: new Date("2026-02-18T00:00:03.000Z"),
      type: "policy_check",
      data: {
        agent: "policy-agent",
        stepName: "",
      },
    });
    expect(policy.category).toBe("policy");
    expect(policy.actor).toBe("policy-agent");
    expect(policy.stepName).toBe("runtime");

    expect(
      toStructuredAuditEvent("run-1", {
        id: "e5",
        executionId: "run-1",
        timestamp: new Date("2026-02-18T00:00:04.000Z"),
        type: "gate_wait",
        data: { actor: "gatekeeper" },
      }).category
    ).toBe("policy");

    expect(
      toStructuredAuditEvent("run-1", {
        id: "e6",
        executionId: "run-1",
        timestamp: new Date("2026-02-18T00:00:05.000Z"),
        type: "snapshot_restore",
        data: "raw-detail",
      })
    ).toMatchObject({
      category: "recovery",
      actor: "system",
      detail: { value: "raw-detail" },
    });
  });

  it("normalizes decision votes and ignores invalid vote payloads", () => {
    const abstain = toStructuredAuditEvent("run-1", {
      id: "e7",
      executionId: "run-1",
      timestamp: new Date("2026-02-18T00:00:06.000Z"),
      type: "consensus_vote",
      data: {
        voterId: "agent-c",
        decision: "abstain",
        confidence: 0.4,
        reasoning: "insufficient context",
      },
    });
    expect(abstain.vote).toEqual({
      decision: "abstain",
      confidence: 0.4,
      reasoning: "insufficient context",
    });

    const undecoratedDecision = toStructuredAuditEvent("run-1", {
      id: "e7b",
      executionId: "run-1",
      timestamp: new Date("2026-02-18T00:00:06.500Z"),
      type: "consensus_vote",
      data: {
        voterId: "agent-c",
        decision: "approve",
      },
    });
    expect(undecoratedDecision.vote).toEqual({
      decision: "approve",
      confidence: undefined,
      reasoning: undefined,
    });

    const rejected = toStructuredAuditEvent("run-1", {
      id: "e8",
      executionId: "run-1",
      timestamp: new Date("2026-02-18T00:00:07.000Z"),
      type: "consensus_vote",
      data: {
        vote: {
          voterId: "agent-d",
          approved: false,
          reasoning: "risk remains",
        },
      },
    });
    expect(rejected.actor).toBe("agent-d");
    expect(rejected.vote).toEqual({
      decision: "reject",
      confidence: undefined,
      reasoning: "risk remains",
    });

    const invalid = toStructuredAuditEvent("run-1", {
      id: "e9",
      executionId: "run-1",
      timestamp: new Date("2026-02-18T00:00:08.000Z"),
      type: "consensus_vote",
      data: {
        vote: { decision: "maybe" },
      },
    });
    expect(invalid.vote).toBeUndefined();
  });

  it("persists structured events only when adapter supports audit writes", async () => {
    const event: AuditEvent = {
      id: "e10",
      executionId: "run-1",
      timestamp: new Date("2026-02-18T00:00:09.000Z"),
      type: "execution_start",
      data: { actor: "runner" },
    };
    const saved: unknown[] = [];

    await expect(persistStructuredAuditEvent(undefined, "run-1", event)).resolves.toBeUndefined();
    await expect(persistStructuredAuditEvent({}, "run-1", event)).resolves.toBeUndefined();
    await persistStructuredAuditEvent(
      {
        saveAuditEvent: async (structured: unknown) => {
          saved.push(structured);
        },
      },
      "run-1",
      event
    );

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      runId: "run-1",
      actor: "runner",
    });
  });
});
