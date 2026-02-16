import { describe, expect, it } from "vitest";

import { PipelinePattern } from "../builtin/PipelinePattern.js";
import {
  BUILTIN_PATTERN_KINDS,
  PATTERN_BLACKBOARD_DOMAIN_MAP,
  PATTERN_ERROR_CODE_MAP,
  OboraErrorCode,
  isBuiltinPatternKind,
} from "../types.js";
import { createBuiltinPlugins } from "../../plugins/builtins.js";

describe("Pattern runtime contracts", () => {
  it("defines exactly 8 built-in pattern kinds", () => {
    expect(BUILTIN_PATTERN_KINDS).toEqual([
      "pipeline",
      "discussion",
      "consensus",
      "brainstorming",
      "peer-review",
      "red-blue",
      "fan-out-fan-in",
      "supervisor",
    ]);
  });

  it("maps all built-in patterns to blackboard domains", () => {
    for (const kind of BUILTIN_PATTERN_KINDS) {
      expect(PATTERN_BLACKBOARD_DOMAIN_MAP[kind].length).toBeGreaterThan(0);
    }
  });

  it("maps failure/timeout/escalation codes for all built-in patterns", () => {
    for (const kind of BUILTIN_PATTERN_KINDS) {
      const mapping = PATTERN_ERROR_CODE_MAP[kind];
      expect(mapping.failure).toBeDefined();
      expect(mapping.timeout).toBeDefined();
      expect(mapping.escalation).toBe(OboraErrorCode.RECOVERY_ESCALATION_TIMEOUT);
    }
  });

  it("keeps M1 pipeline behavior and exposes M2 pattern runtime result", async () => {
    const pattern = new PipelinePattern();

    const result = await pattern.execute({
      pattern: "pipeline",
      input: 2,
      steps: [(value) => Number(value) + 3, (value) => Number(value) * 2],
      config: { stages: ["a", "b"] },
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe(10);
    expect(result.metadata?.steps).toBe(2);
    expect(result.pattern).toBe("pipeline");
  });

  it("registers pipeline built-in as pattern plugin wrapper", () => {
    const patternPlugin = createBuiltinPlugins().find((plugin) => plugin.type === "pattern" && plugin.name === "pipeline");
    expect(patternPlugin).toBeDefined();
    expect(patternPlugin?.name).toBe("pipeline");
    expect(patternPlugin?.version).toBe("1.0.0");
    expect(isBuiltinPatternKind(patternPlugin!.name)).toBe(true);
  });

  it("registers discussion built-in as pattern plugin wrapper", () => {
    const patternPlugin = createBuiltinPlugins().find((plugin) => plugin.type === "pattern" && plugin.name === "discussion");
    expect(patternPlugin).toBeDefined();
    expect(patternPlugin?.name).toBe("discussion");
    expect(patternPlugin?.version).toBe("1.0.0");
    expect(isBuiltinPatternKind(patternPlugin!.name)).toBe(true);
  });

  it("registers consensus built-in as pattern plugin wrapper", () => {
    const patternPlugin = createBuiltinPlugins().find((plugin) => plugin.type === "pattern" && plugin.name === "consensus");
    expect(patternPlugin).toBeDefined();
    expect(patternPlugin?.name).toBe("consensus");
    expect(patternPlugin?.version).toBe("1.0.0");
    expect(isBuiltinPatternKind(patternPlugin!.name)).toBe(true);
  });

  it("registers brainstorming built-in as pattern plugin wrapper", () => {
    const patternPlugin = createBuiltinPlugins().find((plugin) => plugin.type === "pattern" && plugin.name === "brainstorming");
    expect(patternPlugin).toBeDefined();
    expect(patternPlugin?.name).toBe("brainstorming");
    expect(patternPlugin?.version).toBe("1.0.0");
    expect(isBuiltinPatternKind(patternPlugin!.name)).toBe(true);
  });

  it("registers peer-review built-in as pattern plugin wrapper", () => {
    const patternPlugin = createBuiltinPlugins().find((plugin) => plugin.type === "pattern" && plugin.name === "peer-review");
    expect(patternPlugin).toBeDefined();
    expect(patternPlugin?.name).toBe("peer-review");
    expect(patternPlugin?.version).toBe("1.0.0");
    expect(isBuiltinPatternKind(patternPlugin!.name)).toBe(true);
  });

  it("registers fan-out-fan-in built-in as pattern plugin wrapper", () => {
    const patternPlugin = createBuiltinPlugins().find((plugin) => plugin.type === "pattern" && plugin.name === "fan-out-fan-in");
    expect(patternPlugin).toBeDefined();
    expect(patternPlugin?.name).toBe("fan-out-fan-in");
    expect(patternPlugin?.version).toBe("1.0.0");
    expect(isBuiltinPatternKind(patternPlugin!.name)).toBe(true);
  });

  it("registers red-blue built-in as pattern plugin wrapper", () => {
    const patternPlugin = createBuiltinPlugins().find((plugin) => plugin.type === "pattern" && plugin.name === "red-blue");
    expect(patternPlugin).toBeDefined();
    expect(patternPlugin?.name).toBe("red-blue");
    expect(patternPlugin?.version).toBe("1.0.0");
    expect(isBuiltinPatternKind(patternPlugin!.name)).toBe(true);
  });
});
