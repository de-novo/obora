import { describe, expect, it } from "vitest";
import { GateAssignmentManager } from "../GateAssignment.js";
import { MultiStageApprovalGate, type ApprovalDecision } from "../MultiStageApproval.js";
import { SLAManager } from "../SLAManager.js";

describe("HITL gates", () => {
  it("approves 2-stage flow when reviewer and owner approve", async () => {
    const gate = new MultiStageApprovalGate({
      stages: [
        { name: "reviewer", approvers: ["alice"], required: 1 },
        { name: "owner", approvers: ["bob"], required: 1 },
      ],
    });

    const now = new Date("2026-02-17T00:00:00.000Z");
    const decisions: ApprovalDecision[] = [
      { stageIndex: 0, stageName: "reviewer", approver: "alice", decision: "approved", timestamp: now },
      { stageIndex: 1, stageName: "owner", approver: "bob", decision: "approved", timestamp: new Date(now.getTime() + 1_000) },
    ];

    const result = await gate.evaluate(decisions);
    expect(result.approved).toBe(true);
    expect(result.stages.map((stage) => stage.status)).toEqual(["approved", "approved"]);
  });

  it("rejects on first stage rejection when on_reject=fail", async () => {
    const gate = new MultiStageApprovalGate({
      stages: [
        { name: "reviewer", approvers: ["alice"], required: 1 },
        { name: "owner", approvers: ["bob"], required: 1 },
      ],
      on_reject: "fail",
    });

    const result = await gate.evaluate([
      {
        stageIndex: 0,
        stageName: "reviewer",
        approver: "alice",
        decision: "rejected",
        comment: "insufficient risk analysis",
        timestamp: new Date("2026-02-17T00:00:00.000Z"),
      },
    ]);

    expect(result.approved).toBe(false);
    expect(result.stages[0]?.status).toBe("rejected");
    expect(result.reason).toContain("Rejected at stage");
  });

  it("skips conditional stage when condition is false", async () => {
    const gate = new MultiStageApprovalGate(
      {
        stages: [
          { name: "reviewer", approvers: ["alice"], required: 1 },
          { name: "owner", approvers: ["bob"], required: 1, condition: "context.requireOwner == true" },
        ],
      },
      { conditionContext: { requireOwner: false } }
    );

    const result = await gate.evaluate([
      {
        stageIndex: 0,
        stageName: "reviewer",
        approver: "alice",
        decision: "approved",
        timestamp: new Date("2026-02-17T00:00:00.000Z"),
      },
    ]);

    expect(result.approved).toBe(true);
    expect(result.stages[1]?.status).toBe("skipped");
  });

  it("fails closed when gate condition evaluation throws", async () => {
    const gate = new MultiStageApprovalGate(
      {
        stages: [
          { name: "reviewer", approvers: ["alice"], required: 1, condition: 'matches(context.requireOwner, "(")' },
        ],
      },
      { conditionContext: { requireOwner: "owner" } }
    );

    const result = await gate.evaluate([]);

    expect(result.approved).toBe(false);
    expect(result.stages[0]?.status).toBe("rejected");
    expect(result.reason).toContain("condition_evaluation_error:");
  });

  it("supports partial approval threshold (2 of 3)", async () => {
    const gate = new MultiStageApprovalGate({
      stages: [{ name: "security", approvers: ["a", "b", "c"], required: 2 }],
    });

    const result = await gate.evaluate([
      { stageIndex: 0, stageName: "security", approver: "a", decision: "approved", timestamp: new Date("2026-02-17T00:00:00.000Z") },
      { stageIndex: 0, stageName: "security", approver: "b", decision: "approved", timestamp: new Date("2026-02-17T00:00:01.000Z") },
      { stageIndex: 0, stageName: "security", approver: "c", decision: "abstained", timestamp: new Date("2026-02-17T00:00:02.000Z") },
    ]);

    expect(result.approved).toBe(true);
    expect(result.stages[0]?.status).toBe("approved");
  });

  it("tracks approval decisions with comments and history", async () => {
    const gate = new MultiStageApprovalGate({
      stages: [{ name: "review", approvers: ["alice"], required: 1 }],
      allow_comments: true,
      track_history: true,
    });

    const result = await gate.evaluate([
      {
        stageIndex: 0,
        stageName: "review",
        approver: "alice",
        decision: "approved",
        comment: "looks good",
        timestamp: new Date("2026-02-17T00:00:00.000Z"),
      },
    ]);

    expect(result.stages[0]?.decisions[0]?.comment).toBe("looks good");
  });

  it("manages assignment create, reassign, expire", () => {
    const manager = new GateAssignmentManager({
      now: () => new Date("2026-02-17T00:00:00.000Z"),
    });

    const created = manager.assign("gate-1", "deploy", "alice", "10m");
    expect(created.status).toBe("pending");
    expect(created.expiresAt).toBeDefined();

    const reassigned = manager.reassign("gate-1", "bob", "OOO");
    expect(reassigned.assignedTo).toBe("bob");
    expect(reassigned.reassignedFrom).toBe("alice");

    const expired = manager.expire("gate-1");
    expect(expired.status).toBe("expired");
  });

  it("returns expired SLA with fallback action", () => {
    const sla = new SLAManager({
      now: () => new Date("2026-02-17T00:11:00.000Z"),
    });

    const result = sla.checkSLA(
      {
        gateId: "gate-1",
        stepName: "deploy",
        assignedTo: "alice",
        assignedAt: new Date("2026-02-17T00:00:00.000Z"),
        status: "pending",
      },
      { timeout: "10m", fallback: "fail" }
    );

    expect(result.status).toBe("expired");
    expect(result.action).toBe("fail");
  });

  it("returns SLA warning when within warning threshold", () => {
    const sla = new SLAManager({
      now: () => new Date("2026-02-17T00:09:00.000Z"),
    });

    const result = sla.checkSLA(
      {
        gateId: "gate-2",
        stepName: "approve",
        assignedTo: "alice",
        assignedAt: new Date("2026-02-17T00:00:00.000Z"),
        status: "pending",
      },
      { timeout: "10m", warning_at: "2m", fallback: "escalate", escalation_chain: ["owner", "security"] }
    );

    expect(result.status).toBe("warning");
    expect(result.action).toBe("warn");
  });

  it("uses escalation chain on SLA expiry", () => {
    const sla = new SLAManager({
      now: () => new Date("2026-02-17T00:11:00.000Z"),
    });

    const result = sla.checkSLA(
      {
        gateId: "gate-3",
        stepName: "release",
        assignedTo: "alice",
        assignedAt: new Date("2026-02-17T00:00:00.000Z"),
        status: "pending",
      },
      { timeout: "10m", fallback: "escalate", escalation_chain: ["owner", "director"] }
    );

    expect(result.status).toBe("expired");
    expect(result.action).toBe("escalate");
    expect(result.escalationTarget).toBe("owner");
  });
});
