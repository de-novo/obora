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
    signal?: AbortSignal;
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

    const runConsensus = async (): Promise<StepResult> => {
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
    };

    const perRequestTimeoutMs = this.getStepTimeoutMs(step);
    const consensusTimeoutMs = this.getConsensusTimeoutMs(step, participants.length, perRequestTimeoutMs);

    return this.withTimeout(runConsensus, consensusTimeoutMs, `Consensus timed out for step '${step.name}' after ${consensusTimeoutMs}ms`);
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
    const requestSignal = this.combineSignals(context.signal, timeoutMs, step.name);

    const response = await this.llmAdapter.chatCompletion({ model: this.config.model, messages, ...(requestSignal ? { signal: requestSignal } : {}) });
    await this.config.onEvent?.("llm_response", {
      stepName: step.name,
      agent: agentName ?? step.agent,
      content: response.message.content,
    });

    return response;
  }

  private combineSignals(signal: AbortSignal | undefined, timeoutMs: number, stepName: string): AbortSignal | undefined {
    const hasSignal = signal !== undefined;
    const shouldUseTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;

    if (!hasSignal && !shouldUseTimeout) {
      return undefined;
    }

    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      onAbort?.();
      onAbort = undefined;
    };

    if (shouldUseTimeout) {
      timeout = setTimeout(() => {
        cleanup();
        controller.abort(new Error(`LLM request timed out for step '${stepName}' after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    if (signal) {
      if (signal.aborted) {
        cleanup();
        controller.abort(signal.reason ?? new Error(`Execution aborted before LLM response for step '${stepName}'`));
      } else {
        const abortHandler = () => {
          cleanup();
          controller.abort(signal.reason ?? new Error(`Execution aborted during step '${stepName}'`));
        };
        signal.addEventListener("abort", abortHandler, { once: true });
        onAbort = () => signal.removeEventListener("abort", abortHandler);
      }
    }

    controller.signal.addEventListener("abort", cleanup, { once: true });
    return controller.signal;
  }

  private async withTimeout<T>(
    task: () => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => {
      timeoutController.abort(new Error(timeoutMessage));
    }, timeoutMs);

    try {
      return await Promise.race([
        task(),
        new Promise<never>((_, reject) => {
          timeoutController.signal.addEventListener(
            "abort",
            () => {
              reject(timeoutController.signal.reason ?? new Error(timeoutMessage));
            },
            { once: true },
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  private getStepTimeoutMs(step: WorkflowStep): number {
    const config = (step.config ?? {}) as Record<string, unknown>;
    const raw = config.llmTimeoutMs ?? config.timeoutMs;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return raw;
    }

    return 30_000;
  }

  private getConsensusTimeoutMs(
    step: WorkflowStep,
    participantCount: number,
    perRequestTimeoutMs: number,
  ): number {
    const config = step.config;
    const raw = config && typeof config === "object" ? (config as Record<string, unknown>).consensusTimeoutMs : undefined;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return raw;
    }

    return perRequestTimeoutMs * participantCount * 2;
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
