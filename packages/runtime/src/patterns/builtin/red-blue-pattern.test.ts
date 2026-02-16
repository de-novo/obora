import { describe, expect, it, vi } from "vitest";

import { OboraErrorCode } from "../../errors/OboraErrorCode.js";
import { RedBluePattern } from "./RedBluePattern.js";

describe("RedBluePattern", () => {
  it("runs basic round execution", async () => {
    const pattern = new RedBluePattern();

    const result = await pattern.execute({
      pattern: "red-blue",
      participants: {
        red1: "agent-a",
        blue1: "agent-b",
      },
      config: {
        red_team: ["red1"],
        blue_team: ["blue1"],
        max_rounds: 1,
        convergence: "max_rounds",
      },
      input: {
        rounds: [
          {
            red_findings: { sql_injection: true },
            blue_responses: { sql_injection: "patched" },
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      converged: true,
      convergence_round: 1,
      rounds: [
        {
          round: 1,
          red_team: ["red1"],
          blue_team: ["blue1"],
          red_findings: { sql_injection: true },
          blue_responses: { sql_injection: "patched" },
        },
      ],
    });
  });

  it("converges for red_finds_nothing when findings are empty", async () => {
    const pattern = new RedBluePattern();

    const result = await pattern.execute({
      pattern: "red-blue",
      participants: {
        red1: "agent-a",
        blue1: "agent-b",
      },
      config: {
        red_team: ["red1"],
        blue_team: ["blue1"],
        max_rounds: 3,
        convergence: "red_finds_nothing",
      },
      input: {
        rounds: [
          { red_findings: { xss: true }, blue_responses: { xss: "sanitize" } },
          { red_findings: {}, blue_responses: { status: "stable" } },
          { red_findings: { should_not_run: true } },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      converged: true,
      convergence_round: 2,
    });
    const rounds = (result.output as { rounds: Array<{ round: number }> }).rounds;
    expect(rounds).toHaveLength(2);
  });

  it("runs all rounds for max_rounds convergence mode", async () => {
    const pattern = new RedBluePattern();

    const result = await pattern.execute({
      pattern: "red-blue",
      participants: {
        red1: "agent-a",
        blue1: "agent-b",
      },
      config: {
        red_team: ["red1"],
        blue_team: ["blue1"],
        max_rounds: 2,
        convergence: "max_rounds",
      },
      input: {
        rounds: [{ red_findings: { a: 1 } }, { red_findings: { b: 2 } }],
      },
    });

    expect(result.success).toBe(true);
    expect((result.output as { rounds: unknown[] }).rounds).toHaveLength(2);
    expect(result.output).toMatchObject({
      converged: true,
      convergence_round: 2,
    });
  });

  it("supports custom convergence function", async () => {
    const pattern = new RedBluePattern();

    const result = await pattern.execute({
      pattern: "red-blue",
      participants: {
        red1: "agent-a",
        blue1: "agent-b",
      },
      config: {
        red_team: ["red1"],
        blue_team: ["blue1"],
        max_rounds: 3,
        convergence: "custom",
      },
      input: {
        rounds: [{ red_findings: { a: 1 } }, { red_findings: { b: 2 } }, { red_findings: { c: 3 } }],
      },
      redBlueConvergenceFn: ({ round }: { round: number }) => round >= 2,
    } as never);

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      converged: true,
      convergence_round: 2,
    });
  });

  it("fails when max_rounds exhausted without convergence in red_finds_nothing mode", async () => {
    const pattern = new RedBluePattern();

    const result = await pattern.execute({
      pattern: "red-blue",
      participants: {
        red1: "agent-a",
        blue1: "agent-b",
      },
      config: {
        red_team: ["red1"],
        blue_team: ["blue1"],
        max_rounds: 2,
        convergence: "red_finds_nothing",
      },
      input: {
        rounds: [{ red_findings: { a: 1 } }, { red_findings: { b: 2 } }],
      },
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({
      reason: "convergence_not_reached",
      error_codes: [OboraErrorCode.ORCH_DEPENDENCY_FAILED],
      converged: false,
    });
  });

  it("validates config", () => {
    const pattern = new RedBluePattern();

    expect(() => pattern.validateConfig({ max_rounds: 1 })).not.toThrow();
    expect(() => pattern.validateConfig({ max_rounds: 0 })).toThrow("red-blue.max_rounds must be an integer >= 1");
    expect(() => pattern.validateConfig({ convergence: "invalid" as never })).toThrow(
      "red-blue.convergence must be one of: red_finds_nothing, max_rounds, custom"
    );
  });

  it("throws when participants are empty", async () => {
    const pattern = new RedBluePattern();

    await expect(
      pattern.execute({
        pattern: "red-blue",
        participants: {},
      })
    ).rejects.toThrow("red-blue pattern requires at least one participant");
  });

  it("emits round start/end events", async () => {
    const pattern = new RedBluePattern();
    const emit = vi.fn();

    await pattern.execute({
      pattern: "red-blue",
      participants: {
        red1: "agent-a",
        blue1: "agent-b",
      },
      config: {
        red_team: ["red1"],
        blue_team: ["blue1"],
        max_rounds: 1,
      },
      input: {
        rounds: [{ red_findings: { a: 1 }, blue_responses: { a: "fixed" } }],
      },
      emit,
    });

    expect(emit.mock.calls.map((call) => call[0].type)).toEqual(["red_blue_round_start", "red_blue_round_end"]);
  });

  it("auto-splits red/blue teams when config is not provided", async () => {
    const pattern = new RedBluePattern();

    const result = await pattern.execute({
      pattern: "red-blue",
      participants: {
        p1: "agent-1",
        p2: "agent-2",
        p3: "agent-3",
        p4: "agent-4",
      },
      config: {
        max_rounds: 1,
      },
      input: {
        rounds: [{ red_findings: {} }],
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      rounds: [
        {
          red_team: ["p1", "p2"],
          blue_team: ["p3", "p4"],
        },
      ],
    });
  });

  it("throws when a participant is included in both red and blue teams", async () => {
    const pattern = new RedBluePattern();

    await expect(
      pattern.execute({
        pattern: "red-blue",
        participants: {
          p1: "agent-1",
          p2: "agent-2",
          p3: "agent-3",
        },
        config: {
          red_team: ["p1", "p2"],
          blue_team: ["p2", "p3"],
        },
      })
    ).rejects.toThrow("red-blue: participants cannot be on both teams: p2");
  });
});
