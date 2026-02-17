import type { AgentFactory } from "./runtime.js";
import type { WorkflowStep } from "./workflow.js";

interface LLMChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

interface LLMChatResult {
  message: { role: "assistant"; content: string | null };
}

export interface LLMAdapterLike {
  chatCompletion(params: {
    model?: string;
    messages: LLMChatMessage[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<LLMChatResult>;
}

export interface StepContext {
  previousOutputs: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface StepResult {
  output: string;
  raw?: unknown;
  votes?: Array<{ participant: string; vote: "APPROVE" | "REJECT" | "REQUEST_CHANGES"; response: string }>;
}

export interface StepExecutorConfig {
  model?: string;
  verbose?: boolean;
  onEvent?: (event: "llm_request" | "llm_response" | "consensus_vote" | "consensus_result", data: unknown) => Promise<void> | void;
}

function normalizeAgentInfo(factory?: AgentFactory): { role?: string; description?: string } {
  if (!factory) return {};
  const instance = factory();
  if (!instance || typeof instance !== "object") return {};
  const value = instance as Record<string, unknown>;
  return {
    role: typeof value.role === "string" ? value.role : undefined,
    description: typeof value.description === "string" ? value.description : undefined,
  };
}

function parseVote(text: string): "APPROVE" | "REJECT" | "REQUEST_CHANGES" {
  const normalized = text.toUpperCase();
  if (normalized.includes("REQUEST_CHANGES")) return "REQUEST_CHANGES";
  if (normalized.includes("REJECT")) return "REJECT";
  if (normalized.includes("APPROVE")) return "APPROVE";
  return "REQUEST_CHANGES";
}

export class StepExecutor {
  constructor(
    private readonly llmAdapter: LLMAdapterLike,
    private readonly agents: Map<string, AgentFactory>,
    private readonly config: StepExecutorConfig = {},
  ) {}

  async executeStep(step: WorkflowStep, context: StepContext): Promise<StepResult> {
    if (step.pattern === "consensus" || step.pattern === "peer-review") {
      return this.executeConsensusStep(step, context);
    }

    const response = await this.requestForStep(step, context, step.agent);
    return {
      output: response.message.content ?? "",
      raw: response,
    };
  }

  private async executeConsensusStep(step: WorkflowStep, context: StepContext): Promise<StepResult> {
    const participants = Array.isArray(step.participants) ? step.participants : [];
    if (participants.length === 0) {
      throw new Error(`Consensus step '${step.name}' requires participants`);
    }

    const votes: Array<{ participant: string; vote: "APPROVE" | "REJECT" | "REQUEST_CHANGES"; response: string }> = [];
    for (const participant of participants) {
      const response = await this.requestForStep(step, context, participant);
      const responseText = response.message.content ?? "";
      const vote = parseVote(responseText);
      votes.push({ participant, vote, response: responseText });
      await this.config.onEvent?.("consensus_vote", { stepName: step.name, participant, vote, response: responseText });
    }

    const approveCount = votes.filter((v) => v.vote === "APPROVE").length;
    const pass = approveCount > Math.floor(votes.length / 2);
    await this.config.onEvent?.("consensus_result", {
      stepName: step.name,
      pass,
      approveCount,
      totalVotes: votes.length,
      votes,
    });

    if (!pass) {
      throw new Error(`Consensus failed for step '${step.name}' (${approveCount}/${votes.length} approvals)`);
    }

    return {
      output: votes.map((v) => `[${v.participant}] ${v.vote}: ${v.response}`).join("\n\n"),
      votes,
    };
  }

  private async requestForStep(step: WorkflowStep, context: StepContext, agentName?: string) {
    const task = this.extractTask(step);
    const systemPrompt = this.buildSystemPrompt(agentName ?? step.agent);
    const userPrompt = this.buildUserPrompt(step, task, context);

    const messages: LLMChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    await this.config.onEvent?.("llm_request", { stepName: step.name, agent: agentName ?? step.agent, messages });

    const timeoutMs = this.getStepTimeoutMs(step);
    const llmRequest = this.llmAdapter.chatCompletion({ model: this.config.model, messages });
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`LLM request timed out for step '${step.name}' after ${timeoutMs}ms`));
      }, timeoutMs);
      void llmRequest.finally(() => clearTimeout(timer));
    });

    const abortPromise = context.signal
      ? new Promise<never>((_, reject) => {
          if (context.signal?.aborted) {
            reject(new Error(`Execution aborted before LLM response for step '${step.name}'`));
            return;
          }

          context.signal?.addEventListener(
            "abort",
            () => {
              reject(new Error(`Execution aborted during step '${step.name}'`));
            },
            { once: true },
          );
        })
      : undefined;

    const response = (await Promise.race([llmRequest, timeoutPromise, ...(abortPromise ? [abortPromise] : [])])) as LLMChatResult;
    await this.config.onEvent?.("llm_response", {
      stepName: step.name,
      agent: agentName ?? step.agent,
      content: response.message.content,
    });

    return response;
  }

  private getStepTimeoutMs(step: WorkflowStep): number {
    const config = (step.config ?? {}) as Record<string, unknown>;
    const raw = config.llmTimeoutMs ?? config.timeoutMs;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return raw;
    }

    return 30_000;
  }

  private buildSystemPrompt(agentName?: string): string {
    if (!agentName) {
      return "You are a helpful AI assistant executing workflow steps.";
    }

    const info = normalizeAgentInfo(this.agents.get(agentName));
    const role = info.role ?? agentName;
    const description = info.description ?? "";
    return `You are ${role}.${description ? ` ${description}` : ""}`.trim();
  }

  private buildUserPrompt(step: WorkflowStep, task: string, context: StepContext): string {
    const dependencyContext = (step.depends_on ?? [])
      .map((name) => ({ step: name, output: context.previousOutputs[name] }))
      .filter((entry) => entry.output !== undefined);

    return [
      `Step: ${step.name}`,
      step.description ? `Description: ${step.description}` : undefined,
      "",
      "Task:",
      task,
      "",
      dependencyContext.length > 0 ? `Previous outputs:\n${JSON.stringify(dependencyContext, null, 2)}` : "Previous outputs: none",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private extractTask(step: WorkflowStep): string {
    const input = step.input;
    if (input && typeof input === "object") {
      const task = (input as Record<string, unknown>).task;
      if (typeof task === "string") {
        return task;
      }
    }

    if (step.description) {
      return step.description;
    }

    return `Execute workflow step '${step.name}'`;
  }
}
