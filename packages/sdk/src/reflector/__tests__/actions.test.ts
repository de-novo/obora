import { describe, it, expect } from "vitest";
import {
  InjectContextHandler,
  ForceTargetHandler,
  SwitchModelHandler,
  AbortHandler,
  ActionRegistry,
  createDefaultActionRegistry,
} from "../actions.js";
import type { ReflectorAction, ActionExecutionContext } from "../actions.js";
import type { RepairContext } from "../../validation-repair.js";
import { BlackboardManager } from "../../blackboard/blackboard-manager.js";

function makeContext(overrides?: Partial<ActionExecutionContext>): ActionExecutionContext {
  return {
    cursor: 0,
    stepIndexByName: new Map([["build", 0], ["test", 1], ["deploy", 2]]),
    repairContext: { mode: "repair", attempt: 1 } as RepairContext,
    blackboard: new BlackboardManager(),
    ...overrides,
  };
}

// ── InjectContextHandler ─────────────────────────────────────────────

describe("InjectContextHandler", () => {
  const handler = new InjectContextHandler();

  it("injects content as promptInjection", () => {
    const action: ReflectorAction = {
      type: "inject_context",
      priority: 50,
      payload: { content: "Try redesigning the backup logic" },
    };
    const result = handler.execute(action, makeContext());
    expect(result.applied).toBe(true);
    expect(result.promptInjection).toBe("Try redesigning the backup logic");
  });

  it("returns not-applied for empty content", () => {
    const action: ReflectorAction = {
      type: "inject_context",
      priority: 50,
      payload: { content: "" },
    };
    expect(handler.execute(action, makeContext()).applied).toBe(false);
  });

  it("returns not-applied for non-string content", () => {
    const action: ReflectorAction = {
      type: "inject_context",
      priority: 50,
      payload: { content: 42 },
    };
    expect(handler.execute(action, makeContext()).applied).toBe(false);
  });
});

// ── ForceTargetHandler ───────────────────────────────────────────────

describe("ForceTargetHandler", () => {
  const handler = new ForceTargetHandler();

  it("resolves target step to cursor index", () => {
    const action: ReflectorAction = {
      type: "force_target",
      priority: 80,
      payload: { target: "test" },
    };
    const result = handler.execute(action, makeContext());
    expect(result.applied).toBe(true);
    expect(result.cursor).toBe(1);
  });

  it("returns not-applied for unknown target", () => {
    const action: ReflectorAction = {
      type: "force_target",
      priority: 80,
      payload: { target: "nonexistent" },
    };
    expect(handler.execute(action, makeContext()).applied).toBe(false);
  });

  it("returns not-applied for non-string target", () => {
    const action: ReflectorAction = {
      type: "force_target",
      priority: 80,
      payload: { target: 123 },
    };
    expect(handler.execute(action, makeContext()).applied).toBe(false);
  });
});

// ── SwitchModelHandler ───────────────────────────────────────────────

describe("SwitchModelHandler", () => {
  const handler = new SwitchModelHandler();

  it("returns model override", () => {
    const action: ReflectorAction = {
      type: "switch_model",
      priority: 60,
      payload: { model: "claude-3-opus" },
    };
    const result = handler.execute(action, makeContext());
    expect(result.applied).toBe(true);
    expect(result.modelOverride).toBe("claude-3-opus");
  });

  it("returns not-applied for empty model", () => {
    const action: ReflectorAction = {
      type: "switch_model",
      priority: 60,
      payload: { model: "" },
    };
    expect(handler.execute(action, makeContext()).applied).toBe(false);
  });
});

// ── AbortHandler ─────────────────────────────────────────────────────

describe("AbortHandler", () => {
  const handler = new AbortHandler();

  it("aborts with given reason", () => {
    const action: ReflectorAction = {
      type: "abort",
      priority: 100,
      payload: { reason: "exceeded 10 repair attempts" },
    };
    const result = handler.execute(action, makeContext());
    expect(result.applied).toBe(true);
    expect(result.abort?.reason).toBe("exceeded 10 repair attempts");
  });

  it("aborts with default reason when none provided", () => {
    const action: ReflectorAction = {
      type: "abort",
      priority: 100,
      payload: {},
    };
    const result = handler.execute(action, makeContext());
    expect(result.applied).toBe(true);
    expect(result.abort?.reason).toContain("Reflector abort");
  });
});

// ── ActionRegistry ───────────────────────────────────────────────────

describe("ActionRegistry", () => {
  it("executes actions sorted by priority (highest first)", () => {
    const registry = createDefaultActionRegistry();
    const actions: ReflectorAction[] = [
      { type: "inject_context", priority: 20, payload: { content: "low priority" } },
      { type: "inject_context", priority: 80, payload: { content: "high priority" } },
    ];
    const results = registry.execute(actions, makeContext());
    expect(results).toHaveLength(2);
    // Both should be applied
    expect(results.every((r) => r.applied)).toBe(true);
    // First result should be from the higher priority action
    expect(results[0]!.promptInjection).toBe("high priority");
  });

  it("returns not-applied for unknown action types", () => {
    const registry = createDefaultActionRegistry();
    const actions: ReflectorAction[] = [
      { type: "unknown_action", priority: 50, payload: {} },
    ];
    const results = registry.execute(actions, makeContext());
    expect(results[0]!.applied).toBe(false);
    expect(results[0]!.metadata?.reason).toContain("no handler");
  });

  it("hasHandler returns correct boolean", () => {
    const registry = createDefaultActionRegistry();
    expect(registry.hasHandler("inject_context")).toBe(true);
    expect(registry.hasHandler("force_target")).toBe(true);
    expect(registry.hasHandler("switch_model")).toBe(true);
    expect(registry.hasHandler("abort")).toBe(true);
    expect(registry.hasHandler("custom")).toBe(false);
  });

  it("supports custom handler registration", () => {
    const registry = createDefaultActionRegistry();
    registry.register({
      type: "custom",
      execute: () => ({ applied: true, metadata: { custom: true } }),
    });
    expect(registry.hasHandler("custom")).toBe(true);
    const results = registry.execute(
      [{ type: "custom", priority: 50, payload: {} }],
      makeContext(),
    );
    expect(results[0]!.applied).toBe(true);
    expect(results[0]!.metadata?.custom).toBe(true);
  });
});
