import { describe, expect, it, vi } from "vitest";

import { OboraErrorCode } from "../../errors/OboraErrorCode.js";
import { ConsensusPattern } from "./ConsensusPattern.js";

describe("ConsensusPattern", () => {
  it("passes majority when approvals are over half", async () => {
    const pattern = new ConsensusPattern();

    const result = await pattern.execute({
      pattern: "consensus",
      participants: {
        a: "agent-a",
        b: "agent-b",
        c: "agent-c",
      },
      config: {
        rule: "majority",
      },
      input: {
        votes: {
          a: true,
          b: true,
          c: false,
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      status: "consensus-reached",
      rule: "majority",
    });
  });

  it("fails majority when approvals are not enough", async () => {
    const pattern = new ConsensusPattern();

    const result = await pattern.execute({
      pattern: "consensus",
      participants: {
        a: "agent-a",
        b: "agent-b",
        c: "agent-c",
      },
      config: {
        rule: "majority",
      },
      input: {
        votes: {
          a: true,
          b: false,
          c: false,
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({
      status: "consensus-rejected",
      reason: "majority not reached",
    });
  });

  it("majority score stays in [0, 1] range", async () => {
    const pattern = new ConsensusPattern();

    const result = await pattern.execute({
      pattern: "consensus",
      participants: {
        a: "agent-a",
        b: "agent-b",
        c: "agent-c",
      },
      config: { rule: "majority" },
      input: {
        votes: { a: true, b: true, c: true },
      },
    });

    expect(result.success).toBe(true);
    const output = result.output as Record<string, unknown>;
    expect(output.score).toBe(1);
    expect(output.score).toBeLessThanOrEqual(1);
    expect(output.score).toBeGreaterThanOrEqual(0);
  });


  it("majority uses required voters only (best_effort cannot flip verdict)", async () => {
    const pattern = new ConsensusPattern();

    const result = await pattern.execute({
      pattern: "consensus",
      participants: {
        reqA: "agent-a",
        reqB: "agent-b",
        optC: "agent-c",
      },
      config: {
        rule: "majority",
        best_effort: ["optC"],
      },
      input: {
        votes: {
          reqA: true,
          reqB: false,
          optC: true,
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({ reason: "majority not reached" });
    const output = result.output as Record<string, unknown>;
    expect(output.score).toBe(0.5);
    expect(output.score).toBeLessThanOrEqual(1);
  });

  it("passes unanimous only when everyone approves", async () => {
    const pattern = new ConsensusPattern();

    const pass = await pattern.execute({
      pattern: "consensus",
      participants: {
        a: "agent-a",
        b: "agent-b",
      },
      config: { rule: "unanimous" },
      input: {
        votes: {
          a: true,
          b: true,
        },
      },
    });

    const fail = await pattern.execute({
      pattern: "consensus",
      participants: {
        a: "agent-a",
        b: "agent-b",
      },
      config: { rule: "unanimous" },
      input: {
        votes: {
          a: true,
          b: false,
        },
      },
    });

    expect(pass.success).toBe(true);
    expect(fail.success).toBe(false);
  });

  it("evaluates weighted voting by threshold", async () => {
    const pattern = new ConsensusPattern();

    const result = await pattern.execute({
      pattern: "consensus",
      participants: {
        architect: "agent-a",
        reviewerA: "agent-b",
        reviewerB: "agent-c",
      },
      config: {
        rule: "weighted",
        threshold: 0.7,
        weights: {
          architect: 0.5,
          reviewerA: 0.3,
          reviewerB: 0.2,
        },
      },
      input: {
        votes: {
          architect: true,
          reviewerA: true,
          reviewerB: false,
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      status: "consensus-reached",
      reason: "weighted threshold met",
    });
  });

  it("evaluates score-threshold by average score", async () => {
    const pattern = new ConsensusPattern();

    const result = await pattern.execute({
      pattern: "consensus",
      participants: {
        a: "agent-a",
        b: "agent-b",
      },
      config: {
        rule: "score-threshold",
        threshold: 0.8,
      },
      input: {
        votes: {
          a: { approved: true, score: 0.9 },
          b: { approved: true, score: 0.8 },
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      status: "consensus-reached",
      reason: "score threshold met",
    });
  });

  it("continues when best_effort voter does not respond", async () => {
    const pattern = new ConsensusPattern();

    const result = await pattern.execute({
      pattern: "consensus",
      participants: {
        required: "agent-a",
        optional: "agent-b",
      },
      config: {
        rule: "majority",
        best_effort: ["optional"],
      },
      input: {
        votes: {
          required: true,
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("emits consensus_result for quorum_not_met", async () => {
    const pattern = new ConsensusPattern();
    const emit = vi.fn();

    const result = await pattern.execute({
      pattern: "consensus",
      participants: {
        requiredA: "agent-a",
        requiredB: "agent-b",
      },
      config: {
        rule: "majority",
      },
      input: {
        votes: {
          requiredA: true,
        },
      },
      emit,
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({ status: "quorum-not-met" });
    expect(emit.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "consensus_result",
      payload: {
        status: "fail",
        reason: "quorum_not_met",
      },
    });
  });

  it("throws timeout code when required voters are missing after timeout", async () => {
    const pattern = new ConsensusPattern();
    const emit = vi.fn();

    await expect(
      pattern.execute({
        pattern: "consensus",
        participants: {
          requiredA: "agent-a",
          requiredB: "agent-b",
        },
        config: {
          rule: "majority",
          timeout: "1s",
        },
        input: {
          startedAt: "2026-02-15T23:59:00.000Z",
          votes: {
            requiredA: true,
          },
        },
        now: () => new Date("2026-02-16T00:00:10.000Z"),
        emit,
      } as never)
    ).rejects.toMatchObject({ code: OboraErrorCode.CONSENSUS_TIMEOUT });

    expect(emit.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "consensus_result",
      payload: {
        status: "timeout",
        reason: "required voters timeout",
      },
    });
  });

  it("emits vote start/cast/result events", async () => {
    const pattern = new ConsensusPattern();
    const emit = vi.fn();

    await pattern.execute({
      pattern: "consensus",
      participants: {
        a: "agent-a",
        b: "agent-b",
      },
      config: { rule: "majority" },
      input: {
        votes: { a: true, b: true },
      },
      emit,
    });

    expect(emit.mock.calls.map((call) => call[0].type)).toEqual([
      "consensus_vote_start",
      "consensus_vote_cast",
      "consensus_vote_cast",
      "consensus_result",
    ]);
  });

  it("validates config", () => {
    const pattern = new ConsensusPattern();

    expect(() => pattern.validateConfig({ rule: "majority" })).not.toThrow();
    expect(() => pattern.validateConfig({ timeout: "12x" })).toThrow(
      "consensus.timeout must match /^(\\d+)(ms|s|m|h)$/"
    );
    expect(() => pattern.validateConfig({ rule: "custom", custom_evaluate: "nope" as never })).toThrow(
      "consensus.custom_evaluate must be a function when provided"
    );
  });

  // ===== NEW TESTS: voter roles =====

  it("assigns voter roles from config and includes them in votes", async () => {
    const pattern = new ConsensusPattern();
    const emit = vi.fn();

    const result = await pattern.execute({
      pattern: "consensus",
      participants: {
        humanReviewer: "agent-h",
        aiAgent: "agent-ai",
        svcBot: "agent-svc",
      },
      config: {
        rule: "majority",
        voter_roles: [
          { role: "human", voters: ["humanReviewer"] },
          { role: "service", voters: ["svcBot"] },
        ],
      },
      input: {
        votes: {
          humanReviewer: true,
          aiAgent: true,
          svcBot: false,
        },
      },
      emit,
    });

    expect(result.success).toBe(true);

    // Check emitted vote_cast events include role
    const castEvents = emit.mock.calls
      .map((c) => c[0])
      .filter((e: { type: string }) => e.type === "consensus_vote_cast");
    expect(castEvents).toHaveLength(3);
    expect(castEvents.find((e: { payload: { voterId: string } }) => e.payload.voterId === "humanReviewer").payload.role).toBe("human");
    expect(castEvents.find((e: { payload: { voterId: string } }) => e.payload.voterId === "aiAgent").payload.role).toBe("ai");
    expect(castEvents.find((e: { payload: { voterId: string } }) => e.payload.voterId === "svcBot").payload.role).toBe("service");

    // Votes in output also have roles
    const votes = (result.output as { votes: Array<{ voterId: string; role: string }> }).votes;
    expect(votes.find((v) => v.voterId === "humanReviewer")?.role).toBe("human");
  });


  it("M2-03A: weighted excludes best_effort voters from verdict", async () => {
    const pattern = new ConsensusPattern();

    const result = await pattern.execute({
      pattern: "consensus",
      participants: {
        reqA: "agent-a",
        reqB: "agent-b",
        optC: "agent-c",
      },
      config: {
        rule: "weighted",
        best_effort: ["optC"],
        weights: { reqA: 2, reqB: 1, optC: 10 },
        threshold: 0.5,
      },
      input: {
        votes: {
          reqA: false,
          reqB: false,
          optC: true,
        },
      },
    });

    // optC's weight=10 approve must NOT flip the required-voters' reject
    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({ reason: "weighted threshold not met" });
  });

  it("M2-03A: score-threshold excludes best_effort voters from average", async () => {
    const pattern = new ConsensusPattern();

    const result = await pattern.execute({
      pattern: "consensus",
      participants: {
        reqA: "agent-a",
        reqB: "agent-b",
        optC: "agent-c",
      },
      config: {
        rule: "score-threshold",
        best_effort: ["optC"],
        threshold: 0.7,
      },
      input: {
        votes: {
          reqA: { score: 0.3, approved: false },
          reqB: { score: 0.4, approved: false },
          optC: { score: 1.0, approved: true },
        },
      },
    });

    // optC's score=1.0 must NOT inflate the average above threshold
    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({ reason: "score threshold not met" });
  });

  it("M2-03A: unanimous ignores best_effort rejection", async () => {
    const pattern = new ConsensusPattern();

    const result = await pattern.execute({
      pattern: "consensus",
      participants: {
        reqA: "agent-a",
        reqB: "agent-b",
        optC: "agent-c",
      },
      config: {
        rule: "unanimous",
        best_effort: ["optC"],
      },
      input: {
        votes: {
          reqA: true,
          reqB: true,
          optC: false,
        },
      },
    });

    // optC's rejection must NOT block unanimous among required voters
    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({ reason: "unanimous consensus reached" });
  });

  it("best_effort works correctly with voter roles", async () => {
    const pattern = new ConsensusPattern();

    const result = await pattern.execute({
      pattern: "consensus",
      participants: {
        human: "agent-h",
        svc: "agent-svc",
      },
      config: {
        rule: "majority",
        best_effort: ["svc"],
        voter_roles: [
          { role: "human", voters: ["human"] },
          { role: "service", voters: ["svc"] },
        ],
      },
      input: {
        votes: {
          human: true,
          // svc did not vote
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("validates voter_roles config", () => {
    const pattern = new ConsensusPattern();

    expect(() =>
      pattern.validateConfig({
        voter_roles: [{ role: "human", voters: ["a"] }],
      })
    ).not.toThrow();

    expect(() =>
      pattern.validateConfig({
        voter_roles: [{ role: "alien" as never, voters: ["a"] }],
      })
    ).toThrow('consensus.voter_roles[].role must be one of: ai, human, service');

    expect(() =>
      pattern.validateConfig({
        voter_roles: [{ role: "ai", voters: [] }],
      })
    ).toThrow('consensus.voter_roles[].voters must be a non-empty string[]');
  });

  // ===== NEW TESTS: escalation =====

  it("returns escalation result on quorum_not_met when escalation configured", async () => {
    const pattern = new ConsensusPattern();
    const emit = vi.fn();

    const result = await pattern.execute({
      pattern: "consensus",
      participants: {
        requiredA: "agent-a",
        requiredB: "agent-b",
      },
      config: {
        rule: "majority",
        escalation: {
          triggers: ["quorum_not_met"],
          target: "supervisor:fallback",
        },
      },
      input: {
        votes: {
          requiredA: true,
        },
      },
      emit,
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({
      status: "escalated",
      trigger: "quorum_not_met",
      escalation_target: "supervisor:fallback",
    });

    // Should emit consensus_escalation event
    const escalationEvent = emit.mock.calls.find((c) => c[0].type === "consensus_escalation");
    expect(escalationEvent).toBeDefined();
    expect(escalationEvent![0].payload).toMatchObject({
      trigger: "quorum_not_met",
      escalation_target: "supervisor:fallback",
    });
  });

  it("returns escalation result on timeout when escalation configured", async () => {
    const pattern = new ConsensusPattern();
    const emit = vi.fn();

    const result = await pattern.execute({
      pattern: "consensus",
      participants: {
        requiredA: "agent-a",
        requiredB: "agent-b",
      },
      config: {
        rule: "majority",
        timeout: "1s",
        escalation: {
          triggers: ["timeout"],
          target: "supervisor:timeout-handler",
        },
      },
      input: {
        startedAt: "2026-02-15T23:59:00.000Z",
        votes: {
          requiredA: true,
        },
      },
      now: () => new Date("2026-02-16T00:00:10.000Z"),
      emit,
    } as never);

    // Should NOT throw - escalation returns a result instead
    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({
      status: "escalated",
      trigger: "timeout",
      escalation_target: "supervisor:timeout-handler",
    });
  });

  it("validates escalation config", () => {
    const pattern = new ConsensusPattern();

    expect(() =>
      pattern.validateConfig({
        escalation: { triggers: ["timeout"] },
      })
    ).not.toThrow();

    expect(() =>
      pattern.validateConfig({
        escalation: { triggers: [] },
      })
    ).toThrow("consensus.escalation.triggers must be a non-empty array");

    expect(() =>
      pattern.validateConfig({
        escalation: { triggers: ["invalid" as never] },
      })
    ).toThrow("consensus.escalation.triggers must be one of: timeout, quorum_not_met");
  });

  // ===== NEW TEST: custom rule execution =====

  it("executes custom_evaluate with full context including roles", async () => {
    const pattern = new ConsensusPattern();
    const customEval = vi.fn().mockReturnValue({
      approved: true,
      reason: "custom logic passed",
      score: 0.95,
    });

    const result = await pattern.execute({
      pattern: "consensus",
      participants: {
        human: "agent-h",
        ai: "agent-ai",
      },
      config: {
        rule: "custom",
        custom_evaluate: customEval,
        voter_roles: [{ role: "human", voters: ["human"] }],
      },
      input: {
        votes: {
          human: { approved: true, score: 0.9 },
          ai: { approved: true, score: 1.0 },
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      status: "consensus-reached",
      reason: "custom logic passed",
      score: 0.95,
    });

    // Verify the evaluator received votes with roles
    expect(customEval).toHaveBeenCalledTimes(1);
    const evalContext = customEval.mock.calls[0][0];
    expect(evalContext.votes.find((v: { voterId: string }) => v.voterId === "human").role).toBe("human");
    expect(evalContext.votes.find((v: { voterId: string }) => v.voterId === "ai").role).toBe("ai");
  });

  // ===== NEW TEST: VotingSessionStore tally in metadata =====

  it("includes store_tally in metadata for successful verdict", async () => {
    const pattern = new ConsensusPattern();

    const result = await pattern.execute({
      pattern: "consensus",
      participants: {
        a: "agent-a",
        b: "agent-b",
      },
      config: { rule: "majority" },
      input: {
        votes: { a: true, b: true },
      },
    });

    expect(result.success).toBe(true);
    const meta = result.metadata as Record<string, unknown>;
    expect(meta.store_tally).toBeDefined();
    const tally = meta.store_tally as { totalVotes: number; approves: number; quorumMet: boolean };
    expect(tally.totalVotes).toBe(2);
    expect(tally.approves).toBe(2);
    expect(tally.quorumMet).toBe(true);
  });
});

describe("M2-03B: score clamp policy", () => {
  const pattern = new ConsensusPattern();

  it("clamps out-of-range scores in score-threshold", async () => {
    const events: unknown[] = [];
    const result = await pattern.execute({
      stepName: "clamp-test",
      participants: { v1: {}, v2: {} },
      config: {
        rule: "score-threshold",
        threshold: 0.5,
      },
      input: {
        votes: { v1: { score: 5.0, approved: true }, v2: { score: -2.0, approved: false } },
      },
      emit: async (event: unknown) => { events.push(event); },
    });

    // Average of clamped scores: (1.0 + 0.0) / 2 = 0.5 >= 0.5 → pass
    expect(result.success).toBe(true);
    expect(result.output.score).toBe(0.5);
  });

  it("rejects threshold > 1 in validateConfig", () => {
    expect(() => pattern.validateConfig({ threshold: 1.5 })).toThrow(
      "consensus.threshold must be a finite number in [0, 1]"
    );
  });

  it("accepts threshold = 1 in validateConfig", () => {
    expect(() => pattern.validateConfig({ threshold: 1.0 })).not.toThrow();
  });

  it("clamps numeric vote value", async () => {
    const result = await pattern.execute({
      stepName: "clamp-numeric",
      participants: { v1: {} },
      config: {
        rule: "score-threshold",
        threshold: 0.8,
      },
      input: {
        votes: { v1: 999 },
      },
      emit: async () => {},
    });

    // Clamped to 1.0 >= 0.8 → pass
    expect(result.success).toBe(true);
    expect(result.output.score).toBe(1);
  });
});
