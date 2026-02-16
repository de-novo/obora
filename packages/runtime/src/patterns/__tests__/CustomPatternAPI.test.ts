import { describe, expect, it, vi } from "vitest";

import { PatternRegistry } from "../PatternRegistry.js";
import {
  registerCustomPattern,
  registerCustomPatternFromConfig,
  type CustomPatternDefinition,
} from "../CustomPatternAPI.js";
import { CollaborationPatternBase, type PatternConfig, type PatternPayloadResult, type PatternRuntimeContext } from "../types.js";
import { resolveCustomPattern } from "../resolveCustomPattern.js";
import { OboraErrorCode } from "../../errors/OboraErrorCode.js";
import { OxfordDebatePattern } from "../examples/OxfordDebatePattern.js";

class EchoCustomPattern extends CollaborationPatternBase {
  readonly name = "echo-custom";
  readonly kind = "echo-custom";
  readonly version = "1.2.3";

  validateConfig(config: PatternConfig): void {
    if ((config as { mode?: string }).mode === "invalid") {
      throw new Error("invalid mode");
    }
  }

  protected async onExecute(context: PatternRuntimeContext): Promise<PatternPayloadResult> {
    await context.emit?.({ type: "echo_called", payload: { input: context.input } });
    return {
      success: true,
      output: { echo: context.input },
    };
  }
}

describe("CustomPatternAPI", () => {
  it("registers custom pattern and executes through registry", async () => {
    const registry = new PatternRegistry();
    registerCustomPattern(registry, new EchoCustomPattern());

    const resolved = registry.get("echo-custom");
    const result = await resolved.run({
      pattern: "echo-custom",
      input: { hello: "world" },
    });

    expect(result.success).toBe(true);
    expect(result.pattern).toBe("echo-custom");
    expect(result.output).toEqual({ echo: { hello: "world" } });
  });

  it("throws on collision by default", () => {
    const registry = new PatternRegistry();
    registerCustomPattern(registry, new EchoCustomPattern());

    expect(() => registerCustomPattern(registry, new EchoCustomPattern())).toThrow(/already registered/);
  });

  it("allows replace mode for same name", () => {
    const registry = new PatternRegistry();
    registerCustomPattern(registry, new EchoCustomPattern());

    class ReplacementPattern extends EchoCustomPattern {
      readonly version = "2.0.0";
    }

    registerCustomPattern(registry, new ReplacementPattern(), { replace: true });

    const resolved = registry.get("echo-custom");
    expect(resolved.version).toBe("2.0.0");
  });

  it("registers from CustomPatternDefinition", async () => {
    const registry = new PatternRegistry();

    const definition: CustomPatternDefinition = {
      name: "from-config",
      version: "0.9.0",
      execute: async (context) => ({
        success: true,
        output: { ok: true, input: context.input },
      }),
    };

    registerCustomPatternFromConfig(registry, definition);

    const result = await registry.get("from-config").run({
      pattern: "from-config",
      input: 42,
    });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ ok: true, input: 42 });
  });

  it("uses same hooks and emit behavior as builtins", async () => {
    const registry = new PatternRegistry();
    registerCustomPattern(registry, new EchoCustomPattern());

    const events: string[] = [];
    const hookEvents: string[] = [];

    const result = await registry.get("echo-custom").run({
      pattern: "echo-custom",
      input: { v: 1 },
      emit: (event) => {
        events.push(event.type);
      },
      hooks: {
        onStart: () => hookEvents.push("start"),
        onComplete: () => hookEvents.push("complete"),
      },
    });

    expect(result.success).toBe(true);
    expect(events).toContain("echo_called");
    expect(hookEvents).toEqual(["start", "complete"]);
  });

  it("OxfordDebatePattern works end-to-end", async () => {
    const registry = new PatternRegistry();
    registerCustomPattern(registry, new OxfordDebatePattern());

    const result = await registry.get("oxford-debate").run({
      pattern: "oxford-debate",
      participants: {
        proposer: "alice",
        opposer: "bob",
        judge: "carol",
      },
      input: {
        motion: "Remote work should be the default",
        arguments: {
          proposer: "Flexibility improves productivity.",
          opposer: "Collaboration suffers.",
          rebuttal: "Async tooling mitigates collaboration risks.",
          carol: "for",
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      motion: "Remote work should be the default",
      result: "for",
    });
    expect((result.output as { rounds: unknown[] }).rounds).toHaveLength(4);
  });

  it("throws ORCH_STEP_NOT_FOUND for unknown custom pattern", () => {
    const registry = new PatternRegistry();

    expect(() => resolveCustomPattern(registry, "unknown-pattern")).toThrow(OboraErrorCode.ORCH_STEP_NOT_FOUND);

    try {
      resolveCustomPattern(registry, "unknown-pattern");
    } catch (error) {
      expect((error as { code?: string }).code).toBe(OboraErrorCode.ORCH_STEP_NOT_FOUND);
    }
  });

  it("custom pattern validateConfig is applied", async () => {
    const registry = new PatternRegistry();

    registerCustomPatternFromConfig(registry, {
      name: "validated",
      validateConfig: (config) => {
        if ((config as { must?: string }).must !== "ok") {
          throw new Error("config must be ok");
        }
      },
      execute: async () => ({ success: true, output: "ok" }),
    });

    await expect(
      registry.get("validated").run({
        pattern: "validated",
        config: { must: "no" },
      })
    ).rejects.toThrow("config must be ok");

    const result = await registry.get("validated").run({
      pattern: "validated",
      config: { must: "ok" },
    });

    expect(result.success).toBe(true);
  });

  it("warns when replacing with same version", () => {
    const registry = new PatternRegistry();
    const warn = vi.fn();

    registerCustomPattern(registry, new EchoCustomPattern());
    registerCustomPattern(registry, new EchoCustomPattern(), { replace: true, logger: { warn } });

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("same version");
  });

  it("supports file-path pattern resolution via stubbed loader", () => {
    const registry = new PatternRegistry();
    const pattern = new EchoCustomPattern();
    const loadFromFile = vi.fn().mockReturnValue(pattern);

    const resolved = resolveCustomPattern(registry, "./patterns/custom.ts", { loadFromFile });

    expect(loadFromFile).toHaveBeenCalledOnce();
    expect(resolved.name).toBe("echo-custom");
  });
});
