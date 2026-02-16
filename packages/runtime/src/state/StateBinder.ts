import type { AuditRecorder } from "../audit/AuditTrail.js";
import type { CellResult } from "../cell/types.js";

export interface StateBinding {
  source: string;
  target: string;
  transform?: string;
  condition?: string;
}

export interface StateBinder {
  bind(cellResult: CellResult, bindings: StateBinding[]): Promise<void>;
}

export interface StateStore {
  read(path: string): unknown;
  write(path: string, value: unknown): unknown;
}

export type TransformFn = (value: unknown, cellResult: CellResult, binding: StateBinding) => unknown;

export interface StateBinderOptions {
  transforms?: Record<string, TransformFn>;
  evaluateCondition?: (condition: string, value: unknown, cellResult: CellResult, binding: StateBinding) => boolean;
  auditRecorder?: Pick<AuditRecorder, "recordStateChange">;
}

const PATH_SEGMENT_PATTERN = /[^.[\]]+|\[(\d+)\]/g;

function parsePath(path: string): string[] {
  return path.match(PATH_SEGMENT_PATTERN)?.map((segment) => segment.replace(/^\[(\d+)\]$/, "$1")) ?? [];
}

function getByPath(source: unknown, path: string): unknown {
  if (path.trim() === "") {
    return source;
  }

  const segments = parsePath(path);
  let current: unknown = source;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }

    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }

    return undefined;
  }

  return current;
}

function resolvePathFunction(path: string): unknown {
  const segments = path.split(".").map((segment) => segment.trim()).filter(Boolean);
  let current: unknown = globalThis;

  for (const segment of segments) {
    if (current === null || current === undefined || (typeof current !== "object" && typeof current !== "function")) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function evaluateConditionExpression(
  condition: string,
  value: unknown,
  cellResult: CellResult,
  binding: StateBinding
): boolean {
  const evaluator = new Function("value", "cellResult", "binding", `return (${condition});`) as (
    value: unknown,
    cellResult: CellResult,
    binding: StateBinding
  ) => unknown;

  return Boolean(evaluator(value, cellResult, binding));
}

export class DefaultStateBinder implements StateBinder {
  private readonly transforms: Record<string, TransformFn>;
  private readonly evaluateCondition: NonNullable<StateBinderOptions["evaluateCondition"]>;
  private readonly auditRecorder?: Pick<AuditRecorder, "recordStateChange">;

  constructor(
    private readonly stateStore: StateStore,
    options: StateBinderOptions = {}
  ) {
    this.transforms = options.transforms ?? {};
    this.evaluateCondition = options.evaluateCondition ?? evaluateConditionExpression;
    this.auditRecorder = options.auditRecorder;
  }

  async bind(cellResult: CellResult, bindings: StateBinding[]): Promise<void> {
    for (const binding of bindings) {
      const sourceValue = getByPath(cellResult, binding.source);

      if (binding.condition && !this.evaluateCondition(binding.condition, sourceValue, cellResult, binding)) {
        continue;
      }

      const targetValue = binding.transform
        ? this.applyTransform(binding.transform, sourceValue, cellResult, binding)
        : sourceValue;

      const oldValue = this.readSafely(binding.target);
      this.stateStore.write(binding.target, targetValue);
      await this.auditRecorder?.recordStateChange(binding.target, oldValue, targetValue);
    }
  }

  private readSafely(path: string): unknown {
    try {
      return this.stateStore.read(path);
    } catch {
      return undefined;
    }
  }

  private applyTransform(
    transformName: string,
    value: unknown,
    cellResult: CellResult,
    binding: StateBinding
  ): unknown {
    const registeredTransform = this.transforms[transformName];
    if (registeredTransform) {
      return registeredTransform(value, cellResult, binding);
    }

    const resolved = resolvePathFunction(transformName);
    if (typeof resolved === "function") {
      return (resolved as (input: unknown) => unknown)(value);
    }

    throw new Error(`Unknown transform: ${transformName}`);
  }
}

export const __internal = {
  getByPath,
  parsePath,
  resolvePathFunction,
};
