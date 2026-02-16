import { OboraErrorCode } from "../../errors/OboraErrorCode.js";

export type ExpressionAST =
  | ComparisonExpression
  | LogicalExpression
  | FunctionCallExpression
  | LiteralExpression
  | FieldRefExpression
  | NotExpression
  | ArrayLiteralExpression;

export interface ComparisonExpression {
  type: "comparison";
  operator: "==" | "!=" | ">" | ">=" | "<" | "<=";
  left: ExpressionAST;
  right: ExpressionAST;
}

export interface LogicalExpression {
  type: "logical";
  operator: "&&" | "||";
  left: ExpressionAST;
  right: ExpressionAST;
}

export interface FunctionCallExpression {
  type: "function_call";
  name: "contains" | "matches" | "startsWith" | "endsWith" | "in";
  args: ExpressionAST[];
}

export interface LiteralExpression {
  type: "literal";
  value: string | number | boolean | null;
}

export interface FieldRefExpression {
  type: "field_ref";
  path: string[];
}

export interface NotExpression {
  type: "not";
  expression: ExpressionAST;
}

export interface ArrayLiteralExpression {
  type: "array_literal";
  items: ExpressionAST[];
}

const ALLOWED_ROOTS = new Set(["action", "context", "state", "step", "execution", "actor", "metrics", "previousResults"]);
const BLOCKED_FIELD_NAMES = new Set(["__proto__", "prototype", "constructor"]);
const ALLOWED_FUNCTIONS = new Set(["contains", "matches", "startsWith", "endsWith", "in"]);

type TokenType =
  | "identifier"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "operator"
  | "paren_open"
  | "paren_close"
  | "bracket_open"
  | "bracket_close"
  | "comma"
  | "eof";

interface Token {
  type: TokenType;
  value: string;
  index: number;
}

class ExpressionParseError extends Error {
  readonly code = OboraErrorCode.POLICY_LOAD_FAILED;

  constructor(message: string) {
    super(`[${OboraErrorCode.POLICY_LOAD_FAILED}] ${message}`);
    this.name = "ExpressionParseError";
  }
}

class Tokenizer {
  private readonly input: string;
  private index = 0;

  constructor(input: string) {
    this.input = input;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (this.index < this.input.length) {
      this.skipWhitespace();
      if (this.index >= this.input.length) {
        break;
      }

      const char = this.input[this.index];
      const next = this.input[this.index + 1] ?? "";

      if (char === "(") {
        tokens.push(this.make("paren_open", char));
        this.index += 1;
        continue;
      }
      if (char === ")") {
        tokens.push(this.make("paren_close", char));
        this.index += 1;
        continue;
      }
      if (char === "[") {
        tokens.push(this.make("bracket_open", char));
        this.index += 1;
        continue;
      }
      if (char === "]") {
        tokens.push(this.make("bracket_close", char));
        this.index += 1;
        continue;
      }
      if (char === ",") {
        tokens.push(this.make("comma", char));
        this.index += 1;
        continue;
      }

      const twoChar = `${char}${next}`;
      if (["==", "!=", ">=", "<=", "&&", "||"].includes(twoChar)) {
        tokens.push(this.make("operator", twoChar));
        this.index += 2;
        continue;
      }

      if (["!", ">", "<"].includes(char)) {
        tokens.push(this.make("operator", char));
        this.index += 1;
        continue;
      }

      if (char === '"' || char === "'") {
        tokens.push(this.readString(char));
        continue;
      }

      if (/[0-9]/.test(char)) {
        tokens.push(this.readNumber());
        continue;
      }

      if (/[A-Za-z_]/.test(char)) {
        tokens.push(this.readIdentifier());
        continue;
      }

      throw new ExpressionParseError(`Unexpected character '${char}' at position ${this.index}`);
    }

    tokens.push({ type: "eof", value: "", index: this.index });
    return tokens;
  }

  private make(type: TokenType, value: string): Token {
    return { type, value, index: this.index };
  }

  private skipWhitespace(): void {
    while (this.index < this.input.length && /\s/.test(this.input[this.index])) {
      this.index += 1;
    }
  }

  private readString(quote: string): Token {
    const start = this.index;
    this.index += 1;
    let value = "";

    while (this.index < this.input.length) {
      const ch = this.input[this.index];
      if (ch === "\\") {
        const escaped = this.input[this.index + 1];
        if (escaped === undefined) {
          throw new ExpressionParseError(`Unterminated string starting at position ${start}`);
        }
        value += escaped;
        this.index += 2;
        continue;
      }
      if (ch === quote) {
        this.index += 1;
        return { type: "string", value, index: start };
      }
      value += ch;
      this.index += 1;
    }

    throw new ExpressionParseError(`Unterminated string starting at position ${start}`);
  }

  private readNumber(): Token {
    const start = this.index;
    while (this.index < this.input.length && /[0-9.]/.test(this.input[this.index])) {
      this.index += 1;
    }

    const value = this.input.slice(start, this.index);
    if (!/^\d+(\.\d+)?$/.test(value)) {
      throw new ExpressionParseError(`Invalid number '${value}' at position ${start}`);
    }

    return { type: "number", value, index: start };
  }

  private readIdentifier(): Token {
    const start = this.index;
    while (this.index < this.input.length && /[A-Za-z0-9_.]/.test(this.input[this.index])) {
      this.index += 1;
    }

    const value = this.input.slice(start, this.index);
    if (value === "true" || value === "false") {
      return { type: "boolean", value, index: start };
    }
    if (value === "null") {
      return { type: "null", value, index: start };
    }

    return { type: "identifier", value, index: start };
  }
}

class Parser {
  private readonly tokens: Token[];
  private index = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): ExpressionAST {
    const expression = this.parseOrExpression();
    this.expect("eof");
    return expression;
  }

  private parseOrExpression(): ExpressionAST {
    let left = this.parseAndExpression();

    while (this.matchOperator("||")) {
      const right = this.parseAndExpression();
      left = { type: "logical", operator: "||", left, right };
    }

    return left;
  }

  private parseAndExpression(): ExpressionAST {
    let left = this.parseUnaryExpression();

    while (this.matchOperator("&&")) {
      const right = this.parseUnaryExpression();
      left = { type: "logical", operator: "&&", left, right };
    }

    return left;
  }

  private parseUnaryExpression(): ExpressionAST {
    if (this.matchOperator("!")) {
      return { type: "not", expression: this.parseUnaryExpression() };
    }

    return this.parseComparisonExpression();
  }

  private parseComparisonExpression(): ExpressionAST {
    const left = this.parsePrimaryExpression();
    const token = this.peek();

    if (token.type === "operator" && ["==", "!=", ">", ">=", "<", "<="].includes(token.value)) {
      this.index += 1;
      const right = this.parsePrimaryExpression();
      return {
        type: "comparison",
        operator: token.value as ComparisonExpression["operator"],
        left,
        right,
      };
    }

    return left;
  }

  private parsePrimaryExpression(): ExpressionAST {
    const token = this.peek();

    if (token.type === "paren_open") {
      this.index += 1;
      const expression = this.parseOrExpression();
      this.expect("paren_close");
      return expression;
    }

    if (token.type === "string") {
      this.index += 1;
      return { type: "literal", value: token.value };
    }

    if (token.type === "number") {
      this.index += 1;
      return { type: "literal", value: Number(token.value) };
    }

    if (token.type === "boolean") {
      this.index += 1;
      return { type: "literal", value: token.value === "true" };
    }

    if (token.type === "null") {
      this.index += 1;
      return { type: "literal", value: null };
    }

    if (token.type === "bracket_open") {
      return this.parseArrayLiteral();
    }

    if (token.type === "identifier") {
      this.index += 1;
      const identifier = token.value;

      if (this.peek().type === "paren_open") {
        return this.parseFunctionCall(identifier, token.index);
      }

      return this.parseFieldRef(identifier, token.index);
    }

    throw new ExpressionParseError(`Unexpected token '${token.value}' at position ${token.index}`);
  }

  private parseArrayLiteral(): ExpressionAST {
    this.expect("bracket_open");
    const items: ExpressionAST[] = [];

    while (this.peek().type !== "bracket_close") {
      items.push(this.parsePrimaryExpression());
      if (this.peek().type === "comma") {
        this.index += 1;
      } else {
        break;
      }
    }

    this.expect("bracket_close");
    return { type: "array_literal", items };
  }

  private parseFunctionCall(name: string, index: number): FunctionCallExpression {
    if (!ALLOWED_FUNCTIONS.has(name)) {
      throw new ExpressionParseError(`Unsupported function '${name}' at position ${index}`);
    }

    this.expect("paren_open");
    const args: ExpressionAST[] = [];

    while (this.peek().type !== "paren_close") {
      args.push(this.parseOrExpression());
      if (this.peek().type === "comma") {
        this.index += 1;
      } else {
        break;
      }
    }

    this.expect("paren_close");

    return {
      type: "function_call",
      name: name as FunctionCallExpression["name"],
      args,
    };
  }

  private parseFieldRef(identifier: string, index: number): FieldRefExpression {
    const path = identifier.split(".");

    if (path.length === 0 || !ALLOWED_ROOTS.has(path[0])) {
      throw new ExpressionParseError(
        `Field reference '${identifier}' must start with action/context/state/step/execution/actor/metrics/previousResults at ${index}`,
      );
    }

    for (const segment of path) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(segment)) {
        throw new ExpressionParseError(`Invalid field segment '${segment}' in '${identifier}' at ${index}`);
      }
      if (BLOCKED_FIELD_NAMES.has(segment)) {
        throw new ExpressionParseError(`Blocked field segment '${segment}' in '${identifier}'`);
      }
    }

    return {
      type: "field_ref",
      path,
    };
  }

  private matchOperator(operator: string): boolean {
    const token = this.peek();
    if (token.type === "operator" && token.value === operator) {
      this.index += 1;
      return true;
    }

    return false;
  }

  private expect(type: TokenType): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw new ExpressionParseError(`Expected token ${type} but got '${token.value}' at position ${token.index}`);
    }
    this.index += 1;
    return token;
  }

  private peek(): Token {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1];
  }
}

export function parseExpression(expr: string): ExpressionAST {
  if (expr.trim().length === 0) {
    throw new ExpressionParseError("Expression cannot be empty");
  }

  const tokenizer = new Tokenizer(expr);
  const tokens = tokenizer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}
