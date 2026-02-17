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
  temperature?: number;
  maxTokens?: number;
  verbose?: boolean;
  resolveAgentLLM?: (
    agentName?: string,
  ) =>
    | Promise<{ adapter: LLMAdapterLike; model?: string; temperature?: number; maxTokens?: number } | undefined>
    | { adapter: LLMAdapterLike; model?: string; temperature?: number; maxTokens?: number }
    | undefined;
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

    const runConsensus = async (_timeoutSignal: AbortSignal): Promise<StepResult> => {
      const votes: Array<{ participant: string; vote: "APPROVE" | "REJECT" | "REQUEST_CHANGES"; response: string }> = [];
      const consensusSignal = this.combineAbortSignals(context.signal, _timeoutSignal);

      try {
        for (const participant of participants) {
          const response = await this.requestForStep(
            step,
            {
              ...context,
              ...(consensusSignal?.signal ? { signal: consensusSignal.signal } : { signal: _timeoutSignal }),
            },
            participant,
          );
          const responseText = response.message.content ?? "";
          const vote = parseVote(responseText);
          votes.push({ participant, vote, response: responseText });
          await this.config.onEvent?.("consensus_vote", { stepName: step.name, participant, vote, response: responseText });
        }
      } finally {
        consensusSignal?.cleanup();
      }

      const approveCount = votes.filter((v) => v.vote === "APPROVE").length;
      const quorumRule = this.getConsensusQuorumRule(step, votes.length);
      const pass = approveCount >= quorumRule.requiredApprovals;
      await this.config.onEvent?.("consensus_result", {
        stepName: step.name,
        pass,
        approveCount,
        requiredApprovals: quorumRule.requiredApprovals,
        totalVotes: votes.length,
        votes,
      });

      if (!pass) {
        throw new Error(
          `Consensus failed for step '${step.name}' (${approveCount}/${votes.length} approvals, requires ${quorumRule.description})`,
        );
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
    const resolved = await this.config.resolveAgentLLM?.(agentName ?? step.agent);
    const adapter = resolved?.adapter ?? this.llmAdapter;

    try {
      const response = await adapter.chatCompletion({
        model: resolved?.model ?? this.config.model,
        temperature: resolved?.temperature ?? this.config.temperature,
        maxTokens: resolved?.maxTokens ?? this.config.maxTokens,
        messages,
        ...(requestSignal?.signal ? { signal: requestSignal.signal } : {}),
      });
      await this.config.onEvent?.("llm_response", {
        stepName: step.name,
        agent: agentName ?? step.agent,
        content: response.message.content,
      });

      return response;
    } finally {
      requestSignal?.cleanup();
    }
  }

  private combineSignals(
    signal: AbortSignal | undefined,
    timeoutMs: number,
    stepName: string,
  ): { signal: AbortSignal; cleanup: () => void } | undefined {
    const shouldUseTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
    let timeoutController: AbortController | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (shouldUseTimeout) {
      timeoutController = new AbortController();
      timeout = setTimeout(() => {
        timeoutController?.abort(new Error(`LLM request timed out for step '${stepName}' after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    const combined = this.combineAbortSignals(signal, timeoutController?.signal);

    if (!combined) {
      return undefined;
    }

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      combined.cleanup();
    };

    return {
      signal: combined.signal,
      cleanup,
    };
  }

  private async withTimeout<T>(
    task: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => {
      timeoutController.abort(new Error(timeoutMessage));
    }, timeoutMs);

    try {
      return await Promise.race([
        task(timeoutController.signal),
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
      if (!timeoutController.signal.aborted) {
        timeoutController.abort(new Error("Timeout guard cleaned up"));
      }
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

  private getConsensusQuorumRule(
    step: WorkflowStep,
    totalVotes: number,
  ): { requiredApprovals: number; description: string } {
    const config = step.config;
    const rawQuorum = config && typeof config === "object" ? (config as Record<string, unknown>).quorum : undefined;

    if (typeof rawQuorum === "number" && Number.isFinite(rawQuorum) && rawQuorum > 0) {
      if (rawQuorum <= 1) {
        const requiredApprovals = Math.min(totalVotes, Math.max(1, Math.ceil(totalVotes * rawQuorum)));
        return {
          requiredApprovals,
          description: `${requiredApprovals}/${totalVotes} approvals (quorum=${rawQuorum})`,
        };
      }

      const requiredApprovals = Math.min(totalVotes, Math.max(1, Math.ceil(rawQuorum)));
      return {
        requiredApprovals,
        description: `${requiredApprovals}/${totalVotes} approvals (quorum=${rawQuorum})`,
      };
    }

    const requiredApprovals = Math.floor(totalVotes / 2) + 1;
    return {
      requiredApprovals,
      description: `${requiredApprovals}/${totalVotes} approvals; requires strict majority (>50%)`,
    };
  }

  private combineAbortSignals(
    ...signals: Array<AbortSignal | undefined>
  ): { signal: AbortSignal; cleanup: () => void } | undefined {
    const activeSignals = signals.filter((value): value is AbortSignal => value !== undefined);
    if (activeSignals.length === 0) {
      return undefined;
    }

    if (activeSignals.length === 1) {
      return {
        signal: activeSignals[0],
        cleanup: () => undefined,
      };
    }

    const controller = new AbortController();
    const removers: Array<() => void> = [];
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      for (const remove of removers) {
        remove();
      }
      removers.length = 0;
    };

    for (const source of activeSignals) {
      if (source.aborted) {
        cleanup();
        controller.abort(source.reason ?? new Error("Execution aborted"));
        return { signal: controller.signal, cleanup };
      }

      const onAbort = () => {
        cleanup();
        controller.abort(source.reason ?? new Error("Execution aborted"));
      };
      source.addEventListener("abort", onAbort, { once: true });
      removers.push(() => source.removeEventListener("abort", onAbort));
    }

    controller.signal.addEventListener("abort", cleanup, { once: true });

    return {
      signal: controller.signal,
      cleanup,
    };
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
