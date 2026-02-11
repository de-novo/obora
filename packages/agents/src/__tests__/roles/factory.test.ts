import { describe, it, expect, beforeEach } from "vitest";
import { MockLLMAdapter } from "../../llm/mock-adapter";
import { createAgent, createAgentTeam } from "../../roles/factory";
import { BaseAgent, AnalystAgent, ExecutorAgent, VerifierAgent, DirectorAgent } from "../../roles";
import { AgentRole } from "../../roles/base-agent";

describe("factory", () => {
  let mockLlm: MockLLMAdapter;

  beforeEach(() => {
    mockLlm = new MockLLMAdapter();
  });

  describe("createAgent", () => {
    it("should create analyst agent", () => {
      const agent = createAgent({
        id: "analyst-1",
        role: "analyst",
        llm: mockLlm,
      });

      expect(agent).toBeInstanceOf(AnalystAgent);
      expect(agent.id).toBe("analyst-1");
      expect(agent.role).toBe(AgentRole.ANALYST);
    });

    it("should create executor agent", () => {
      const agent = createAgent({
        id: "executor-1",
        role: "executor",
        llm: mockLlm,
      });

      expect(agent).toBeInstanceOf(ExecutorAgent);
      expect(agent.id).toBe("executor-1");
      expect(agent.role).toBe(AgentRole.EXECUTOR);
    });

    it("should create verifier agent", () => {
      const agent = createAgent({
        id: "verifier-1",
        role: "verifier",
        llm: mockLlm,
      });

      expect(agent).toBeInstanceOf(VerifierAgent);
      expect(agent.id).toBe("verifier-1");
      expect(agent.role).toBe(AgentRole.VERIFIER);
    });

    it("should create director agent", () => {
      const agent = createAgent({
        id: "director-1",
        role: "director",
        llm: mockLlm,
      });

      expect(agent).toBeInstanceOf(DirectorAgent);
      expect(agent.id).toBe("director-1");
      expect(agent.role).toBe(AgentRole.DIRECTOR);
    });

    it("should throw error for unknown role", () => {
      expect(() => {
        createAgent({
          id: "unknown-1",
          role: "unknown" as any,
          llm: mockLlm,
        });
      }).toThrow("Unknown agent role: unknown");
    });

    it("should create agent with BaseAgent type", () => {
      const agent = createAgent({
        id: "base-1",
        role: "analyst",
        llm: mockLlm,
      });

      expect(agent).toBeInstanceOf(BaseAgent);
    });
  });

  describe("createAgentTeam", () => {
    it("should create default team (1 of each role)", () => {
      const team = createAgentTeam({
        llm: mockLlm,
      });

      expect(team).toHaveLength(4);
      expect(team[0].role).toBe(AgentRole.ANALYST);
      expect(team[1].role).toBe(AgentRole.EXECUTOR);
      expect(team[2].role).toBe(AgentRole.VERIFIER);
      expect(team[3].role).toBe(AgentRole.DIRECTOR);
    });

    it("should create team with multiple analysts", () => {
      const team = createAgentTeam({
        llm: mockLlm,
        analysts: 3,
      });

      const analysts = team.filter((a) => a.role === AgentRole.ANALYST);
      expect(analysts).toHaveLength(3);
      expect(analysts[0].id).toBe("analyst-1");
      expect(analysts[1].id).toBe("analyst-2");
      expect(analysts[2].id).toBe("analyst-3");
    });

    it("should create team with multiple executors", () => {
      const team = createAgentTeam({
        llm: mockLlm,
        executors: 2,
      });

      const executors = team.filter((a) => a.role === AgentRole.EXECUTOR);
      expect(executors).toHaveLength(2);
      expect(executors[0].id).toBe("executor-1");
      expect(executors[1].id).toBe("executor-2");
    });

    it("should create team with multiple verifiers", () => {
      const team = createAgentTeam({
        llm: mockLlm,
        verifiers: 2,
      });

      const verifiers = team.filter((a) => a.role === AgentRole.VERIFIER);
      expect(verifiers).toHaveLength(2);
      expect(verifiers[0].id).toBe("verifier-1");
      expect(verifiers[1].id).toBe("verifier-2");
    });

    it("should create team with multiple directors", () => {
      const team = createAgentTeam({
        llm: mockLlm,
        directors: 2,
      });

      const directors = team.filter((a) => a.role === AgentRole.DIRECTOR);
      expect(directors).toHaveLength(2);
      expect(directors[0].id).toBe("director-1");
      expect(directors[1].id).toBe("director-2");
    });

    it("should create team with mixed agent counts", () => {
      const team = createAgentTeam({
        llm: mockLlm,
        analysts: 2,
        executors: 3,
        verifiers: 1,
        directors: 1,
      });

      expect(team).toHaveLength(7);

      const analysts = team.filter((a) => a.role === AgentRole.ANALYST);
      const executors = team.filter((a) => a.role === AgentRole.EXECUTOR);
      const verifiers = team.filter((a) => a.role === AgentRole.VERIFIER);
      const directors = team.filter((a) => a.role === AgentRole.DIRECTOR);

      expect(analysts).toHaveLength(2);
      expect(executors).toHaveLength(3);
      expect(verifiers).toHaveLength(1);
      expect(directors).toHaveLength(1);
    });

    it("should create team without any agents when counts are zero", () => {
      const team = createAgentTeam({
        llm: mockLlm,
        analysts: 0,
        executors: 0,
        verifiers: 0,
        directors: 0,
      });

      expect(team).toHaveLength(0);
    });

    it("should create team with only analysts", () => {
      const team = createAgentTeam({
        llm: mockLlm,
        analysts: 2,
      });

      expect(team).toHaveLength(2);
      expect(team.every((a) => a.role === AgentRole.ANALYST)).toBe(true);
    });

    it("should create agents with correct role types", () => {
      const team = createAgentTeam({
        llm: mockLlm,
        analysts: 1,
        executors: 1,
        verifiers: 1,
        directors: 1,
      });

      const [analyst, executor, verifier, director] = team;

      expect(analyst).toBeInstanceOf(AnalystAgent);
      expect(executor).toBeInstanceOf(ExecutorAgent);
      expect(verifier).toBeInstanceOf(VerifierAgent);
      expect(director).toBeInstanceOf(DirectorAgent);
    });
  });
});
