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

  it("throws timeout code when required voters are missing after timeout", async () => {
    const pattern = new ConsensusPattern();

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
      } as never)
    ).rejects.toMatchObject({ code: OboraErrorCode.CONSENSUS_TIMEOUT });
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
});
