import { describe, expect, it, vi } from "vitest";

import { BrainstormPattern } from "./BrainstormPattern.js";

describe("BrainstormPattern", () => {
  it("runs generate + evaluate pipeline and returns knowledge domain output", async () => {
    const pattern = new BrainstormPattern();

    const result = await pattern.execute({
      pattern: "brainstorming",
      participants: {
        a: "agent-a",
        b: "agent-b",
      },
      config: {
        phase_1: "generate",
        phase_2: "evaluate",
      },
      input: {
        topic: "Growth ideas",
        ideas: {
          a: ["Launch referral program", "Improve onboarding"],
          b: ["Improve onboarding", "Partnership campaign"],
        },
        evaluations: {
          a: {
            "Launch referral program": 0.9,
            "Improve onboarding": 0.7,
            "Partnership campaign": 0.8,
          },
          b: {
            "Launch referral program": 0.8,
            "Improve onboarding": 0.9,
            "Partnership campaign": 0.7,
          },
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      domain: "knowledge",
      brainstorming: {
        topic: "Growth ideas",
      },
    });
    expect(result.metadata?.blackboard_domains).toEqual(["knowledge"]);
  });

  it("uses exact dedup by default", async () => {
    const pattern = new BrainstormPattern();

    const result = await pattern.execute({
      pattern: "brainstorming",
      participants: {
        a: "agent-a",
        b: "agent-b",
      },
      input: {
        ideas: {
          a: ["A", "B"],
          b: ["A", "C"],
        },
        evaluations: {
          a: { A: 1, B: 0.5, C: 0.3 },
          b: { A: 0.9, B: 0.2, C: 0.7 },
        },
      },
    });

    const brainstorming = (result.output as { brainstorming: { deduped: Array<{ text: string }> } }).brainstorming;
    expect(brainstorming.deduped.map((idea) => idea.text)).toEqual(["A", "B", "C"]);
  });

  it("supports semantic dedup via injected callback", async () => {
    const pattern = new BrainstormPattern();
    const semanticDedup = vi.fn((ideas: Array<{ text: string }>) =>
      ideas.filter((idea, index) => index === 0 || idea.text !== "Launch referral campaign")
    );

    const result = await pattern.execute({
      pattern: "brainstorming",
      participants: {
        a: "agent-a",
        b: "agent-b",
      },
      config: {
        dedup: "semantic",
      },
      input: {
        ideas: {
          a: ["Launch referral program"],
          b: ["Launch referral campaign"],
        },
        evaluations: {
          a: {
            "Launch referral program": 0.8,
          },
          b: {
            "Launch referral program": 0.9,
          },
        },
      },
      brainstormSemanticDedup: semanticDedup,
    } as never);

    const brainstorming = (result.output as { brainstorming: { deduped: Array<{ text: string }> } }).brainstorming;
    expect(semanticDedup).toHaveBeenCalledTimes(1);
    expect(brainstorming.deduped.map((idea) => idea.text)).toEqual(["Launch referral program"]);
  });

  it("applies top_n selection", async () => {
    const pattern = new BrainstormPattern();

    const result = await pattern.execute({
      pattern: "brainstorming",
      participants: {
        a: "agent-a",
        b: "agent-b",
      },
      config: {
        top_n: 2,
      },
      input: {
        ideas: {
          a: ["A", "B"],
          b: ["C"],
        },
        evaluations: {
          a: { A: 0.9, B: 0.5, C: 0.7 },
          b: { A: 0.8, B: 0.4, C: 0.6 },
        },
      },
    });

    const brainstorming = (result.output as { brainstorming: { selected: Array<{ text: string }> } }).brainstorming;
    expect(brainstorming.selected).toHaveLength(2);
    expect(brainstorming.selected.map((idea) => idea.text)).toEqual(["A", "C"]);
  });

  it("emits generate/evaluate start-end events", async () => {
    const pattern = new BrainstormPattern();
    const emit = vi.fn();

    await pattern.execute({
      pattern: "brainstorming",
      participants: {
        a: "agent-a",
      },
      input: {
        ideas: {
          a: ["A"],
        },
      },
      emit,
    });

    expect(emit.mock.calls.map((call) => call[0].type)).toEqual([
      "brainstorm_generate_start",
      "brainstorm_generate_end",
      "brainstorm_evaluate_start",
      "brainstorm_evaluate_end",
    ]);
  });

  it("uses fallback input and stepName topic when ideas are absent", async () => {
    const pattern = new BrainstormPattern();

    const result = await pattern.execute({
      pattern: "brainstorming",
      stepName: "Fallback Topic",
      participants: {
        a: "agent-a",
      },
      input: "not-an-object",
    } as never);

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      brainstorming: {
        topic: "Fallback Topic",
        generated: [],
        selected: [],
      },
    });
  });

  it("supports injected generation and ranking hooks", async () => {
    const pattern = new BrainstormPattern();
    const generator = vi.fn((participant: string) => [`${participant}-idea`, "shared"]);
    const ranker = vi.fn((ideas: Array<{ id: string; text: string; generated_by: string }>) =>
      ideas.map((idea) => ({ ...idea, score: idea.text === "b-idea" ? 2 : 1 }))
    );

    const result = await pattern.execute({
      pattern: "brainstorming",
      participants: {
        a: "agent-a",
        b: "agent-b",
      },
      config: {
        dedup: "semantic",
      },
      brainstormGenerateIdeas: generator,
      brainstormRankIdeas: ranker,
    } as never);

    expect(generator).toHaveBeenCalledTimes(2);
    expect(ranker).toHaveBeenCalledTimes(1);
    const selected = (result.output as { brainstorming: { selected: Array<{ text: string; rank: number }> } })
      .brainstorming.selected;
    expect(selected[0]).toMatchObject({ text: "b-idea", rank: 1 });
  });

  it("validates config", () => {
    const pattern = new BrainstormPattern();

    expect(() => pattern.validateConfig({ phase_1: "generate" })).not.toThrow();
    expect(() => pattern.validateConfig({ phase_1: "evaluate" as never })).toThrow(
      "brainstorming.phase_1 must be 'generate'"
    );
    expect(() => pattern.validateConfig({ phase_2: "generate" as never })).toThrow(
      "brainstorming.phase_2 must be 'evaluate'"
    );
    expect(() => pattern.validateConfig({ top_n: 0 })).toThrow("brainstorming.top_n must be an integer >= 1");
    expect(() => pattern.validateConfig({ dedup: "fuzzy" as never })).toThrow(
      "brainstorming.dedup must be one of: exact, semantic"
    );
  });
});
