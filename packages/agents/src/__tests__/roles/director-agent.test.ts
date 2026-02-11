import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockLLMAdapter } from "../../llm/mock-adapter";
import { DirectorAgent, createDirectorAgent } from "../../roles/director-agent";
import { AgentRole, DirectorOutput, AgentContext } from "../../roles/base-agent";
import { Blackboard } from "@obora-kit/blackboard";
import { ChatMessage } from "../../llm/adapter";

describe("DirectorAgent", () => {
  let mockLlm: MockLLMAdapter;
  let blackboard: Blackboard;
  let agent: DirectorAgent;

  beforeEach(() => {
    mockLlm = new MockLLMAdapter();
    blackboard = new Blackboard();
    agent = new DirectorAgent({
      id: "director-1",
      llm: mockLlm,
    });
  });

  describe("constructor", () => {
    it("should create agent with DIRECTOR role", () => {
      expect(agent.id).toBe("director-1");
      expect(agent.role).toBe(AgentRole.DIRECTOR);
    });

    it("should have correct system prompt", () => {
      const systemPrompt = agent["getDefaultSystemPrompt"]();
      expect(systemPrompt).toContain("director agent");
      expect(systemPrompt).toContain("coordinating activities");
      expect(systemPrompt).toContain("facilitating collaboration");
    });
  });

  describe("createDirectorAgent", () => {
    it("should create director agent using factory function", () => {
      const factoryAgent = createDirectorAgent("director-factory", mockLlm);

      expect(factoryAgent).toBeInstanceOf(DirectorAgent);
      expect(factoryAgent.id).toBe("director-factory");
      expect(factoryAgent.role).toBe(AgentRole.DIRECTOR);
    });
  });

  describe("execute", () => {
    const task = {
      id: "task-1",
      type: "coordination",
      description: "Coordinate team activities",
      input: {
        content: "Coordinate team activities for project delivery",
        agenda: "Complete project milestone",
        participants: ["member1", "member2", "member3"],
      },
      priority: 1,
    };

    let context: { sessionId: string; board: Blackboard; history: ChatMessage[] };

    beforeEach(() => {
      context = {
        sessionId: "session-1",
        board: blackboard,
        history: [],
      };
    });

    it("should execute coordination task successfully", async () => {
      const jsonResponse = JSON.stringify({
        agenda: "Complete project milestone",
        participants: ["member1", "member2", "member3"],
        steps: [
          {
            step: 1,
            description: "Define requirements",
            assignee: "member1",
            dependencies: [],
            estimatedDuration: "1 day",
          },
          {
            step: 2,
            description: "Implement features",
            assignee: "member2",
            dependencies: ["requirements"],
            estimatedDuration: "3 days",
          },
        ],
        timeline: ["Day 1: Requirements", "Day 2-4: Implementation"],
        expectedOutcome: "Project milestone completed",
      });
      mockLlm.setResponse("Coordinate team activities", `\`\`\`json\n${jsonResponse}\n\`\`\``);

      const result = await agent.execute(task, context);

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect((result.output as DirectorOutput).type).toBe("coordination");
      expect((result.output as DirectorOutput).agenda).toBe("Complete project milestone");
    });

    it("should parse JSON response correctly", async () => {
      const jsonResponse = JSON.stringify({
        agenda: "Test agenda",
        participants: ["participant1", "participant2"],
        steps: [
          {
            step: 1,
            description: "Step 1",
            assignee: "participant1",
            dependencies: [],
            estimatedDuration: "1 hour",
          },
        ],
        timeline: ["Timeline 1"],
        expectedOutcome: "Test outcome",
      });
      mockLlm.setResponse("Coordinate team activities", `\`\`\`json\n${jsonResponse}\n\`\`\``);

      const result = await agent.execute(task, context);

      const output = result.output as DirectorOutput;
      expect(output.agenda).toBe("Test agenda");
      expect(output.participants).toEqual(["participant1", "participant2"]);
      expect(output.steps).toHaveLength(1);
      expect(output.steps[0].step).toBe(1);
      expect(output.steps[0].description).toBe("Step 1");
      expect(output.timeline).toEqual(["Timeline 1"]);
      expect(output.expectedOutcome).toBe("Test outcome");
    });

    it("should handle non-JSON response gracefully", async () => {
      mockLlm.setResponse("Coordinate team activities", "This is a plain text response");

      const result = await agent.execute(task, context);

      const output = result.output as DirectorOutput;
      expect(output.type).toBe("coordination");
      expect(output.agenda).toBe("This is a plain text response");
      expect(output.participants).toEqual([]);
      expect(output.steps).toEqual([]);
      expect(output.timeline).toEqual([]);
      expect(output.expectedOutcome).toBe("Coordination complete");
    });

    it("should parse JSON without markdown code block", async () => {
      mockLlm.setResponse(
        "Coordinate team activities",
        `{"agenda": "Parsed agenda", "participants": ["p1"], "steps": [], "timeline": [], "expectedOutcome": "Parsed outcome"}`
      );

      const result = await agent.execute(task, context);

      const output = result.output as DirectorOutput;
      expect(output.agenda).toBe("Parsed agenda");
      expect(output.expectedOutcome).toBe("Parsed outcome");
    });

    it("should write coordination to decisions section", async () => {
      const jsonResponse = JSON.stringify({
        agenda: "Test agenda",
        participants: ["member1"],
        steps: [],
        timeline: [],
        expectedOutcome: "Test outcome",
      });
      mockLlm.setResponse("Coordinate team activities", `\`\`\`json\n${jsonResponse}\n\`\`\``);

      await agent.execute(task, context);

      const decisions = blackboard.read("decisions", { strict: false }) as Record<
        string,
        unknown
      > | null;
      expect(decisions).toBeDefined();

      const coordinationSection = decisions?.coordination as Record<string, unknown> | undefined;
      expect(coordinationSection).toBeDefined();

      const directorKeys = Object.keys(coordinationSection ?? {}).filter((k) =>
        k.startsWith("director-1")
      );
      expect(directorKeys.length).toBeGreaterThan(0);
    });

    it("should emit coordination.started event", async () => {
      const eventSpy = vi.fn();
      blackboard.on?.("coordination.started", eventSpy);

      const jsonResponse = JSON.stringify({
        agenda: "Test agenda",
        participants: [],
        steps: [],
        timeline: [],
        expectedOutcome: "Test outcome",
      });
      mockLlm.setResponse("Coordinate team activities", `\`\`\`json\n${jsonResponse}\n\`\`\``);

      await agent.execute(task, context);

      expect(eventSpy).toHaveBeenCalled();
      const eventData = eventSpy.mock.calls[0][0];
      expect(eventData.agentId).toBe("director-1");
      expect(eventData.plan).toBeDefined();
    });

    it("should include content from original response", async () => {
      const content = "Coordination plan content";
      const jsonResponse = JSON.stringify({
        agenda: "Test agenda",
        participants: [],
        steps: [],
        timeline: [],
        expectedOutcome: "Test outcome",
      });
      mockLlm.setResponse(
        "Coordinate team activities",
        `${content}\n\`\`\`json\n${jsonResponse}\n\`\`\``
      );

      const result = await agent.execute(task, context);

      const output = result.output as DirectorOutput;
      expect(output.content).toContain(content);
    });
  });

  describe("parseResponse", () => {
    const task = {
      id: "task-1",
      type: "coordination",
      description: "Test task",
      input: {},
      priority: 1,
    };

    it("should parse markdown JSON block", () => {
      const jsonContent = JSON.stringify({
        agenda: "Test agenda",
        participants: ["participant1", "participant2"],
        steps: [
          {
            step: 1,
            description: "First step",
            assignee: "participant1",
            dependencies: [],
            estimatedDuration: "1 hour",
          },
        ],
        timeline: ["Timeline item"],
        expectedOutcome: "Expected result",
      });
      const content = `\`\`\`json\n${jsonContent}\n\`\`\``;

      const result = agent["parseResponse"](content, task);

      expect(result.type).toBe("coordination");
      expect((result as DirectorOutput).agenda).toBe("Test agenda");
      expect((result as DirectorOutput).participants).toEqual(["participant1", "participant2"]);
    });

    it("should parse plain JSON", () => {
      const jsonContent = JSON.stringify({
        agenda: "Plain agenda",
        participants: ["p1"],
        steps: [
          {
            step: 1,
            description: "Plain step",
            assignee: "p1",
            dependencies: [],
            estimatedDuration: "30 min",
          },
        ],
        timeline: ["Plain timeline"],
        expectedOutcome: "Plain outcome",
      });
      const content = jsonContent;

      const result = agent["parseResponse"](content, task);

      expect(result.type).toBe("coordination");
      expect((result as DirectorOutput).agenda).toBe("Plain agenda");
    });

    it("should handle invalid JSON", () => {
      const content = "This is not valid JSON {invalid";

      const result = agent["parseResponse"](content, task);

      expect(result.type).toBe("coordination");
      expect((result as DirectorOutput).agenda).toBe(content);
      expect((result as DirectorOutput).participants).toEqual([]);
      expect((result as DirectorOutput).steps).toEqual([]);
    });

    it("should handle empty JSON block", () => {
      const content = "\`\`\`json\n{}\n\`\`\`";

      const result = agent["parseResponse"](content, task);

      expect(result.type).toBe("coordination");
    });

    it("should parse steps with all fields", () => {
      const jsonContent = JSON.stringify({
        agenda: "Agenda",
        participants: [],
        steps: [
          {
            step: 1,
            description: "Description",
            assignee: "Assignee",
            dependencies: ["dep1", "dep2"],
            estimatedDuration: "2 hours",
          },
        ],
        timeline: [],
        expectedOutcome: "Outcome",
      });
      const content = `\`\`\`json\n${jsonContent}\n\`\`\``;

      const result = agent["parseResponse"](content, task);

      const steps = (result as DirectorOutput).steps;
      expect(steps).toHaveLength(1);
      expect(steps[0].step).toBe(1);
      expect(steps[0].description).toBe("Description");
      expect(steps[0].assignee).toBe("Assignee");
      expect(steps[0].dependencies).toEqual(["dep1", "dep2"]);
      expect(steps[0].estimatedDuration).toBe("2 hours");
    });

    it("should parse steps without optional fields", () => {
      const jsonContent = JSON.stringify({
        agenda: "Agenda",
        participants: [],
        steps: [
          {
            step: 1,
            description: "Description",
            dependencies: [],
          },
        ],
        timeline: [],
        expectedOutcome: "Outcome",
      });
      const content = `\`\`\`json\n${jsonContent}\n\`\`\``;

      const result = agent["parseResponse"](content, task);

      const steps = (result as DirectorOutput).steps;
      expect(steps[0].assignee).toBeUndefined();
      expect(steps[0].estimatedDuration).toBeUndefined();
    });
  });

  describe("act", () => {
    const task = {
      id: "task-1",
      type: "coordination",
      description: "Test task",
      input: {},
      priority: 1,
    };

    let context: { sessionId: string; board: Blackboard; history: ChatMessage[] };

    beforeEach(() => {
      context = {
        sessionId: "session-1",
        board: blackboard,
        history: [],
      };
    });

    it("should write coordination plan to decisions", async () => {
      const plan: DirectorOutput = {
        type: "coordination",
        content: "Test content",
        agenda: "Test agenda",
        participants: ["participant1", "participant2"],
        steps: [
          {
            step: 1,
            description: "Step 1",
            assignee: "participant1",
            dependencies: [],
            estimatedDuration: "1 hour",
          },
        ],
        timeline: ["Timeline 1"],
        expectedOutcome: "Test outcome",
      };

      const result = await agent["act"](plan, context);

      expect(result).toEqual(plan);

      const decisions = blackboard.read("decisions", { strict: false }) as Record<
        string,
        unknown
      > | null;
      expect(decisions).toBeDefined();
    });

    it("should emit coordination.started event", async () => {
      const eventSpy = vi.fn();
      blackboard.on?.("coordination.started", eventSpy);

      const plan: DirectorOutput = {
        type: "coordination",
        content: "Test content",
        agenda: "Test agenda",
        participants: [],
        steps: [],
        timeline: [],
        expectedOutcome: "Test outcome",
      };

      await agent["act"](plan, context);

      expect(eventSpy).toHaveBeenCalled();
      const eventData = eventSpy.mock.calls[0][0];
      expect(eventData.agentId).toBe("director-1");
      expect(eventData.plan).toBe(plan);
    });
  });

  describe("startVotingSession", () => {
    let context: { sessionId: string; board: Blackboard; history: ChatMessage[] };

    beforeEach(() => {
      context = {
        sessionId: "session-1",
        board: blackboard,
        history: [],
      };
    });

    it("should start a voting session", async () => {
      const agendaId = "agenda-1";
      const participants = ["member1", "member2", "member3"];

      await agent.startVotingSession(agendaId, participants, context);

      const decisions = blackboard.read("decisions", { strict: false }) as Record<
        string,
        unknown
      > | null;
      expect(decisions).toBeDefined();

      const voting = decisions?.voting as Record<string, unknown> | undefined;
      expect(voting).toBeDefined();

      const session = voting?.[agendaId] as Record<string, unknown> | undefined;
      expect(session).toBeDefined();
      expect(session?.started).toBeInstanceOf(Date);
      expect(session?.participants).toEqual(participants);
      expect(session?.votes).toEqual({});
      expect(session?.status).toBe("in-progress");
    });

    it("should emit voting.started event", async () => {
      const eventSpy = vi.fn();
      blackboard.on?.("voting.started", eventSpy);

      const agendaId = "agenda-1";
      const participants = ["member1", "member2"];

      await agent.startVotingSession(agendaId, participants, context);

      expect(eventSpy).toHaveBeenCalled();
      const eventData = eventSpy.mock.calls[0][0];
      expect(eventData.agendaId).toBe(agendaId);
      expect(eventData.participants).toEqual(participants);
    });
  });

  describe("tallyVotes", () => {
    let context: { sessionId: string; board: Blackboard; history: ChatMessage[] };

    beforeEach(() => {
      context = {
        sessionId: "session-1",
        board: blackboard,
        history: [],
      };
    });

    it("should tally votes from a completed session", async () => {
      const agendaId = "agenda-1";
      const votes = { option1: 3, option2: 2 };

      blackboard.write(`decisions.voting.${agendaId}`, {
        started: new Date(),
        participants: ["member1", "member2", "member3"],
        votes,
        status: "completed",
      });

      const result = await agent.tallyVotes(agendaId, context);

      expect(result).toEqual(votes);
    });

    it("should throw error if voting session not found", async () => {
      await expect(agent.tallyVotes("non-existent-agenda", context)).rejects.toThrow(
        "Voting session non-existent-agenda not found"
      );
    });

    it("should throw error if voting session not completed", async () => {
      const agendaId = "agenda-1";

      blackboard.write(`decisions.voting.${agendaId}`, {
        started: new Date(),
        participants: ["member1", "member2"],
        votes: { option1: 1 },
        status: "in-progress",
      });

      await expect(agent.tallyVotes(agendaId, context)).rejects.toThrow(
        "Voting session agenda-1 not completed"
      );
    });

    it("should return empty votes object when no votes", async () => {
      const agendaId = "agenda-1";

      blackboard.write(`decisions.voting.${agendaId}`, {
        started: new Date(),
        participants: [],
        votes: {},
        status: "completed",
      });

      const result = await agent.tallyVotes(agendaId, context);

      expect(result).toEqual({});
    });
  });
});
