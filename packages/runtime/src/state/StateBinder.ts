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
  return segments.reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number(segment);
      return Number.isInteger(index) ? current[index] : undefined;
    }

    if (typeof current === "object") {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, source);
}

function resolvePathFunction(path: string): unknown {
  const segments = path.split(".").map((segment) => segment.trim()).filter(Boolean);
  return segments.reduce<unknown>((current, segment) => {
    if (current === null || current === undefined || (typeof current !== "object" && typeof current !== "function")) {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, globalThis);
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
  const readQuotedString = (
    cursor: number,
    quote: string,
    value = ""
  ): { value: string; cursor: number } => {
    if (cursor >= condition.length) {
      throw new Error("Unterminated string literal in condition");
    }

    const current = condition[cursor] ?? "";
    if (current === "\\") {
      return readQuotedString(cursor + 2, quote, value + (condition[cursor + 1] ?? ""));
    }
    if (current === quote) {
      return { value, cursor };
    }
    return readQuotedString(cursor + 1, quote, value + current);
  };

  const scan = (index: number, tokens: ConditionToken[]): ConditionToken[] => {
    if (index >= condition.length) {
      return tokens;
    }

    const push = (type: ConditionTokenType, value: string, nextIndex: number): ConditionToken[] =>
      scan(nextIndex, [...tokens, { type, value }]);
    const char = condition[index] ?? "";

    if (/\s/.test(char)) {
      return scan(index + 1, tokens);
    }

    const twoChar = condition.slice(index, index + 2);
    if (["&&", "||", "==", "!=", ">=", "<="].includes(twoChar)) {
      return push("operator", twoChar, index + 2);
    }

    if ([">", "<", "!"].includes(char)) {
      return push("operator", char, index + 1);
    }

    if (char === "(" || char === ")") {
      return push("paren", char, index + 1);
    }

    if (char === "\"" || char === "'") {
      const quoted = readQuotedString(index + 1, char);
      return push("string", quoted.value, quoted.cursor + 1);
    }

    const numberMatch = condition.slice(index).match(/^-?\d+(?:\.\d+)?/);
    if (numberMatch) {
      return push("number", numberMatch[0], index + numberMatch[0].length);
    }

    const identifierMatch = condition.slice(index).match(/^[A-Za-z_$][\w$.]*/);
    if (identifierMatch) {
      const value = identifierMatch[0];
      if (value === "true" || value === "false") {
        return push("boolean", value, index + value.length);
      }
      if (value === "null") {
        return push("null", value, index + value.length);
      }
      return push("identifier", value, index + value.length);
    }

    throw new Error(`Unsupported token in condition near '${condition.slice(index)}'`);
  };

  return scan(0, []);
}

function resolveConditionIdentifier(name: string, scope: Record<string, unknown>): unknown {
  const segments = name.split(".").filter(Boolean);
  return segments.reduce<unknown>((current, segment) => {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, scope);
}

function evaluateConditionExpression(
  condition: string,
  value: unknown,
  cellResult: CellResult,
  binding: StateBinding
): boolean {
  const tokens = tokenizeCondition(condition);
  const cursor = { value: 0 };
  const scope = { value, cellResult, binding } as Record<string, unknown>;

  const peek = () => tokens[cursor.value];
  const consume = () => tokens[cursor.value++];
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
    const parseComparisonRest = (left: unknown): unknown => {
      const operator = matchOperator("==", "!=", ">", "<", ">=", "<=");
      if (!operator) {
        return left;
      }
      const right = parseUnary();
      const next =
        operator === "=="
          ? left == right
          : operator === "!="
            ? left != right
            : operator === ">"
              ? Number(left) > Number(right)
              : operator === "<"
                ? Number(left) < Number(right)
                : operator === ">="
                  ? Number(left) >= Number(right)
                  : Number(left) <= Number(right);
      return parseComparisonRest(next);
    };

    return parseComparisonRest(parseUnary());
  };

  const parseAnd = (): unknown => {
    const parseAndRest = (left: unknown): unknown => {
      if (!matchOperator("&&")) {
        return left;
      }
      const right = parseComparison();
      return parseAndRest(Boolean(left) && Boolean(right));
    };

    return parseAndRest(parseComparison());
  };

  const parseOr = (): unknown => {
    const parseOrRest = (left: unknown): unknown => {
      if (!matchOperator("||")) {
        return left;
      }
      const right = parseAnd();
      return parseOrRest(Boolean(left) || Boolean(right));
    };

    return parseOrRest(parseAnd());
  };

  const result = parseOr();
  if (cursor.value < tokens.length) {
    throw new Error(`Unexpected trailing token '${tokens[cursor.value]?.value ?? ""}' in condition`);
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
    await bindings.reduce<Promise<void>>(async (previous, binding) => {
      await previous;
      const sourceValue = getByPath(cellResult, binding.source);

      if (binding.condition && !this.evaluateCondition(binding.condition, sourceValue, cellResult, binding)) {
        return;
      }

      const targetValue = binding.transform
        ? this.applyTransform(binding.transform, sourceValue, cellResult, binding)
        : sourceValue;

      const oldValue = this.readSafely(binding.target);
      this.stateStore.write(binding.target, targetValue);
      await this.auditRecorder?.recordStateChange(binding.target, oldValue, targetValue);
    }, Promise.resolve());
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
