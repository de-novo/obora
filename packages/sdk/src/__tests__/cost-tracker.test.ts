import { describe, expect, it } from "vitest";

import { BudgetExceededError, CostTracker } from "../cost-tracker.js";

function createStorage() {
  const costs: any[] = [];
  return {
    async saveCost(record: any) { costs.push(record); },
    async getCosts(runId: string, stepName?: string) {
      return costs.filter((c) => c.runId === runId && (!stepName || c.stepName === stepName));
    },
    async getRunCostSummary(runId: string) {
      const rows = costs.filter((c) => c.runId === runId);
      const byStepMap = new Map<string, { stepName: string; tokens: number; costUsd: number }>();
      const byModelMap = new Map<string, { model: string; tokens: number; costUsd: number }>();
      let totalTokens = 0;
      let totalCostUsd = 0;
      for (const c of rows) {
        totalTokens += c.totalTokens;
        totalCostUsd += c.costUsd;
        const step = byStepMap.get(c.stepName) ?? { stepName: c.stepName, tokens: 0, costUsd: 0 };
        step.tokens += c.totalTokens;
        step.costUsd += c.costUsd;
        byStepMap.set(c.stepName, step);
        const model = byModelMap.get(c.model) ?? { model: c.model, tokens: 0, costUsd: 0 };
        model.tokens += c.totalTokens;
        model.costUsd += c.costUsd;
        byModelMap.set(c.model, model);
      }
      return { totalTokens, totalCostUsd, byStep: [...byStepMap.values()], byModel: [...byModelMap.values()] };
    },
  };
}

describe("CostTracker", () => {
  it("records cost with configured model pricing", async () => {
    const storage = createStorage();
    const tracker = new CostTracker(storage as any, "run-1", {
      resources: {
        pricing: [{ model: "gpt-4o", promptPer1kTokens: 0.0025, completionPer1kTokens: 0.01 }],
      },
    });

    await tracker.recordCall({
      stepName: "draft",
      model: "gpt-4o",
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      latencyMs: 120,
    });

    const summary = await tracker.runCost();
    expect(summary.totalTokens).toBe(1500);
    expect(summary.totalCostUsd).toBeCloseTo(0.0075);
  });

  it("blocks unknown model when unknownModel=block", async () => {
    const storage = createStorage();
    const tracker = new CostTracker(storage as any, "run-2", {
      resources: {
        pricing: {
          models: [],
          unknownModel: "block",
        },
      },
    });

    await expect(
      tracker.recordCall({ stepName: "draft", model: "unknown", promptTokens: 1, completionTokens: 1 }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("enforces maxCostPerRun in gate2", async () => {
    const storage = createStorage();
    const tracker = new CostTracker(storage as any, "run-3", {
      resources: {
        maxCostPerRun: 0.001,
        onBudgetExceed: "block",
        pricing: [{ model: "gpt-4o", promptPer1kTokens: 1, completionPer1kTokens: 1 }],
      },
    });

    await expect(
      tracker.recordCall({ stepName: "draft", model: "gpt-4o", promptTokens: 1, completionTokens: 1 }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("supports unknownModel=estimate with fallback pricing", async () => {
    const storage = createStorage();
    const tracker = new CostTracker(storage as any, "run-4", {
      resources: {
        pricing: {
          models: [],
          unknownModel: "estimate",
          fallbackPer1kTokens: { prompt: 0.5, completion: 1.5 },
        },
      },
    });

    await tracker.recordCall({ stepName: "draft", model: "x-unknown", promptTokens: 1000, completionTokens: 1000 });
    const summary = await tracker.runCost();
    expect(summary.totalCostUsd).toBeCloseTo(2.0);
  });

  it("preStepGate warns at 90% but does not throw in warn mode", async () => {
    const storage = createStorage();
    const tracker = new CostTracker(storage as any, "run-5", {
      resources: {
        maxCostPerRun: 1,
        onBudgetExceed: "warn",
        pricing: [{ model: "gpt-4o", promptPer1kTokens: 1, completionPer1kTokens: 0 }],
      },
    });

    await tracker.recordCall({ stepName: "draft", model: "gpt-4o", promptTokens: 900, completionTokens: 0 });
    await expect(tracker.preStepGate("review")).resolves.toBeUndefined();
  });

  it("supports array pricing + sibling unknownModel/fallback config", async () => {
    const storage = createStorage();
    const tracker = new CostTracker(storage as any, "run-6", {
      resources: {
        pricing: [],
        unknownModel: "estimate",
        fallbackPer1kTokens: { prompt: 0.25, completion: 0.75 },
      },
    });

    await tracker.recordCall({ stepName: "draft", model: "x", promptTokens: 1000, completionTokens: 1000 });
    const summary = await tracker.runCost();
    expect(summary.totalCostUsd).toBeCloseTo(1.0);
  });
});
