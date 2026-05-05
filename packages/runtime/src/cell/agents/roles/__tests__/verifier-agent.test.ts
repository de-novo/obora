import type { LLMAdapter } from "@obora/adapters";
import { describe, expect, it, vi } from "vitest";

import type { Blackboard } from "../../../../blackboard/core/blackboard";
import { createAgentId } from "../../../../blackboard/types";
import type { AgentContext, Task, VerifierOutput } from "../base-agent";
import { AgentRole } from "../base-agent";
import { VerifierAgent, createVerifierAgent } from "../verifier-agent";

const llm: LLMAdapter = {
  id: "mock-llm",
  chatCompletion: vi.fn(),
  streamChatCompletion: vi.fn(),
  supports: vi.fn(() => false),
};

class VerifierHarness extends VerifierAgent {
  exposeParse(content: string, task = createTask()): VerifierOutput {
    return this.parseResponse(content, task);
  }

  exposeAct(action: unknown, context: AgentContext): Promise<unknown> {
    return this.act(action, context);
  }

  exposePrompt(): string {
    return this.getDefaultSystemPrompt();
  }
}

class RecordingBoard {
  readonly writes: Array<{ path: string; value: unknown }> = [];
  readonly events: Array<{ type: string; payload: unknown }> = [];

  read(): unknown {
    return undefined;
  }

  write(path: string, value: unknown): void {
    this.writes.push({ path, value });
  }

  emit(type: string, payload: unknown): void {
    this.events.push({ type, payload });
  }
}

function createTask(): Task {
  return {
    id: "task-1",
    type: "verification",
    description: "Verify release output",
    input: { release: "0.1.0" },
    priority: 1,
  };
}

function createContext(board = new RecordingBoard()): AgentContext {
  return {
    sessionId: "session-1",
    board: board as unknown as Blackboard,
    currentTask: createTask(),
    history: [],
  };
}

describe("VerifierAgent", () => {
  it("parses fenced verifier output with score clamping and filters invalid arrays", () => {
    const agent = new VerifierHarness({ id: createAgentId("verifier-1"), llm });

    const output = agent.exposeParse(
      [
        "```json",
        "{",
        '  "passed": true,',
        '  "score": 120,',
        '  "checks": [',
        '    { "name": "types", "description": "typecheck", "evidence": "green", "status": "passed" },',
        '    { "name": "bad", "description": "bad", "evidence": "bad", "status": "unknown" },',
        '    "skip"',
        "  ],",
        '  "findings": [',
        '    { "id": "f1", "type": "bug", "description": "critical issue", "severity": "critical" },',
        '    { "id": "bad" }',
        "  ],",
        '  "suggestions": ["ship", 3]',
        "}",
        "```",
      ].join("\n"),
    );

    expect(output).toMatchObject({
      type: "verification",
      passed: true,
      score: 100,
      suggestions: ["ship"],
    });
    expect(output.checks).toHaveLength(1);
    expect(output.findings).toHaveLength(1);
  });

  it("parses loose JSON, issue aliases, invalid score strings, and fallback failures", () => {
    const agent = new VerifierHarness({ id: createAgentId("verifier-2"), llm });

    const aliased = agent.exposeParse(
      `prefix {"passed":"yes","score":"not-a-number","checks":"none","issues":[{"id":"i1","type":"risk","description":"missing evidence","severity":"high"}],"suggestions":"none"} suffix`,
    );
    expect(aliased).toMatchObject({
      passed: false,
      score: 0,
      checks: [],
      suggestions: [],
    });
    expect(aliased.findings).toHaveLength(1);

    const negativeScore = agent.exposeParse('{"passed":false,"score":"-5","issues":[]}');
    expect(negativeScore.score).toBe(0);

    expect(agent.exposeParse('"not-object"')).toMatchObject({
      passed: false,
      score: 0,
      checks: [],
      findings: [],
    });
    expect(agent.exposeParse("not json")).toMatchObject({
      passed: false,
      score: 0,
    });
  });

  it("writes verification output and emits critical events only for valid critical findings", async () => {
    const board = new RecordingBoard();
    const context = createContext(board);
    const agent = new VerifierHarness({ id: createAgentId("verifier-3"), llm });
    const verification: VerifierOutput = {
      type: "verification",
      content: "result",
      passed: false,
      score: 60,
      checks: [],
      findings: [
        { id: "f1", type: "bug", description: "breaks release", severity: " Critical " },
        { id: "f2", type: "style", description: "minor", severity: "low" },
        { id: "bad", type: "bug", description: "invalid", severity: 1 } as unknown as VerifierOutput["findings"][number],
      ],
      suggestions: [],
    };

    await expect(agent.exposeAct(verification, context)).resolves.toBe(verification);

    expect(board.writes[0]?.path).toMatch(/^knowledge\.verification\.verifier-3\.\d+$/);
    expect(board.events[0]).toMatchObject({
      type: "verification.completed",
      payload: { agentId: "verifier-3", result: verification },
    });
    expect(board.events[1]).toMatchObject({
      type: "verification.critical",
      payload: {
        agentId: "verifier-3",
        findings: [verification.findings[0]],
      },
    });

    const noFindingsBoard = new RecordingBoard();
    await agent.exposeAct({ ...verification, findings: "none" }, createContext(noFindingsBoard));
    expect(noFindingsBoard.events.map((event) => event.type)).toEqual(["verification.completed"]);
  });

  it("exposes the verifier role defaults through the convenience constructor", () => {
    const agent = createVerifierAgent("verifier-factory", llm);
    const harness = new VerifierHarness({ id: createAgentId("verifier-prompt"), llm });

    expect(agent).toBeInstanceOf(VerifierAgent);
    expect(agent.getStatus().role).toBe(AgentRole.VERIFIER);
    expect(harness.exposePrompt()).toContain("responsible for validating results");
  });
});
