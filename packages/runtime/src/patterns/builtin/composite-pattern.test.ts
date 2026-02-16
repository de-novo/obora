import { describe, expect, it, vi } from "vitest";

import { BrainstormPattern } from "./BrainstormPattern.js";
import { CompositePattern } from "./CompositePattern.js";
import { ConsensusPattern } from "./ConsensusPattern.js";
import { DiscussionPattern } from "./DiscussionPattern.js";
import { PatternRegistry } from "../PatternRegistry.js";
import { CollaborationPatternBase, type PatternPayloadResult, type PatternRuntimeContext } from "../types.js";

class EchoPattern extends CollaborationPatternBase {
  readonly name = "echo";
  readonly kind = "echo" as const;

  protected async onExecute(context: PatternRuntimeContext): Promise<PatternPayloadResult> {
    return {
      success: true,
      output: context.input,
    };
  }
}

class AppendPattern extends CollaborationPatternBase {
  readonly name = "append";
  readonly kind = "append" as const;

  protected async onExecute(context: PatternRuntimeContext): Promise<PatternPayloadResult> {
    const suffix = (context.config as { suffix?: string } | undefined)?.suffix ?? "";

    return {
      success: true,
      output: `${String(context.input ?? "")}${suffix}`,
    };
  }
}

class FailingPattern extends CollaborationPatternBase {
  readonly name = "failer";
  readonly kind = "failer" as const;

  protected async onExecute(): Promise<PatternPayloadResult> {
    return {
      success: false,
      output: { reason: "failed" },
    };
  }
}

class ThrowingPattern extends CollaborationPatternBase {
  readonly name = "thrower";
  readonly kind = "thrower" as const;

  protected async onExecute(): Promise<PatternPayloadResult> {
    throw new Error("boom");
  }
}

function createRegistry(): PatternRegistry {
  const registry = new PatternRegistry();
  registry.register(new EchoPattern());
  registry.register(new AppendPattern());
  registry.register(new FailingPattern());
  registry.register(new ThrowingPattern());
  return registry;
}

describe("CompositePattern", () => {
  it("executes stages sequentially", async () => {
    const registry = createRegistry();
    const pattern = new CompositePattern(registry);

    const result = await pattern.execute({
      pattern: "composite",
      input: "A",
      config: {
        stages: [
          { name: "s1", pattern: "append", config: { suffix: "B" } },
          { name: "s2", pattern: "append", config: { suffix: "C" } },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({
      stages: [
        { name: "s1", pattern: "append", success: true, output: "AB" },
        { name: "s2", pattern: "append", success: true, output: "ABC" },
      ],
      completed_stages: 2,
    });
  });

  it("chains inputs with input_from: previous by default", async () => {
    const registry = createRegistry();
    const pattern = new CompositePattern(registry);

    const result = await pattern.execute({
      pattern: "composite",
      input: "seed",
      config: {
        stages: [
          { name: "first", pattern: "append", config: { suffix: "-1" } },
          { name: "second", pattern: "append", config: { suffix: "-2" } },
          { name: "third", pattern: "append", config: { suffix: "-3" } },
        ],
      },
    });

    const outputs = (result.output as { stages: Array<{ output: string }> }).stages.map((stage) => stage.output);
    expect(outputs).toEqual(["seed-1", "seed-1-2", "seed-1-2-3"]);
  });

  it("uses root input with input_from: root", async () => {
    const registry = createRegistry();
    const pattern = new CompositePattern(registry);

    const result = await pattern.execute({
      pattern: "composite",
      input: "root",
      config: {
        stages: [
          { name: "s1", pattern: "append", config: { suffix: "-a" } },
          { name: "s2", pattern: "append", input_from: "root", config: { suffix: "-b" } },
        ],
      },
    });

    expect(result.output).toEqual({
      stages: [
        { name: "s1", pattern: "append", success: true, output: "root-a" },
        { name: "s2", pattern: "append", success: true, output: "root-b" },
      ],
      completed_stages: 2,
    });
  });

  it("uses named stage output with input_from: <stage_name>", async () => {
    const registry = createRegistry();
    const pattern = new CompositePattern(registry);

    const result = await pattern.execute({
      pattern: "composite",
      input: "x",
      config: {
        stages: [
          { name: "base", pattern: "append", config: { suffix: "-base" } },
          { name: "branch", pattern: "append", input_from: "base", config: { suffix: "-branch" } },
          { name: "continue", pattern: "append", config: { suffix: "-continue" } },
        ],
      },
    });

    expect(result.output).toEqual({
      stages: [
        { name: "base", pattern: "append", success: true, output: "x-base" },
        { name: "branch", pattern: "append", success: true, output: "x-base-branch" },
        { name: "continue", pattern: "append", success: true, output: "x-base-branch-continue" },
      ],
      completed_stages: 3,
    });
  });

  it("stops on stage failure with on_stage_failure: fail", async () => {
    const registry = createRegistry();
    const pattern = new CompositePattern(registry);

    const result = await pattern.execute({
      pattern: "composite",
      input: "x",
      config: {
        on_stage_failure: "fail",
        stages: [
          { name: "ok", pattern: "append", config: { suffix: "-ok" } },
          { name: "bad", pattern: "failer" },
          { name: "after", pattern: "append", config: { suffix: "-after" } },
        ],
      },
    });

    expect(result.success).toBe(false);
    expect(result.output).toEqual({
      stages: [
        { name: "ok", pattern: "append", success: true, output: "x-ok" },
        { name: "bad", pattern: "failer", success: false, output: { reason: "failed" } },
      ],
      completed_stages: 2,
    });
  });

  it("continues on stage failure with on_stage_failure: skip", async () => {
    const registry = createRegistry();
    const pattern = new CompositePattern(registry);

    const result = await pattern.execute({
      pattern: "composite",
      input: "x",
      config: {
        on_stage_failure: "skip",
        stages: [
          { name: "ok", pattern: "append", config: { suffix: "-ok" } },
          { name: "bad", pattern: "failer" },
          { name: "after", pattern: "append", config: { suffix: "-after" } },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({
      stages: [
        { name: "ok", pattern: "append", success: true, output: "x-ok" },
        { name: "bad", pattern: "failer", success: false, output: { reason: "failed" } },
        { name: "after", pattern: "append", success: true, output: "[object Object]-after" },
      ],
      completed_stages: 3,
    });
  });

  it("throws on stage failure with on_stage_failure: escalate", async () => {
    const registry = createRegistry();
    const pattern = new CompositePattern(registry);

    await expect(
      pattern.execute({
        pattern: "composite",
        config: {
          on_stage_failure: "escalate",
          stages: [
            { name: "ok", pattern: "echo" },
            { name: "bad", pattern: "failer" },
          ],
        },
      })
    ).rejects.toThrow("composite stage 'bad' failed");
  });

  it("composes real builtin patterns (brainstorm -> discussion -> consensus)", async () => {
    const registry = new PatternRegistry();
    registry.register(new BrainstormPattern());
    registry.register(new DiscussionPattern());
    registry.register(new ConsensusPattern());

    const pattern = new CompositePattern(registry);

    const result = await pattern.execute({
      pattern: "composite",
      participants: {
        a: "agent-a",
        b: "agent-b",
      },
      config: {
        stages: [
          { name: "brainstorm", pattern: "brainstorming" },
          {
            name: "discussion",
            pattern: "discussion",
            input_from: "root",
            config: { convergence: "majority" },
          },
          {
            name: "consensus",
            pattern: "consensus",
            input_from: "root",
            config: { rule: "majority" },
          },
        ],
      },
      input: {
        topic: "Adopt launch plan",
        ideas: {
          a: ["Plan A"],
          b: ["Plan B"],
        },
        evaluations: {
          a: { "Plan A": 0.9, "Plan B": 0.8 },
          b: { "Plan A": 0.9, "Plan B": 0.7 },
        },
        opinions: {
          a: "Plan A",
          b: "Plan A",
        },
        votes: {
          a: true,
          b: true,
        },
      },
    });

    expect(result.success).toBe(true);
    expect((result.output as { stages: Array<{ name: string; success: boolean }> }).stages).toHaveLength(3);
    expect((result.output as { stages: Array<{ name: string; success: boolean }> }).stages).toEqual([
      expect.objectContaining({ name: "brainstorm", success: true }),
      expect.objectContaining({ name: "discussion", success: true }),
      expect.objectContaining({ name: "consensus", success: true }),
    ]);
  });

  it("emits composite lifecycle events", async () => {
    const registry = createRegistry();
    const pattern = new CompositePattern(registry);
    const emit = vi.fn();

    await pattern.execute({
      pattern: "composite",
      input: "a",
      emit,
      config: {
        stages: [
          { name: "s1", pattern: "append", config: { suffix: "1" } },
          { name: "s2", pattern: "append", config: { suffix: "2" } },
        ],
      },
    });

    expect(emit.mock.calls.map((call) => call[0].type)).toEqual([
      "composite_start",
      "composite_stage_start",
      "composite_stage_end",
      "composite_stage_start",
      "composite_stage_end",
      "composite_end",
    ]);
  });

  it("returns success with empty output when stages are empty", async () => {
    const registry = createRegistry();
    const pattern = new CompositePattern(registry);

    const result = await pattern.execute({
      pattern: "composite",
      config: {
        stages: [],
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ stages: [], completed_stages: 0 });
  });

  it("throws for unknown sub-pattern", async () => {
    const registry = createRegistry();
    const pattern = new CompositePattern(registry);

    await expect(
      pattern.execute({
        pattern: "composite",
        config: {
          stages: [{ name: "unknown", pattern: "does-not-exist" }],
        },
      })
    ).rejects.toThrow("Pattern 'does-not-exist' was not found");
  });

  it("throws when input_from references unknown stage", async () => {
    const registry = createRegistry();
    const pattern = new CompositePattern(registry);

    await expect(
      pattern.execute({
        pattern: "composite",
        config: {
          stages: [
            { name: "s1", pattern: "echo" },
            { name: "s2", pattern: "echo", input_from: "missing" },
          ],
        },
      })
    ).rejects.toThrow("composite stage 's2' references unknown input_from stage 'missing'");
  });

  it("escalates thrown stage errors", async () => {
    const registry = createRegistry();
    const pattern = new CompositePattern(registry);

    await expect(
      pattern.execute({
        pattern: "composite",
        config: {
          on_stage_failure: "escalate",
          stages: [{ name: "bad", pattern: "thrower" }],
        },
      })
    ).rejects.toThrow("boom");
  });
});
