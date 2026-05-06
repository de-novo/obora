import { describe, expect, it } from "vitest";
import { DefaultPolicyEngine } from "../DefaultPolicyEngine.js";
import { evaluateExpression } from "../expressions/ExpressionEvaluator.js";
import { parseExpression } from "../expressions/ExpressionParser.js";

const baseContext = {
  action: {
    type: "tool_call" as const,
    name: "shell_exec",
    params: { command: "cat file" },
  },
  context: {
    stepName: "deploy",
    currentCost: 7,
  },
  state: {
    knowledge: {
      score: 0.93,
    },
  },
  step: {
    name: "deploy",
    agent: "devops",
    config: {
      approval: true,
    },
  },
};

describe("Expression DSL parser", () => {
  it("parses basic comparison", () => {
    const ast = parseExpression('context.stepName == "deploy"');
    expect(ast).toMatchObject({
      type: "comparison",
      operator: "==",
      left: { type: "field_ref", path: ["context", "stepName"] },
      right: { type: "literal", value: "deploy" },
    });
  });

  it("parses logical expression", () => {
    const ast = parseExpression('action.type == "tool_call" && context.currentCost > 5');
    expect(ast).toMatchObject({
      type: "logical",
      operator: "&&",
    });
  });

  it("parses function call", () => {
    const ast = parseExpression('contains(action.name, "shell")');
    expect(ast).toMatchObject({
      type: "function_call",
      name: "contains",
    });
  });

  it("parses membership expression", () => {
    const ast = parseExpression('in(action.name, ["file_read", "file_write"])');
    expect(ast).toMatchObject({
      type: "function_call",
      name: "in",
    });
  });

  it("parses escaped strings, nulls, decimals, booleans, and mixed array literals", () => {
    expect(parseExpression("context.value == null")).toMatchObject({
      type: "comparison",
      right: { type: "literal", value: null },
    });

    const ast = parseExpression("in(action.name, ['file\\'read', null, 3.5, true])");
    expect(ast).toMatchObject({
      type: "function_call",
      name: "in",
      args: [
        { type: "field_ref", path: ["action", "name"] },
        {
          type: "array_literal",
          items: [
            { type: "literal", value: "file'read" },
            { type: "literal", value: null },
            { type: "literal", value: 3.5 },
            { type: "literal", value: true },
          ],
        },
      ],
    });
  });

  it("parses nested expressions with parentheses", () => {
    const ast = parseExpression('(context.stepName == "deploy" || context.stepName == "release") && !contains(action.name, "danger")');
    expect(ast).toMatchObject({ type: "logical", operator: "&&" });
  });

  it("parses dot notation field access", () => {
    const ast = parseExpression("state.knowledge.score >= 0.9");
    expect(ast).toMatchObject({
      type: "comparison",
      left: { type: "field_ref", path: ["state", "knowledge", "score"] },
    });
  });

  it("rejects dangerous patterns", () => {
    expect(() => parseExpression("state.__proto__.polluted == true")).toThrow("POLICY_2007");
    expect(() => parseExpression("eval(action.name)")).toThrow("POLICY_2007");
  });

  it("handles parse errors", () => {
    expect(() => parseExpression('context.stepName == "deploy" &&')).toThrow("POLICY_2007");
  });

  it("rejects empty, malformed, and unsupported expressions", () => {
    expect(() => parseExpression("")).toThrow("Expression cannot be empty");
    expect(() => parseExpression('"unterminated')).toThrow("Unterminated string");
    expect(() => parseExpression('"unterminated\\')).toThrow("Unterminated string");
    expect(() => parseExpression("context.value == 1.2.3")).toThrow("Invalid number");
    expect(() => parseExpression("tenant.value == true")).toThrow("must start with");
    expect(() => parseExpression("context.123bad == true")).toThrow("Invalid field segment");
    expect(() => parseExpression("context.stepName ?")).toThrow("Unexpected character");
    expect(() => parseExpression("contains(action.name, 'shell'")).toThrow("Expected token paren_close");
    expect(() => parseExpression("[true, false")).toThrow("Expected token bracket_close");
  });

  it("rejects deeply nested expressions beyond max depth", () => {
    const nested = `${"(".repeat(60)}context.stepName == "deploy"${")".repeat(60)}`;
    expect(() => parseExpression(nested)).toThrow("Expression nesting depth exceeds maximum (50)");
  });
});

describe("Expression DSL evaluator", () => {
  it("evaluates true expression", () => {
    const ast = parseExpression('action.type == "tool_call" && context.currentCost > 5');
    expect(evaluateExpression(ast, baseContext)).toBe(true);
  });

  it("evaluates false expression", () => {
    const ast = parseExpression('action.type == "tool_call" && context.currentCost > 100');
    expect(evaluateExpression(ast, baseContext)).toBe(false);
  });

  it("evaluates string functions", () => {
    expect(evaluateExpression(parseExpression('contains(action.name, "shell")'), baseContext)).toBe(true);
    expect(evaluateExpression(parseExpression('startsWith(action.name, "shell")'), baseContext)).toBe(true);
    expect(evaluateExpression(parseExpression('endsWith(action.name, "exec")'), baseContext)).toBe(true);
  });

  it("evaluates membership function", () => {
    const ast = parseExpression('in(action.name, ["file_read", "shell_exec"])');
    expect(evaluateExpression(ast, baseContext)).toBe(true);
  });

  it("evaluates comparison, logical, regex, and missing-field branches", () => {
    expect(evaluateExpression(parseExpression("context.currentCost >= 7"), baseContext)).toBe(true);
    expect(evaluateExpression(parseExpression("context.currentCost <= 7"), baseContext)).toBe(true);
    expect(evaluateExpression(parseExpression("context.currentCost < 8"), baseContext)).toBe(true);
    expect(evaluateExpression(parseExpression('action.name != "file_read"'), baseContext)).toBe(true);
    expect(
      evaluateExpression(
        parseExpression('context.currentCost > 10 || action.name == "shell_exec"'),
        baseContext
      )
    ).toBe(true);
    expect(evaluateExpression(parseExpression('!contains(action.name, "danger")'), baseContext)).toBe(true);
    expect(evaluateExpression(parseExpression('matches(action.name, "^shell_")'), baseContext)).toBe(true);
    expect(evaluateExpression(parseExpression('contains(context.missing, "x")'), baseContext)).toBe(false);
    expect(evaluateExpression(parseExpression('state.knowledge.score.value == "x"'), baseContext)).toBe(false);
  });

  it("evaluates optional root objects and reports evaluator errors", () => {
    const richContext = {
      ...baseContext,
      execution: {
        id: "exec-1",
        workflowName: "release",
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        elapsedMs: 10,
        totalTokens: 100,
        totalCost: 1,
        totalToolCalls: 2,
        completedSteps: ["build"],
      },
      actor: { id: "actor-1", role: "runner" },
      metrics: {
        errorCount: 0,
        retryCount: 2,
        avgStepDurationMs: 10,
        maxStepDurationMs: 20,
      },
      previousResults: {
        build: { success: true, output: { artifact: "dist" } },
      },
    };

    expect(evaluateExpression(parseExpression('execution.workflowName == "release"'), richContext)).toBe(true);
    expect(evaluateExpression(parseExpression('actor.role == "runner"'), richContext)).toBe(true);
    expect(evaluateExpression(parseExpression("metrics.retryCount == 2"), richContext)).toBe(true);
    expect(
      evaluateExpression(parseExpression("previousResults.build.success == true"), richContext)
    ).toBe(true);

    expect(() => evaluateExpression(parseExpression('context.currentCost > "3"'), baseContext)).toThrow(
      "same comparable type"
    );
    expect(() => evaluateExpression(parseExpression("contains(action.name)"), baseContext)).toThrow(
      "contains() expects 2 arguments"
    );
    expect(() => evaluateExpression(parseExpression('in(action.name, "shell_exec")'), baseContext)).toThrow(
      "in() expects an array"
    );
  });
});

describe("Expression DSL policy integration", () => {
  it("applies when.condition in tool policy", () => {
    const engine = new DefaultPolicyEngine();
    engine.loadInline({
      tools: [
        {
          name: "shell_exec",
          effect: "deny",
          when: {
            condition: 'contains(action.name, "shell") && context.currentCost > 5',
          },
        },
      ],
    });

    const decision = engine.enforce(
      {
        type: "tool_call",
        name: "shell_exec",
        params: { command: "ls" },
      },
      {
        currentCost: 10,
      },
    );

    expect(decision.type).toBe("deny");
  });

  it("raises POLICY_LOAD_FAILED for invalid conditions during load", () => {
    const engine = new DefaultPolicyEngine();

    expect(() =>
      engine.loadInline({
        tools: [
          {
            name: "shell_exec",
            effect: "deny",
            when: {
              condition: "context.stepName ==",
            },
          },
        ],
      }),
    ).toThrow("POLICY_2007");
  });

  it("records policy_condition_evaluated audit events", () => {
    const events: unknown[] = [];
    const engine = new DefaultPolicyEngine(undefined, {
      onAuditEvent: (event) => {
        events.push(event);
      },
    });

    engine.loadInline({
      tools: [
        {
          name: "shell_exec",
          effect: "deny",
          when: { condition: 'contains(action.name, "shell")' },
        },
      ],
    });

    engine.enforce({ type: "tool_call", name: "shell_exec", params: {} }, {});

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "policy_condition_evaluated",
      expression: 'contains(action.name, "shell")',
      result: true,
      rule: "tools.shell_exec",
    });
  });

  it("denies with POLICY_DENY reason when condition evaluation fails", () => {
    const engine = new DefaultPolicyEngine();
    engine.loadInline({
      tools: [
        {
          name: "shell_exec",
          effect: "deny",
          when: {
            condition: 'matches(action.name, "(")',
          },
        },
      ],
    });

    const decision = engine.enforce({ type: "tool_call", name: "shell_exec", params: {} }, {});

    expect(decision).toMatchObject({
      type: "deny",
      rule: "tools.shell_exec",
    });
    expect((decision as { reason: string }).reason).toContain("POLICY_2001");
  });

  it("denies potentially unsafe nested-quantifier regex in matches()", () => {
    const engine = new DefaultPolicyEngine();
    engine.loadInline({
      tools: [
        {
          name: "shell_exec",
          effect: "deny",
          when: {
            condition: 'matches(action.name, "(a+)+$")',
          },
        },
      ],
    });

    const decision = engine.enforce({ type: "tool_call", name: "shell_exec", params: {} }, {});
    expect(decision).toMatchObject({ type: "deny", rule: "tools.shell_exec" });
    expect((decision as { reason: string }).reason).toContain("POLICY_2001");
  });

  it("denies overlong regex patterns in matches()", () => {
    const long = "a".repeat(300);
    const engine = new DefaultPolicyEngine();
    engine.loadInline({
      tools: [
        {
          name: "shell_exec",
          effect: "deny",
          when: {
            condition: `matches(action.name, "${long}")`,
          },
        },
      ],
    });

    const decision = engine.enforce({ type: "tool_call", name: "shell_exec", params: {} }, {});
    expect(decision).toMatchObject({ type: "deny", rule: "tools.shell_exec" });
    expect((decision as { reason: string }).reason).toContain("POLICY_2001");
  });
});
