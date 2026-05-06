import { isAbsolute } from "node:path";

import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";

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

  it("OxfordDebatePattern covers majority, judge-against, defaults, and emitted rounds", async () => {
    const pattern = new OxfordDebatePattern();
    const events: string[] = [];

    const majority = await pattern.run({
      pattern: "oxford-debate",
      config: { voting: "majority" },
      participants: {
        proposer: "alice",
        opposer: "bob",
        judge: "carol",
      },
      input: {
        motion: "Typed SDKs reduce integration risk",
      },
      emit: (event) => {
        events.push(event.type);
      },
    });

    expect(majority.output).toMatchObject({
      motion: "Typed SDKs reduce integration risk",
      result: "for",
    });
    expect(events).toEqual(["oxford_debate_rounds_completed"]);

    const judgeAgainst = await pattern.run({
      pattern: "oxford-debate",
      participants: {
        proposer: "alice",
        opposer: "bob",
        judge: "carol",
      },
      input: {
        motion: "Ship without tests",
        arguments: {
          carol: "against",
        },
      },
    });

    expect(judgeAgainst.output).toMatchObject({
      result: "against",
    });
  });

  it("OxfordDebatePattern rejects invalid config, input, and participant roles", async () => {
    const pattern = new OxfordDebatePattern();

    await expect(
      pattern.run({
        pattern: "oxford-debate",
        config: { voting: "ranked" },
        input: { motion: "A valid motion" },
        participants: {
          proposer: "alice",
          opposer: "bob",
          judge: "carol",
        },
      }),
    ).rejects.toThrow("oxford-debate.voting");

    await expect(
      pattern.run({
        pattern: "oxford-debate",
        input: null,
        participants: {
          proposer: "alice",
          opposer: "bob",
          judge: "carol",
        },
      }),
    ).rejects.toThrow("input must be an object");

    await expect(
      pattern.run({
        pattern: "oxford-debate",
        input: { motion: "A valid motion" },
        participants: {
          proposer: "alice",
          judge: "carol",
        },
      }),
    ).rejects.toThrow("participant role 'opposer'");
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

  it("resolveCustomPattern returns registered patterns and rejects invalid refs", async () => {
    const registry = new PatternRegistry();
    const pattern = new EchoCustomPattern();
    registerCustomPattern(registry, pattern);

    expect(resolveCustomPattern(registry, "echo-custom")).toBe(pattern);
    expect(() => resolveCustomPattern(registry, "")).toThrow("Pattern name is required");
    expect(() => resolveCustomPattern(registry, 123 as unknown as string)).toThrow("Pattern name is required");

    const { resolveCustomPatternAsync } = await import("../resolveCustomPattern.js");
    await expect(resolveCustomPatternAsync(registry, "")).rejects.toThrow("Pattern name is required");
    await expect(resolveCustomPatternAsync(registry, 123 as unknown as string)).rejects.toThrow(
      "Pattern name is required"
    );
    await expect(resolveCustomPatternAsync(new PatternRegistry(), "missing-pattern")).rejects.toThrow(
      OboraErrorCode.ORCH_STEP_NOT_FOUND
    );
    await expect(resolveCustomPatternAsync(registry, "echo-custom")).resolves.toBe(pattern);
  });



  // === File-path resolution tests ===

  describe("resolveCustomPattern file-path loading", () => {
    it("loads pattern via custom loadFromFile and validates contract", () => {
      const registry = new PatternRegistry();
      const pattern = new EchoCustomPattern();
      const loadFromFile = vi.fn().mockReturnValue(pattern);

      const resolved = resolveCustomPattern(registry, "./patterns/custom.ts", { loadFromFile });

      expect(loadFromFile).toHaveBeenCalledTimes(1);
      const calledPath = loadFromFile.mock.calls[0]![0] as string;
      expect(calledPath).toMatch(/patterns[/\\]custom\.ts$/);
      expect(isAbsolute(calledPath)).toBe(true);
      expect(resolved.name).toBe("echo-custom");
    });

    it("passes cwd to loadFromFile", () => {
      const registry = new PatternRegistry();
      const pattern = new EchoCustomPattern();
      const loadFromFile = vi.fn().mockReturnValue(pattern);

      resolveCustomPattern(registry, "./custom.ts", { loadFromFile, cwd: "/my/project" });

      expect(loadFromFile).toHaveBeenCalledWith("/my/project/custom.ts", { cwd: "/my/project" });
    });

    it("rejects loader returning object missing 'name'", () => {
      const registry = new PatternRegistry();
      const loadFromFile = vi.fn().mockReturnValue({ kind: "x", run: vi.fn(), execute: vi.fn() });

      expect(() =>
        resolveCustomPattern(registry, "./bad.js", { loadFromFile })
      ).toThrow(/contract validation/);
    });

    it("rejects loader returning object missing 'run'", () => {
      const registry = new PatternRegistry();
      const loadFromFile = vi.fn().mockReturnValue({ name: "x", kind: "x", execute: vi.fn() });

      expect(() =>
        resolveCustomPattern(registry, "./bad.js", { loadFromFile })
      ).toThrow(/contract validation/);
    });

    it("rejects loader returning object missing 'execute'", () => {
      const registry = new PatternRegistry();
      const loadFromFile = vi.fn().mockReturnValue({ name: "x", kind: "x", run: vi.fn() });

      expect(() =>
        resolveCustomPattern(registry, "./bad.js", { loadFromFile })
      ).toThrow(/contract validation/);
    });

    it("rejects loader returning null", () => {
      const registry = new PatternRegistry();
      const loadFromFile = vi.fn().mockReturnValue(null);

      expect(() =>
        resolveCustomPattern(registry, "./null.js", { loadFromFile })
      ).toThrow(/contract validation/);
    });

    it("rejects loader returning a Promise (async) from sync resolve", () => {
      const registry = new PatternRegistry();
      const loadFromFile = vi.fn().mockReturnValue(Promise.resolve(new EchoCustomPattern()));

      expect(() =>
        resolveCustomPattern(registry, "./async.mjs", { loadFromFile })
      ).toThrow(/Promise/);
    });

    it("default loader throws helpful error for missing file", () => {
      const registry = new PatternRegistry();

      expect(() =>
        resolveCustomPattern(registry, "./nonexistent-pattern.js")
      ).toThrow(/Failed to load custom pattern/);
    });
  });

  describe("resolveCustomPatternAsync", () => {
    it("resolves async loader and validates contract", async () => {
      const { resolveCustomPatternAsync } = await import("../resolveCustomPattern.js");
      const registry = new PatternRegistry();
      const pattern = new EchoCustomPattern();
      const loadFromFile = vi.fn().mockResolvedValue(pattern);

      const resolved = await resolveCustomPatternAsync(registry, "./patterns/custom.ts", { loadFromFile });

      expect(resolved.name).toBe("echo-custom");
    });

    it("rejects async loader returning invalid contract", async () => {
      const { resolveCustomPatternAsync } = await import("../resolveCustomPattern.js");
      const registry = new PatternRegistry();
      const loadFromFile = vi.fn().mockResolvedValue({ name: "x" });

      await expect(
        resolveCustomPatternAsync(registry, "./bad.js", { loadFromFile })
      ).rejects.toThrow(/contract validation/);
    });
  });

});

// === M2-09: YAML file-path resolution tests ===

import { resolveCustomPatternAsync, loadPatternFromYamlFile } from "../resolveCustomPattern.js";
import * as fs from "node:fs";
import * as nodePath from "node:path";

describe("M2-09: YAML file-path resolution", () => {
  const tmpDir = nodePath.join(process.cwd(), "__test_tmp_m2_09__");

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeYaml(name: string, content: string): string {
    const p = nodePath.join(tmpDir, name);
    fs.writeFileSync(p, content, "utf-8");
    return p;
  }

  it("looksLikeFilePath recognizes .yaml extension", () => {
    const registry = new PatternRegistry();
    // .yaml should be treated as file path → triggers file loading (which will fail for missing file)
    expect(() => resolveCustomPattern(registry, "my-pattern.yaml")).toThrow(/Failed to load custom pattern from YAML/);
  });

  it("looksLikeFilePath recognizes .yml extension", () => {
    const registry = new PatternRegistry();
    expect(() => resolveCustomPattern(registry, "my-pattern.yml")).toThrow(/Failed to load custom pattern from YAML/);
  });

  it("YAML file ref resolves with valid contract (via custom loader)", () => {
    const registry = new PatternRegistry();
    const pattern = new EchoCustomPattern();
    const loadFromFile = vi.fn().mockReturnValue(pattern);

    const resolved = resolveCustomPattern(registry, "./patterns/custom.yaml", { loadFromFile });
    expect(resolved.name).toBe("echo-custom");
    // Note: with custom loader, the resolved absolute path is passed
    expect(loadFromFile).toHaveBeenCalledTimes(1);
  });

  it("YAML file with invalid contract fails validation", () => {
    const yamlPath = writeYaml("bad-contract.yaml", `
name: "test-pattern"
kind: "test"
# missing run and execute → contract fail
`);

    const registry = new PatternRegistry();
    expect(() => resolveCustomPattern(registry, yamlPath)).toThrow(/contract validation/);
  });

  it("YAML file with missing/empty content fails", () => {
    const yamlPath = writeYaml("empty.yaml", "");

    const registry = new PatternRegistry();
    expect(() => resolveCustomPattern(registry, yamlPath)).toThrow(/Failed to load custom pattern from YAML/);
  });

  it("YAML scalar content fails object validation", () => {
    const yamlPath = writeYaml("scalar.yaml", "just-a-string");

    const registry = new PatternRegistry();
    expect(() => resolveCustomPattern(registry, yamlPath)).toThrow(/Failed to load custom pattern from YAML/);
  });

  it("cwd + relative path normalization resolves correctly", () => {
    const yamlPath = writeYaml("relative-test.yaml", `
name: "rel-pattern"
kind: "rel"
`);

    const registry = new PatternRegistry();
    // Use cwd=tmpDir with relative filename → should resolve to same file
    // Will fail contract validation (no run/execute) but proves path resolution works
    expect(() => resolveCustomPattern(registry, "relative-test.yaml", { cwd: tmpDir })).toThrow(/contract validation/);
  });

  it("cwd + ../relative path normalization", () => {
    const subDir = nodePath.join(tmpDir, "sub");
    fs.mkdirSync(subDir, { recursive: true });
    writeYaml("parent-test.yaml", `
name: "parent"
kind: "parent"
`);

    const registry = new PatternRegistry();
    // From sub/ go up with ../parent-test.yaml
    expect(() => resolveCustomPattern(registry, "../parent-test.yaml", { cwd: subDir })).toThrow(/contract validation/);
  });

  it("async resolveCustomPatternAsync handles YAML path", async () => {
    const yamlPath = writeYaml("async-test.yaml", `
name: "async-yaml"
kind: "async"
`);

    const registry = new PatternRegistry();
    // Should fail contract (no run/execute) but go through YAML load path
    await expect(resolveCustomPatternAsync(registry, yamlPath)).rejects.toThrow(/contract validation/);
  });

  it("nonexistent YAML file gives clear error", () => {
    const registry = new PatternRegistry();
    expect(() => resolveCustomPattern(registry, "/nonexistent/path/pattern.yaml")).toThrow(/Failed to load custom pattern from YAML/);
  });

  it("loadPatternFromYamlFile directly loads valid YAML", () => {
    const yamlPath = writeYaml("direct-load.yaml", `
name: "direct"
kind: "direct-kind"
version: "1.0.0"
`);

    const result = loadPatternFromYamlFile(yamlPath);
    expect(result).toMatchObject({ name: "direct", kind: "direct-kind", version: "1.0.0" });
  });
});
