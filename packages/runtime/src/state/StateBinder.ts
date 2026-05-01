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

type ConditionTokenType =
  | "identifier"
  | "number"
  | "string"
  | "boolean"
  | "null"
  | "operator"
  | "paren";

interface ConditionToken {
  type: ConditionTokenType;
  value: string;
}

function tokenizeCondition(condition: string): ConditionToken[] {
  const tokens: ConditionToken[] = [];
  let index = 0;

  const push = (type: ConditionTokenType, value: string) => {
    tokens.push({ type, value });
  };

  while (index < condition.length) {
    const char = condition[index] ?? "";

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const twoChar = condition.slice(index, index + 2);
    if (["&&", "||", "==", "!=", ">=", "<="].includes(twoChar)) {
      push("operator", twoChar);
      index += 2;
      continue;
    }

    if ([">", "<", "!"].includes(char)) {
      push("operator", char);
      index += 1;
      continue;
    }

    if (char === "(" || char === ")") {
      push("paren", char);
      index += 1;
      continue;
    }

    if (char === "\"" || char === "'") {
      const quote = char;
      let cursor = index + 1;
      let value = "";
      while (cursor < condition.length) {
        const current = condition[cursor] ?? "";
        if (current === "\\") {
          value += condition[cursor + 1] ?? "";
          cursor += 2;
          continue;
        }
        if (current === quote) {
          break;
        }
        value += current;
        cursor += 1;
      }
      if (condition[cursor] !== quote) {
        throw new Error("Unterminated string literal in condition");
      }
      push("string", value);
      index = cursor + 1;
      continue;
    }

    const numberMatch = condition.slice(index).match(/^-?\d+(?:\.\d+)?/);
    if (numberMatch) {
      push("number", numberMatch[0]);
      index += numberMatch[0].length;
      continue;
    }

    const identifierMatch = condition.slice(index).match(/^[A-Za-z_$][\w$.]*/);
    if (identifierMatch) {
      const value = identifierMatch[0];
      if (value === "true" || value === "false") {
        push("boolean", value);
      } else if (value === "null") {
        push("null", value);
      } else {
        push("identifier", value);
      }
      index += value.length;
      continue;
    }

    throw new Error(`Unsupported token in condition near '${condition.slice(index)}'`);
  }

  return tokens;
}

function resolveConditionIdentifier(name: string, scope: Record<string, unknown>): unknown {
  const segments = name.split(".").filter(Boolean);
  let current: unknown = scope;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null) {
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
  const tokens = tokenizeCondition(condition);
  let cursor = 0;
  const scope = { value, cellResult, binding } as Record<string, unknown>;

  const peek = () => tokens[cursor];
  const consume = () => tokens[cursor++];
  const matchOperator = (...operators: string[]) => {
    const token = peek();
    if (token?.type === "operator" && operators.includes(token.value)) {
      consume();
      return token.value;
    }
    return undefined;
  };

  const parsePrimary = (): unknown => {
    const token = consume();
    if (!token) {
      throw new Error("Unexpected end of condition");
    }

    if (token.type === "paren" && token.value === "(") {
      const result = parseOr();
      const closing = consume();
      if (!closing || closing.type !== "paren" || closing.value !== ")") {
        throw new Error("Missing closing ')' in condition");
      }
      return result;
    }

    if (token.type === "number") {
      return Number(token.value);
    }
    if (token.type === "string") {
      return token.value;
    }
    if (token.type === "boolean") {
      return token.value === "true";
    }
    if (token.type === "null") {
      return null;
    }
    if (token.type === "identifier") {
      return resolveConditionIdentifier(token.value, scope);
    }

    throw new Error(`Unexpected token '${token.value}' in condition`);
  };

  const parseUnary = (): unknown => {
    if (matchOperator("!")) {
      return !parseUnary();
    }
    return parsePrimary();
  };

  const parseComparison = (): unknown => {
    let left = parseUnary();
    while (true) {
      const operator = matchOperator("==", "!=", ">", "<", ">=", "<=");
      if (!operator) {
        return left;
      }
      const right = parseUnary();
      switch (operator) {
        case "==": left = left == right; break;
        case "!=": left = left != right; break;
        case ">": left = Number(left) > Number(right); break;
        case "<": left = Number(left) < Number(right); break;
        case ">=": left = Number(left) >= Number(right); break;
        case "<=": left = Number(left) <= Number(right); break;
      }
    }
  };

  const parseAnd = (): unknown => {
    let left = parseComparison();
    while (matchOperator("&&")) {
      const right = parseComparison();
      left = Boolean(left) && Boolean(right);
    }
    return left;
  };

  const parseOr = (): unknown => {
    let left = parseAnd();
    while (matchOperator("||")) {
      const right = parseAnd();
      left = Boolean(left) || Boolean(right);
    }
    return left;
  };

  const result = parseOr();
  if (cursor < tokens.length) {
    throw new Error(`Unexpected trailing token '${tokens[cursor]?.value ?? ""}' in condition`);
  }

  return Boolean(result);
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
