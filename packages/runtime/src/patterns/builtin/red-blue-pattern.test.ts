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
        custom_convergence: ({ round }: { round: number }) => round >= 2,
      },
      input: {
        rounds: [{ red_findings: { a: 1 } }, { red_findings: { b: 2 } }, { red_findings: { c: 3 } }],
      },
    });

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
    expect(() => pattern.validateConfig({ convergence: "custom" })).toThrow(
      "red-blue: convergence='custom' requires a custom_convergence function"
    );
    expect(() =>
      pattern.validateConfig({ convergence: "custom", custom_convergence: () => true })
    ).not.toThrow();
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

  it("uses default config, fallback input, and empty round records", async () => {
    const pattern = new RedBluePattern();

    const result = await pattern.execute({
      pattern: "red-blue",
      participants: {
        p1: "agent-1",
        p2: "agent-2",
      },
      input: "not-an-object",
    } as never);

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      converged: true,
      convergence_round: 1,
      rounds: [
        {
          red_team: ["p1"],
          blue_team: ["p2"],
          red_findings: {},
          blue_responses: {},
        },
      ],
    });
  });

  it("rejects incomplete, unknown, and auto-split team definitions", async () => {
    const pattern = new RedBluePattern();

    await expect(
      pattern.execute({
        pattern: "red-blue",
        participants: { solo: "agent-1" },
      })
    ).rejects.toThrow("red-blue pattern requires at least two participants for automatic team split");

    await expect(
      pattern.execute({
        pattern: "red-blue",
        participants: { p1: "agent-1", p2: "agent-2" },
        config: {
          red_team: ["p1"],
        },
      })
    ).rejects.toThrow("red-blue.red_team and red-blue.blue_team must each contain at least one participant");

    await expect(
      pattern.execute({
        pattern: "red-blue",
        participants: { p1: "agent-1", p2: "agent-2" },
        config: {
          red_team: [" p1 ", "p1"],
          blue_team: ["missing"],
        },
      })
    ).rejects.toThrow("red-blue.blue_team contains unknown participant ids: missing");
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

  it("throws when convergence='custom' but no custom_convergence fn provided", async () => {
    const pattern = new RedBluePattern();

    await expect(
      pattern.execute({
        pattern: "red-blue",
        participants: { red1: "a", blue1: "b" },
        config: {
          red_team: ["red1"],
          blue_team: ["blue1"],
          convergence: "custom",
        },
      })
    ).rejects.toThrow("red-blue: convergence='custom' requires a custom_convergence function");
  });

  it("round outputs include stable round_id artifact identifiers", async () => {
    const pattern = new RedBluePattern();

    const result = await pattern.execute({
      pattern: "red-blue",
      participants: { red1: "a", blue1: "b" },
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
    const rounds = (result.output as { rounds: Array<{ round_id: string }> }).rounds;
    expect(rounds).toHaveLength(2);
    // Each round has a UUID round_id
    for (const r of rounds) {
      expect(r.round_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
    // round_ids are unique
    expect(new Set(rounds.map((r) => r.round_id)).size).toBe(2);
    // metadata also includes round_ids
    const meta = result.metadata as { round_ids: string[] };
    expect(meta.round_ids).toEqual(rounds.map((r) => r.round_id));
  });

  it("emits escalation event when max_rounds exhausted with escalation config", async () => {
    const pattern = new RedBluePattern();
    const emit = vi.fn();

    const result = await pattern.execute({
      pattern: "red-blue",
      participants: { red1: "a", blue1: "b" },
      config: {
        red_team: ["red1"],
        blue_team: ["blue1"],
        max_rounds: 2,
        convergence: "red_finds_nothing",
        escalation: {
          triggers: ["max_rounds_exhausted"],
          target: "supervisor-agent",
        },
      },
      input: {
        rounds: [{ red_findings: { a: 1 } }, { red_findings: { b: 2 } }],
      },
      emit,
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({
      reason: "convergence_not_reached",
      escalated: true,
      escalation_target: "supervisor-agent",
    });
    expect(result.metadata).toMatchObject({
      escalated: true,
      escalation_target: "supervisor-agent",
    });

    // Escalation event emitted
    const escalationEvent = emit.mock.calls.find((c) => c[0].type === "red_blue_escalation");
    expect(escalationEvent).toBeDefined();
    expect(escalationEvent![0].payload).toMatchObject({
      trigger: "max_rounds_exhausted",
      target: "supervisor-agent",
      rounds_completed: 2,
      max_rounds: 2,
    });
    // round_ids in escalation payload
    expect(escalationEvent![0].payload.round_ids).toHaveLength(2);
  });

  it("does not escalate when no escalation config present on failure", async () => {
    const pattern = new RedBluePattern();
    const emit = vi.fn();

    const result = await pattern.execute({
      pattern: "red-blue",
      participants: { red1: "a", blue1: "b" },
      config: {
        red_team: ["red1"],
        blue_team: ["blue1"],
        max_rounds: 1,
        convergence: "red_finds_nothing",
      },
      input: {
        rounds: [{ red_findings: { a: 1 } }],
      },
      emit,
    });

    expect(result.success).toBe(false);
    expect((result.output as Record<string, unknown>).escalated).toBeUndefined();
    const escalationEvent = emit.mock.calls.find((c) => c[0].type === "red_blue_escalation");
    expect(escalationEvent).toBeUndefined();
  });
});
