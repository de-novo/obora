import { describe, expect, it, vi } from "vitest";

import { DiscussionPattern } from "./DiscussionPattern.js";

describe("DiscussionPattern", () => {
  it("runs round-based discussion and converges by majority", async () => {
    const pattern = new DiscussionPattern();
    const events: string[] = [];

    const result = await pattern.execute({
      pattern: "discussion",
      stepName: "architecture-decision",
      participants: {
        architect: "agent-a",
        reviewerA: "agent-b",
        reviewerB: "agent-c",
      },
      config: {
        max_rounds: 3,
        convergence: "majority",
      },
      input: {
        topic: "Runtime architecture",
        rounds: [
          {
            architect: "option-a",
            reviewerA: "option-a",
            reviewerB: "option-b",
          },
        ],
      },
      emit: (event) => {
        events.push(event.type);
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      status: "consensus-reached",
      decision: "option-a",
    });
    expect(result.metadata?.converged).toBe(true);
    expect(result.metadata?.rounds).toBe(1);
    expect(result.metadata?.blackboard_domains).toEqual(["agenda", "meeting-state-machine", "message-bus"]);
    expect(events).toEqual(["discussion_round_start", "discussion_round_end"]);
  });

  it("fails when max rounds are reached with fail deadlock strategy", async () => {
    const pattern = new DiscussionPattern();

    const result = await pattern.execute({
      pattern: "discussion",
      participants: {
        a: "agent-a",
        b: "agent-b",
      },
      config: {
        max_rounds: 2,
        convergence: "unanimous",
        on_deadlock: "fail",
      },
      input: {
        rounds: [
          { a: "x", b: "y" },
          { a: "x", b: "y" },
        ],
      },
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({
      status: "failed",
      reason: "max_rounds_reached",
    });
    expect(result.metadata?.on_deadlock).toBe("fail");
  });

  it("escalates when max rounds are reached with escalate strategy", async () => {
    const pattern = new DiscussionPattern();
    const emit = vi.fn();

    const result = await pattern.execute({
      pattern: "discussion",
      participants: {
        a: "agent-a",
        b: "agent-b",
      },
      config: {
        max_rounds: 1,
        convergence: "no_disagreements",
        on_deadlock: "escalate",
      },
      input: {
        rounds: [{ a: "x", b: "y" }],
      },
      emit,
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({
      status: "escalated",
      reason: "max_rounds_reached",
    });
    expect(emit.mock.calls.map((call) => call[0].type)).toEqual(["discussion_round_start", "discussion_round_end"]);
    expect(emit.mock.calls[1]?.[0]?.payload).toMatchObject({ converged: false });
  });

  it("validates config", () => {
    const pattern = new DiscussionPattern();

    expect(() => pattern.validateConfig({ max_rounds: 0 })).toThrow("discussion.max_rounds must be an integer >= 1");
    expect(() => pattern.validateConfig({ convergence: "majority" })).not.toThrow();
    expect(() => pattern.validateConfig({ on_deadlock: "fail" })).not.toThrow();
    expect(() => pattern.validateConfig({ convergence: "invalid" as never })).toThrow(
      "discussion.convergence must be one of: no_disagreements, majority, unanimous, custom"
    );
  });

  it("supports custom convergence function (typed)", async () => {
    const pattern = new DiscussionPattern();
    const customConvergence = vi.fn(() => true);

    const result = await pattern.execute({
      pattern: "discussion",
      participants: {
        a: "agent-a",
        b: "agent-b",
      },
      config: {
        max_rounds: 2,
        convergence: "custom",
        custom_convergence: customConvergence,
      },
      input: {
        rounds: [{ a: "x", b: "y" }],
      },
    });

    expect(customConvergence).toHaveBeenCalledTimes(1);
    expect(customConvergence).toHaveBeenCalledWith({
      round: 1,
      opinions: { a: "x", b: "y" },
      participants: ["a", "b"],
    });
    expect(result.success).toBe(true);
  });

  it("uses fallback topic/opinions and records custom non-convergence", async () => {
    const pattern = new DiscussionPattern();
    const customConvergence = vi.fn(() => false);

    const result = await pattern.execute({
      pattern: "discussion",
      stepName: "Fallback Discussion",
      participants: {
        a: "agent-a",
        b: "agent-b",
      },
      config: {
        max_rounds: 1,
        convergence: "custom",
        custom_convergence: customConvergence,
        on_deadlock: "fail",
      },
      input: "not-an-object",
    } as never);

    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({
      topic: "Fallback Discussion",
      status: "failed",
      rounds: [
        {
          opinions: { a: "a", b: "b" },
          converged: false,
        },
      ],
    });
    expect(customConvergence).toHaveBeenCalledWith({
      round: 1,
      opinions: { a: "a", b: "b" },
      participants: ["a", "b"],
    });
  });

  // --- retry path tests ---

  it("on_deadlock=retry runs extra retry rounds (default budget=1)", async () => {
    const pattern = new DiscussionPattern();
    const emit = vi.fn();

    const result = await pattern.execute({
      pattern: "discussion",
      participants: { a: "agent-a", b: "agent-b" },
      config: {
        max_rounds: 2,
        convergence: "unanimous",
        on_deadlock: "retry",
      },
      input: {
        rounds: [
          { a: "x", b: "y" },
          { a: "x", b: "y" },
          { a: "x", b: "y" }, // retry round
        ],
      },
      emit,
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({
      status: "failed",
      reason: "max_rounds_reached",
    });
    // 2 base + 1 retry = 3 total rounds
    expect(result.metadata?.rounds).toBe(3);
    expect(result.metadata?.retry_budget).toBe(1);
    expect(result.metadata?.retry_rounds_used).toBe(1);
  });

  it("on_deadlock=retry converges during retry round", async () => {
    const pattern = new DiscussionPattern();

    const result = await pattern.execute({
      pattern: "discussion",
      participants: { a: "agent-a", b: "agent-b" },
      config: {
        max_rounds: 1,
        convergence: "unanimous",
        on_deadlock: "retry",
      },
      input: {
        rounds: [
          { a: "x", b: "y" }, // base round - no convergence
          { a: "x", b: "x" }, // retry round - converges
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      status: "consensus-reached",
      decision: "x",
    });
    expect(result.metadata?.rounds).toBe(2);
  });

  it("on_deadlock=retry with custom retry_budget", async () => {
    const pattern = new DiscussionPattern();

    const result = await pattern.execute({
      pattern: "discussion",
      participants: { a: "agent-a", b: "agent-b" },
      config: {
        max_rounds: 1,
        convergence: "unanimous",
        on_deadlock: "retry",
        retry_budget: 3,
      },
      input: {
        rounds: [
          { a: "x", b: "y" },
          { a: "x", b: "y" },
          { a: "x", b: "y" },
          { a: "x", b: "y" }, // all 4 rounds exhausted
        ],
      },
    });

    expect(result.success).toBe(false);
    expect(result.metadata?.rounds).toBe(4); // 1 base + 3 retry
    expect(result.metadata?.retry_budget).toBe(3);
    expect(result.metadata?.retry_rounds_used).toBe(3);
  });

  // --- config validation edge cases ---

  it("validates max_rounds rejects non-integer", () => {
    const pattern = new DiscussionPattern();
    expect(() => pattern.validateConfig({ max_rounds: 1.5 })).toThrow("discussion.max_rounds must be an integer >= 1");
    expect(() => pattern.validateConfig({ max_rounds: -1 })).toThrow("discussion.max_rounds must be an integer >= 1");
  });

  it("validates retry_budget", () => {
    const pattern = new DiscussionPattern();
    expect(() => pattern.validateConfig({ retry_budget: 0 })).toThrow("discussion.retry_budget must be an integer >= 1");
    expect(() => pattern.validateConfig({ retry_budget: 1.5 })).toThrow("discussion.retry_budget must be an integer >= 1");
    expect(() => pattern.validateConfig({ retry_budget: 2, on_deadlock: "fail" })).toThrow(
      'discussion.retry_budget is only valid when on_deadlock="retry"'
    );
    // valid: retry_budget with on_deadlock=retry
    expect(() => pattern.validateConfig({ retry_budget: 2, on_deadlock: "retry" })).not.toThrow();
    // retry_budget without on_deadlock="retry" must fail
    expect(() => pattern.validateConfig({ retry_budget: 2 })).toThrow(
      'discussion.retry_budget is only valid when on_deadlock="retry"'
    );
  });

  it("validates on_deadlock rejects unknown values", () => {
    const pattern = new DiscussionPattern();
    expect(() => pattern.validateConfig({ on_deadlock: "unknown" as never })).toThrow(
      "discussion.on_deadlock must be one of: escalate, retry, fail"
    );
  });

  it("validates custom_convergence must be a function when convergence=custom", () => {
    const pattern = new DiscussionPattern();
    expect(() =>
      pattern.validateConfig({
        convergence: "custom",
        custom_convergence: "not-a-function" as never,
      })
    ).toThrow("discussion.custom_convergence must be a function");

    // convergence=custom without custom_convergence must fail at validation
    expect(() =>
      pattern.validateConfig({
        convergence: "custom",
      })
    ).toThrow("discussion.convergence='custom' requires custom_convergence function");  });

  it("throws at runtime when convergence=custom but no function provided", async () => {
    const pattern = new DiscussionPattern();

    await expect(
      pattern.execute({
        pattern: "discussion",
        participants: { a: "agent-a" },
        config: {
          convergence: "custom",
        },
      })
    ).rejects.toThrow("discussion.convergence='custom' requires custom_convergence function");
  });

  it("throws when no participants provided", async () => {
    const pattern = new DiscussionPattern();

    await expect(
      pattern.execute({
        pattern: "discussion",
        participants: {},
        config: {},
      })
    ).rejects.toThrow("discussion pattern requires at least one participant");
  });
});
