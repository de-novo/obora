import { randomUUID } from "node:crypto";

import type { CostRecord, CostSummary, StorageAdapter } from "@obora/runtime";
import type { ModelPricing, OboraConfig } from "./config-loader.js";

export interface BudgetPolicies {
  maxCostPerRun?: number;
  maxTokensPerStep?: number;
  maxCostPerStep?: number;
  onBudgetExceed?: "block" | "warn";
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

export class CostTracker {
  private readonly warnedUnknownModels = new Set<string>();

  constructor(
    private readonly storage: StorageAdapter,
    private readonly runId: string,
    private readonly config?: OboraConfig,
  ) {}

  private getPolicies(): BudgetPolicies {
    return {
      maxCostPerRun: this.config?.resources?.maxCostPerRun,
      maxTokensPerStep: this.config?.resources?.maxTokensPerStep,
      maxCostPerStep: this.config?.resources?.maxCostPerStep,
      onBudgetExceed: this.config?.resources?.onBudgetExceed ?? "block",
    };
  }

  private getPricingConfig(): {
    models: ModelPricing[];
    unknownModel: "warn" | "block" | "estimate";
    fallback?: { prompt: number; completion: number };
    configured: boolean;
  } {
    const resources = this.config?.resources;
    const pricing = resources?.pricing;
    const configured = Boolean(
      resources
        && (
          Object.prototype.hasOwnProperty.call(resources, "pricing")
          || Object.prototype.hasOwnProperty.call(resources, "unknownModel")
          || Object.prototype.hasOwnProperty.call(resources, "fallbackPer1kTokens")
        )
    );

    if (Array.isArray(pricing)) {
      return {
        models: pricing,
        unknownModel: resources?.unknownModel ?? "warn",
        fallback: resources?.fallbackPer1kTokens,
        configured,
      };
    }

    if (pricing && typeof pricing === "object") {
      const obj = pricing as {
        models?: ModelPricing[];
        unknownModel?: "warn" | "block" | "estimate";
        fallbackPer1kTokens?: { prompt: number; completion: number };
      };
      return {
        models: obj.models ?? [],
        unknownModel: obj.unknownModel ?? resources?.unknownModel ?? "warn",
        fallback: obj.fallbackPer1kTokens ?? resources?.fallbackPer1kTokens,
        configured,
      };
    }

    return {
      models: [],
      unknownModel: resources?.unknownModel ?? "warn",
      fallback: resources?.fallbackPer1kTokens,
      configured,
    };
  }

  async preStepGate(stepName: string): Promise<void> {
    const policies = this.getPolicies();
    if (!policies.maxCostPerRun) return;

    const summary = await this.storage.getRunCostSummary(this.runId);
    if (summary.totalCostUsd >= policies.maxCostPerRun * 0.9) {
      const msg = `[budget] Gate1 pre-check: run cost reached 90% (${summary.totalCostUsd.toFixed(4)}/${policies.maxCostPerRun.toFixed(4)} USD) before step '${stepName}'`;
      if ((policies.onBudgetExceed ?? "block") === "block") {
        throw new BudgetExceededError(msg);
      }
      console.warn(msg);
    }
  }

  async recordCall(params: {
    stepName: string;
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    latencyMs?: number;
  }): Promise<CostRecord> {
    const pricingConfig = this.getPricingConfig();
    const policies = this.getPolicies();

    const promptTokens = params.promptTokens ?? 0;
    const completionTokens = params.completionTokens ?? 0;
    const totalTokens = params.totalTokens ?? promptTokens + completionTokens;
    const model = params.model ?? "unknown";

    const modelPricing = pricingConfig.models.find((m) => m.model === model);
    let costUsd = 0;

    if (modelPricing) {
      costUsd = (promptTokens / 1000) * modelPricing.promptPer1kTokens
        + (completionTokens / 1000) * modelPricing.completionPer1kTokens;
    } else {
      const mode = pricingConfig.unknownModel;
      if (mode === "block") {
        throw new BudgetExceededError(`[budget] Unknown model pricing blocked: '${model}'`);
      }
      if (mode === "estimate" && pricingConfig.fallback) {
        costUsd = (promptTokens / 1000) * pricingConfig.fallback.prompt
          + (completionTokens / 1000) * pricingConfig.fallback.completion;
      } else if (pricingConfig.configured && !this.warnedUnknownModels.has(model)) {
        this.warnedUnknownModels.add(model);
        console.warn(`[budget] Unknown model pricing for '${model}', cost recorded as 0 (unknownModel=warn)`);
      }
    }

    const record: CostRecord = {
      id: randomUUID(),
      runId: this.runId,
      stepName: params.stepName,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
      latencyMs: params.latencyMs ?? 0,
      createdAt: new Date().toISOString(),
    };

    await this.storage.saveCost(record);

    // Gate 2 (real-time): enforce per-step / per-run after actual cost lands
    const summary = await this.storage.getRunCostSummary(this.runId);
    const stepSummary = summary.byStep.find((s) => s.stepName === params.stepName);

    if (policies.maxTokensPerStep !== undefined && (stepSummary?.tokens ?? 0) > policies.maxTokensPerStep) {
      const msg = `[budget] Step token limit exceeded at '${params.stepName}': ${stepSummary?.tokens} > ${policies.maxTokensPerStep}`;
      if ((policies.onBudgetExceed ?? "block") === "block") throw new BudgetExceededError(msg);
      console.warn(msg);
    }

    if (policies.maxCostPerStep !== undefined && (stepSummary?.costUsd ?? 0) > policies.maxCostPerStep) {
      const msg = `[budget] Step cost limit exceeded at '${params.stepName}': ${(stepSummary?.costUsd ?? 0).toFixed(4)} > ${policies.maxCostPerStep.toFixed(4)}`;
      if ((policies.onBudgetExceed ?? "block") === "block") throw new BudgetExceededError(msg);
      console.warn(msg);
    }

    if (policies.maxCostPerRun !== undefined && summary.totalCostUsd > policies.maxCostPerRun) {
      const msg = `[budget] Run cost limit exceeded: ${summary.totalCostUsd.toFixed(4)} > ${policies.maxCostPerRun.toFixed(4)}`;
      if ((policies.onBudgetExceed ?? "block") === "block") throw new BudgetExceededError(msg);
      console.warn(msg);
    }

    return record;
  }

  async runCost(): Promise<CostSummary> {
    return this.storage.getRunCostSummary(this.runId);
  }

  async stepCost(stepName: string): Promise<CostSummary["byStep"][number] & { records: CostRecord[] }> {
    const records = await this.storage.getCosts(this.runId, stepName);
    const tokens = records.reduce((sum, r) => sum + r.totalTokens, 0);
    const costUsd = records.reduce((sum, r) => sum + r.costUsd, 0);
    return { stepName, tokens, costUsd, records };
  }
}
