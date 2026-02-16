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

  it("supports custom convergence function", async () => {
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
      } as never,
      input: {
        rounds: [{ a: "x", b: "y" }],
      },
    });

    expect(customConvergence).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });
});
