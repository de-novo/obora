import type { RepairContext } from "../validation-repair.js";
import type { BlackboardManager } from "../blackboard/blackboard-manager.js";

// ── Action interfaces ──────────────────────────────────────────────────

export interface ReflectorAction {
  type: string;
  priority: number;
  payload: Record<string, unknown>;
}

export interface ActionExecutionContext {
  cursor: number;
  stepIndexByName: Map<string, number>;
  repairContext: RepairContext;
  blackboard: BlackboardManager;
  workspacePath?: string;
}

export interface ActionResult {
  applied: boolean;
  cursor?: number;
  promptInjection?: string;
  modelOverride?: string;
  abort?: { reason: string };
  metadata?: Record<string, unknown>;
}

export interface ActionHandler {
  type: string;
  execute(
    action: ReflectorAction,
    context: ActionExecutionContext
  ): ActionResult;
}

// ── Builtin: inject_context ────────────────────────────────────────────

export class InjectContextHandler implements ActionHandler {
  readonly type = "inject_context";

  execute(action: ReflectorAction, _context: ActionExecutionContext): ActionResult {
    const content = action.payload.content;
    if (typeof content !== "string" || content.length === 0) {
      return { applied: false };
    }
    return {
      applied: true,
      promptInjection: content,
    };
  }
}

// ── Builtin: force_target ──────────────────────────────────────────────

export class ForceTargetHandler implements ActionHandler {
  readonly type = "force_target";

  execute(
    action: ReflectorAction,
    context: ActionExecutionContext
  ): ActionResult {
    const target = action.payload.target;
    if (typeof target !== "string") {
      return { applied: false };
    }
    const targetIndex = context.stepIndexByName.get(target);
    if (targetIndex === undefined) {
      return { applied: false };
    }
    return {
      applied: true,
      cursor: targetIndex,
    };
  }
}

// ── Builtin: switch_model ──────────────────────────────────────────────

export class SwitchModelHandler implements ActionHandler {
  readonly type = "switch_model";

  execute(action: ReflectorAction, _context: ActionExecutionContext): ActionResult {
    const model = action.payload.model;
    if (typeof model !== "string" || model.length === 0) {
      return { applied: false };
    }
    return {
      applied: true,
      modelOverride: model,
    };
  }
}

// ── Builtin: abort ─────────────────────────────────────────────────────

export class AbortHandler implements ActionHandler {
  readonly type = "abort";

  execute(action: ReflectorAction, _context: ActionExecutionContext): ActionResult {
    const reason =
      typeof action.payload.reason === "string"
        ? action.payload.reason
        : "Reflector abort action triggered";
    return {
      applied: true,
      abort: { reason },
    };
  }
}

// ── ActionRegistry ─────────────────────────────────────────────────────

export class ActionRegistry {
  private readonly handlers = new Map<string, ActionHandler>();

  register(handler: ActionHandler): void {
    this.handlers.set(handler.type, handler);
  }

  execute(
    actions: ReflectorAction[],
    context: ActionExecutionContext
  ): ActionResult[] {
    const sorted = [...actions].sort((a, b) => b.priority - a.priority);
    return sorted.map((action) => {
      const handler = this.handlers.get(action.type);
      if (!handler) {
        return { applied: false, metadata: { reason: `no handler for type "${action.type}"` } };
      }
      return handler.execute(action, context);
    });
  }

  hasHandler(type: string): boolean {
    return this.handlers.has(type);
  }
}

// ── Default registry with all builtins ─────────────────────────────────

export function createDefaultActionRegistry(): ActionRegistry {
  const registry = new ActionRegistry();
  registry.register(new InjectContextHandler());
  registry.register(new ForceTargetHandler());
  registry.register(new SwitchModelHandler());
  registry.register(new AbortHandler());
  return registry;
}
