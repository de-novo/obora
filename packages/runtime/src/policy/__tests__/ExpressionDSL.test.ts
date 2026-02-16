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
});
