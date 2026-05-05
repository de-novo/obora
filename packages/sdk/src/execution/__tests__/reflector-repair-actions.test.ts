import { describe, expect, it, vi } from "vitest";
import { ReflectorEngine, type ReflectorOutput } from "../../reflector/reflector-engine.js";
import { applyReflectorRepairActions } from "../reflector-repair-actions.js";
import type { FailureEntry } from "../../blackboard/blackboard-manager.js";
import type { OboraRuntimeConfig } from "../../runtime-types.js";
import type { ReflectorRule } from "../../reflector/rule-engine.js";
import type { RepairContext, ValidationResult } from "../../validation-repair.js";

function makeFailure(stepName = "validate"): FailureEntry {
  const validation: ValidationResult = {
    passed: false,
    summary: "validation failed",
    failedChecks: [{ name: "check", message: "failed", severity: "error" }],
    signature: "validation:failed",
  };

  return {
    stepName,
    attempt: 1,
    validation,
    timestamp: new Date(),
  };
}

function makeReflectorWithAction(ruleAction: ReflectorRule["actions"][number]): ReflectorEngine {
  const engine = new ReflectorEngine({
    rules: [
      {
        name: `test-${ruleAction.type}`,
        when: { min_attempt: 1 },
        actions: [ruleAction],
      },
    ],
  });
  engine.analyzeFailures([makeFailure()], "validate");
  return engine;
}

function makeOptions(overrides: Partial<{
  reflector: unknown;
  config: OboraRuntimeConfig;
  repairContext: RepairContext;
  validationStepName: string;
  stepIndexByName: ReadonlyMap<string, number>;
  forcedRouteTargets: Map<string, string>;
}> = {}) {
  return {
    reflector: makeReflectorWithAction({
      type: "force_target",
      priority: 100,
      payload: { target: "repair" },
    }),
    config: { logger: { info: vi.fn(), warn: vi.fn() } },
    repairContext: { mode: "repair", attempt: 2 } as RepairContext,
    validationStepName: "validate",
    stepIndexByName: new Map([["validate", 0], ["repair", 1]]),
    forcedRouteTargets: new Map<string, string>(),
    ...overrides,
  };
}

describe("applyReflectorRepairActions", () => {
  it("applies force_target actions to the repair context and validation route queue", () => {
    const options = makeOptions();

    applyReflectorRepairActions(options);

    expect(options.repairContext.forceTarget).toBe("repair");
    expect(options.forcedRouteTargets.get("validate")).toBe("repair");
    expect(options.config.logger?.info).toHaveBeenCalled();
  });

  it("ignores force_target actions for unknown steps", () => {
    const options = makeOptions({
      reflector: makeReflectorWithAction({
        type: "force_target",
        priority: 100,
        payload: { target: "missing" },
      }),
    });

    applyReflectorRepairActions(options);

    expect(options.repairContext.forceTarget).toBeUndefined();
    expect(options.forcedRouteTargets.size).toBe(0);
  });

  it("throws an execution error for abort actions", () => {
    const options = makeOptions({
      reflector: makeReflectorWithAction({
        type: "abort",
        priority: 100,
        payload: { reason: "no progress" },
      }),
    });

    expect(() => applyReflectorRepairActions(options)).toThrow("no progress");
    expect(options.config.logger?.warn).toHaveBeenCalled();
  });

  it("does nothing when the reflector is not the v2 engine", () => {
    const options = makeOptions({ reflector: { getLastOutput: () => undefined } });

    applyReflectorRepairActions(options);

    expect(options.repairContext.forceTarget).toBeUndefined();
    expect(options.forcedRouteTargets.size).toBe(0);
  });

  it("does nothing when reflector has no last output", () => {
    const options = makeOptions({ reflector: new ReflectorEngine() });

    applyReflectorRepairActions(options);

    expect(options.repairContext.forceTarget).toBeUndefined();
    expect(options.forcedRouteTargets.size).toBe(0);
  });

  it("ignores action metadata without a pending action object", () => {
    const engine = new ReflectorEngine({
      rules: [
        {
          name: "metadata-without-pending-action",
          when: { min_attempt: 1 },
          actions: [
            {
              type: "suggest_prompt_patch",
              priority: 100,
              payload: {},
            },
          ],
        },
      ],
    });
    engine.analyzeFailures([makeFailure()], "validate");
    const options = makeOptions({ reflector: engine });

    applyReflectorRepairActions(options);

    expect(options.repairContext.forceTarget).toBeUndefined();
    expect(options.forcedRouteTargets.size).toBe(0);
  });

  it("ignores malformed pending action metadata from reflector output", () => {
    const engine = new ReflectorEngine();
    const output: ReflectorOutput = {
      hints: "",
      insights: [],
      knowledgeUsed: [],
      actions: [
        { applied: true },
        { applied: true, metadata: { pendingAction: "invalid" } },
        { applied: true, metadata: { pendingAction: { payload: {} } } },
        { applied: true, metadata: { pendingAction: { type: "force_target", payload: "invalid" } } },
      ],
    };
    vi.spyOn(engine, "getLastOutput").mockReturnValue(output);
    const options = makeOptions({ reflector: engine });

    applyReflectorRepairActions(options);

    expect(options.repairContext.forceTarget).toBeUndefined();
    expect(options.forcedRouteTargets.size).toBe(0);
  });

  it("applies force_target to context without queueing when validation step is absent", () => {
    const options = makeOptions({ validationStepName: undefined });

    applyReflectorRepairActions(options);

    expect(options.repairContext.forceTarget).toBe("repair");
    expect(options.forcedRouteTargets.size).toBe(0);
  });

  it("uses default abort reason when action payload omits reason", () => {
    const options = makeOptions({
      reflector: makeReflectorWithAction({
        type: "abort",
        priority: 100,
        payload: {},
      }),
    });

    expect(() => applyReflectorRepairActions(options)).toThrow(
      "Reflector abort action triggered"
    );
  });
});
