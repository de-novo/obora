import type { ProviderId, Usage } from '../llm/types'
import { estimateCost } from '../session/pricing'
import type { Budget, BudgetTracker, BudgetUsage, RunContext, RunContextOptions, TraceSink } from './types'

class DefaultBudgetTracker implements BudgetTracker {
  private readonly limits: Budget
  private currentUsage: BudgetUsage = {
    totalTokens: 0,
    estimatedCostUsd: 0,
    durationMs: 0,
  }

  constructor(limits: Budget) {
    this.limits = limits
  }

  get usage(): BudgetUsage {
    return { ...this.currentUsage }
  }

  isExceeded(): boolean {
    if (this.limits.maxTokens && this.currentUsage.totalTokens > this.limits.maxTokens) {
      return true
    }
    if (this.limits.maxCostUsd && this.currentUsage.estimatedCostUsd > this.limits.maxCostUsd) {
      return true
    }
    if (this.limits.maxDurationMs && this.currentUsage.durationMs > this.limits.maxDurationMs) {
      return true
    }
    return false
  }

  recordTokens(usage: Usage, provider: ProviderId, model: string): void {
    this.currentUsage.totalTokens += usage.totalTokens

    const cost = estimateCost(provider, model, usage.inputTokens, usage.outputTokens)
    if (cost !== null) {
      this.currentUsage.estimatedCostUsd += cost
    }
  }

  recordDuration(durationMs: number): void {
    this.currentUsage.durationMs += durationMs
  }
}

class NoopTraceSink implements TraceSink {
  log(): void {}
}

export function createRunContext(options: RunContextOptions = {}): RunContext & { cancel: () => void } {
  const controller = new AbortController()

  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  const budget = options.budget ? new DefaultBudgetTracker(options.budget) : undefined

  return {
    abort: controller.signal,
    session: options.session,
    trace: options.trace ?? new NoopTraceSink(),
    budget,
    metadata: options.metadata ?? {},
    cancel: () => controller.abort(),
  }
}

export function createNoopContext(): RunContext {
  return {
    abort: new AbortController().signal,
    metadata: {},
  }
}
