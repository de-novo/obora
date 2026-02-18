import { describe, expect, it } from "vitest";

import { toStructuredAuditEvent } from "../AuditReplay.js";
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
});
