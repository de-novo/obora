import { describe, expect, it, vi } from "vitest";
import { GateAssignmentManager } from "../GateAssignment.js";
import { MultiStageApprovalGate, buildSLAConfigFromStage, type ApprovalDecision } from "../MultiStageApproval.js";
import { SLAManager } from "../SLAManager.js";
import type { GateAuditEvent } from "../types.js";

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

  // === P1-1: reassign refreshes expiresAt ===

  it("reassign refreshes expiresAt using original duration", () => {
    let currentTime = new Date("2026-02-17T00:00:00.000Z");
    const manager = new GateAssignmentManager({
      now: () => currentTime,
    });

    const created = manager.assign("gate-r1", "deploy", "alice", "10m");
    expect(created.expiresAt!.getTime()).toBe(currentTime.getTime() + 600_000);

    // Advance 5 minutes, then reassign
    currentTime = new Date("2026-02-17T00:05:00.000Z");
    const reassigned = manager.reassign("gate-r1", "bob", "alice OOO");

    // expiresAt should be 10m from reassignment time (00:15), not stale (00:10)
    expect(reassigned.expiresAt!.getTime()).toBe(currentTime.getTime() + 600_000);
    expect(reassigned.expiresAt!.toISOString()).toBe("2026-02-17T00:15:00.000Z");
  });

  it("reassign with explicit timeout overrides original duration", () => {
    let currentTime = new Date("2026-02-17T00:00:00.000Z");
    const manager = new GateAssignmentManager({
      now: () => currentTime,
    });

    manager.assign("gate-r2", "deploy", "alice", "10m");

    currentTime = new Date("2026-02-17T00:05:00.000Z");
    const reassigned = manager.reassign("gate-r2", "bob", "escalation", "5m");

    // Should be 5m from now, not 10m
    expect(reassigned.expiresAt!.getTime()).toBe(currentTime.getTime() + 300_000);
    expect(reassigned.expiresAt!.toISOString()).toBe("2026-02-17T00:10:00.000Z");
  });

  it("reassign preserves undefined expiresAt when original had no timeout", () => {
    const manager = new GateAssignmentManager({
      now: () => new Date("2026-02-17T00:00:00.000Z"),
    });

    manager.assign("gate-r3", "deploy", "alice"); // no timeout
    const reassigned = manager.reassign("gate-r3", "bob", "handoff");

    expect(reassigned.expiresAt).toBeUndefined();
  });

  // === P1-2: on_reject distinct semantics ===

  it("on_reject=restart returns action='restart' with rejection", async () => {
    const gate = new MultiStageApprovalGate({
      stages: [
        { name: "reviewer", approvers: ["alice"], required: 1 },
        { name: "owner", approvers: ["bob"], required: 1 },
      ],
      on_reject: "restart",
    });

    const result = await gate.evaluate([
      { stageIndex: 0, stageName: "reviewer", approver: "alice", decision: "approved", timestamp: new Date("2026-02-17T00:00:00.000Z") },
      { stageIndex: 1, stageName: "owner", approver: "bob", decision: "rejected", timestamp: new Date("2026-02-17T00:01:00.000Z") },
    ]);

    expect(result.approved).toBe(false);
    expect(result.action).toBe("restart");
    expect(result.reason).toContain("(restart)");
    expect(result.reassignStageIndex).toBeUndefined();
  });

  it("on_reject=reassign returns action='reassign' with reassignStageIndex", async () => {
    const gate = new MultiStageApprovalGate({
      stages: [
        { name: "reviewer", approvers: ["alice", "charlie"], required: 1 },
        { name: "owner", approvers: ["bob"], required: 1 },
      ],
      on_reject: "reassign",
    });

    const result = await gate.evaluate([
      { stageIndex: 0, stageName: "reviewer", approver: "alice", decision: "rejected", timestamp: new Date("2026-02-17T00:00:00.000Z") },
    ]);

    expect(result.approved).toBe(false);
    expect(result.action).toBe("reassign");
    expect(result.reassignStageIndex).toBe(0);
    expect(result.reason).toContain("(reassign)");
  });

  it("on_reject=fail returns action='fail' (default)", async () => {
    const gate = new MultiStageApprovalGate({
      stages: [{ name: "reviewer", approvers: ["alice"], required: 1 }],
      on_reject: "fail",
    });

    const result = await gate.evaluate([
      { stageIndex: 0, stageName: "reviewer", approver: "alice", decision: "rejected", timestamp: new Date("2026-02-17T00:00:00.000Z") },
    ]);

    expect(result.approved).toBe(false);
    expect(result.action).toBe("fail");
    expect(result.reassignStageIndex).toBeUndefined();
  });

  it("condition_evaluation_error sets action='fail'", async () => {
    const gate = new MultiStageApprovalGate(
      {
        stages: [{ name: "review", approvers: ["alice"], required: 1, condition: 'matches(context.x, "(")' }],
        on_reject: "restart",
      },
      { conditionContext: { x: "y" } }
    );

    const result = await gate.evaluate([]);
    expect(result.action).toBe("fail");
  });

  // === P2-3: stage-level timeout/fallback/escalation_to → SLAConfig bridge ===

  it("buildSLAConfigFromStage maps stage fields to SLAConfig", () => {
    const config = buildSLAConfigFromStage({
      name: "security-review",
      approvers: ["alice"],
      required: 1,
      timeout: "30m",
      fallback: "escalate",
      escalation_to: "director",
    });

    expect(config).toBeDefined();
    expect(config!.timeout).toBe("30m");
    expect(config!.fallback).toBe("escalate");
    expect(config!.escalation_chain).toEqual(["director"]);
  });

  it("buildSLAConfigFromStage returns undefined when no timeout", () => {
    const config = buildSLAConfigFromStage({
      name: "quick-review",
      approvers: ["alice"],
      required: 1,
    });

    expect(config).toBeUndefined();
  });

  it("buildSLAConfigFromStage defaults fallback to 'fail'", () => {
    const config = buildSLAConfigFromStage({
      name: "review",
      approvers: ["alice"],
      required: 1,
      timeout: "15m",
    });

    expect(config!.fallback).toBe("fail");
    expect(config!.escalation_chain).toBeUndefined();
  });

  it("stage SLA config integrates with SLAManager.checkSLA", () => {
    const stage = {
      name: "compliance",
      approvers: ["legal"],
      required: 1,
      timeout: "1h",
      fallback: "escalate" as const,
      escalation_to: "ceo",
    };

    const slaConfig = buildSLAConfigFromStage(stage)!;
    const sla = new SLAManager({
      now: () => new Date("2026-02-17T02:00:00.000Z"), // 2h after assignment
    });

    const result = sla.checkSLA(
      {
        gateId: "gate-sla-stage",
        stepName: stage.name,
        assignedTo: "legal",
        assignedAt: new Date("2026-02-17T00:00:00.000Z"),
        status: "pending",
      },
      slaConfig
    );

    expect(result.status).toBe("expired");
    expect(result.action).toBe("escalate");
    expect(result.escalationTarget).toBe("ceo");
  });

  // === P2-4: audit emit assertions ===

  it("GateAssignmentManager.assign emits gate_assignment_created", () => {
    const events: GateAuditEvent[] = [];
    const manager = new GateAssignmentManager({
      now: () => new Date("2026-02-17T00:00:00.000Z"),
      emit: (event) => { events.push(event); },
    });

    manager.assign("gate-a1", "deploy", "alice", "10m");

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("gate_assignment_created");
    expect(events[0]!.payload).toMatchObject({
      gateId: "gate-a1",
      stepName: "deploy",
      assignedTo: "alice",
    });
    expect(events[0]!.payload.expiresAt).toBeDefined();
  });

  it("GateAssignmentManager.reassign emits gate_assignment_reassigned with expiresAt", () => {
    const events: GateAuditEvent[] = [];
    const manager = new GateAssignmentManager({
      now: () => new Date("2026-02-17T00:00:00.000Z"),
      emit: (event) => { events.push(event); },
    });

    manager.assign("gate-a2", "deploy", "alice", "10m");
    events.length = 0; // clear assign event

    manager.reassign("gate-a2", "bob", "escalation");

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("gate_assignment_reassigned");
    expect(events[0]!.payload).toMatchObject({
      gateId: "gate-a2",
      from: "alice",
      to: "bob",
      reason: "escalation",
    });
    expect(events[0]!.payload.expiresAt).toBeDefined();
  });

  it("GateAssignmentManager.expire emits gate_assignment_expired", () => {
    const events: GateAuditEvent[] = [];
    const manager = new GateAssignmentManager({
      now: () => new Date("2026-02-17T00:00:00.000Z"),
      emit: (event) => { events.push(event); },
    });

    manager.assign("gate-a3", "deploy", "alice");
    events.length = 0;

    manager.expire("gate-a3");

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("gate_assignment_expired");
    expect(events[0]!.payload).toMatchObject({
      gateId: "gate-a3",
      assignedTo: "alice",
    });
  });

  it("MultiStageApprovalGate emits gate_approval_decision for each decision", async () => {
    const events: GateAuditEvent[] = [];
    const gate = new MultiStageApprovalGate(
      {
        stages: [{ name: "review", approvers: ["alice", "bob"], required: 2 }],
      },
      { emit: async (event) => { events.push(event); } }
    );

    await gate.evaluate([
      { stageIndex: 0, stageName: "review", approver: "alice", decision: "approved", timestamp: new Date("2026-02-17T00:00:00.000Z") },
      { stageIndex: 0, stageName: "review", approver: "bob", decision: "approved", timestamp: new Date("2026-02-17T00:01:00.000Z") },
    ]);

    expect(events).toHaveLength(2);
    expect(events.every((e) => e.type === "gate_approval_decision")).toBe(true);
    expect(events[0]!.payload.approver).toBe("alice");
    expect(events[1]!.payload.approver).toBe("bob");
  });

  it("MultiStageApprovalGate emits for rejections before returning", async () => {
    const events: GateAuditEvent[] = [];
    const gate = new MultiStageApprovalGate(
      {
        stages: [{ name: "review", approvers: ["alice"], required: 1 }],
        on_reject: "fail",
      },
      { emit: async (event) => { events.push(event); } }
    );

    await gate.evaluate([
      { stageIndex: 0, stageName: "review", approver: "alice", decision: "rejected", comment: "bad", timestamp: new Date("2026-02-17T00:00:00.000Z") },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("gate_approval_decision");
    expect(events[0]!.payload.decision).toBe("rejected");
    expect(events[0]!.payload.comment).toBe("bad");
  });

  it("SLAManager emits gate_sla_expired on timeout", () => {
    const events: GateAuditEvent[] = [];
    const sla = new SLAManager({
      now: () => new Date("2026-02-17T00:11:00.000Z"),
      emit: (event) => { events.push(event); },
    });

    sla.checkSLA(
      {
        gateId: "gate-sla-e",
        stepName: "deploy",
        assignedTo: "alice",
        assignedAt: new Date("2026-02-17T00:00:00.000Z"),
        status: "pending",
      },
      { timeout: "10m", fallback: "escalate", escalation_chain: ["owner"] }
    );

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("gate_sla_expired");
    expect(events[0]!.payload).toMatchObject({
      gateId: "gate-sla-e",
      fallback: "escalate",
      escalationTarget: "owner",
    });
  });

  it("SLAManager emits gate_sla_warning when in warning zone", () => {
    const events: GateAuditEvent[] = [];
    const sla = new SLAManager({
      now: () => new Date("2026-02-17T00:09:00.000Z"),
      emit: (event) => { events.push(event); },
    });

    sla.checkSLA(
      {
        gateId: "gate-sla-w",
        stepName: "approve",
        assignedTo: "alice",
        assignedAt: new Date("2026-02-17T00:00:00.000Z"),
        status: "pending",
      },
      { timeout: "10m", warning_at: "2m", fallback: "fail" }
    );

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("gate_sla_warning");
    expect(events[0]!.payload).toMatchObject({
      gateId: "gate-sla-w",
      assignedTo: "alice",
    });
  });
});
