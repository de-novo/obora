import type { LLMAdapter } from "@obora/adapters";
import { describe, expect, it, vi } from "vitest";

import { AgentRole } from "../base-agent";
import { AnalystAgent } from "../analyst-agent";
import { DirectorAgent } from "../director-agent";
import { ExecutorAgent, type ToolRegistryLike } from "../executor-agent";
import { VerifierAgent } from "../verifier-agent";
import { createAgent, createAgentTeam, type CreateAgentConfig } from "../factory";

const llm: LLMAdapter = {
  id: "mock-llm",
  chatCompletion: vi.fn(),
  streamChatCompletion: vi.fn(),
  supports: vi.fn(() => false),
};

const toolRegistry: ToolRegistryLike = {
  listTools: () => [{ name: "publish" }, { name: "publish" }, { name: "audit" }],
  execute: vi.fn(async () => ({ ok: true })),
};

describe("agent role factory", () => {
  it("creates concrete role agents with optional runtime metadata", () => {
    const common = {
      llm,
      systemPrompt: "custom prompt",
      provider: "openai",
      model: "gpt-test",
      sessionId: "session-1",
      enablePiRuntime: false,
    };

    const analyst = createAgent({ id: "analyst", role: "analyst", ...common });
    const executor = createAgent({ id: "executor", role: "executor", toolRegistry, ...common });
    const verifier = createAgent({ id: "verifier", role: "verifier", ...common });
    const director = createAgent({ id: "director", role: "director", ...common });

    expect(analyst).toBeInstanceOf(AnalystAgent);
    expect(executor).toBeInstanceOf(ExecutorAgent);
    expect(verifier).toBeInstanceOf(VerifierAgent);
    expect(director).toBeInstanceOf(DirectorAgent);
    expect(analyst.getStatus().role).toBe(AgentRole.ANALYST);
    expect(executor.getStatus().role).toBe(AgentRole.EXECUTOR);
    expect(verifier.getStatus().role).toBe(AgentRole.VERIFIER);
    expect(director.getStatus().role).toBe(AgentRole.DIRECTOR);
  });

  it("creates default teams and explicit role-count teams", () => {
    const defaultTeam = createAgentTeam({ llm, toolRegistry });
    expect(defaultTeam.map((agent) => agent.role)).toEqual([
      AgentRole.ANALYST,
      AgentRole.EXECUTOR,
      AgentRole.VERIFIER,
      AgentRole.DIRECTOR,
    ]);

    const explicitTeam = createAgentTeam({
      llm,
      toolRegistry,
      analysts: 2,
      executors: 0,
      verifiers: 1,
      directors: 0,
    });

    expect(explicitTeam.map((agent) => agent.id)).toEqual(["analyst-1", "analyst-2", "verifier-1"]);
    expect(explicitTeam.map((agent) => agent.role)).toEqual([
      AgentRole.ANALYST,
      AgentRole.ANALYST,
      AgentRole.VERIFIER,
    ]);
  });

  it("rejects unknown roles at the factory boundary", () => {
    expect(() =>
      createAgent({
        id: "unknown",
        role: "reviewer" as CreateAgentConfig["role"],
        llm,
      }),
    ).toThrow("Unknown agent role: reviewer");
  });
});
