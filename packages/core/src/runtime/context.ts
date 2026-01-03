import type { ProviderId, Usage } from '../llm/types'
import { estimateCost } from '../session/pricing'
import type {
  Budget,
  BudgetTracker,
  BudgetUsage,
  RunContext,
  RunContextOptions,
  TraceContext,
  TraceSink,
} from './types'

function generateTraceId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function generateSpanId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

class DefaultTraceContext implements TraceContext {
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId?: string
  readonly path: string[]

  constructor(opts: { traceId?: string; spanId?: string; parentSpanId?: string; path?: string[] }) {
    this.traceId = opts.traceId ?? generateTraceId()
    this.spanId = opts.spanId ?? generateSpanId()
    this.parentSpanId = opts.parentSpanId
    this.path = opts.path ?? []
  }

  createChild(name: string): TraceContext {
    return new DefaultTraceContext({
      traceId: this.traceId,
      parentSpanId: this.spanId,
      path: [...this.path, name],
    })
  }

  createSibling(name?: string): TraceContext {
    const newPath = name ? [...this.path.slice(0, -1), name] : this.path
    return new DefaultTraceContext({
      traceId: this.traceId,
      parentSpanId: this.parentSpanId,
      path: newPath,
    })
  }
}

export function createTraceContext(name: string = 'root'): TraceContext {
  return new DefaultTraceContext({ path: [name] })
}

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

  const traceContext = options.parentTraceContext
    ? options.parentTraceContext.createChild(options.rootSpanName ?? 'child')
    : createTraceContext(options.rootSpanName ?? 'root')

  return {
    abort: controller.signal,
    session: options.session,
    trace: options.trace ?? new NoopTraceSink(),
    traceContext,
    budget,
    metadata: options.metadata ?? {},
    cancel: () => controller.abort(),
  }
}

export function createNoopContext(): RunContext {
  return {
    abort: new AbortController().signal,
    traceContext: createTraceContext('noop'),
    metadata: {},
  }
}

export function createChildContext(parent: RunContext, name: string): RunContext & { cancel: () => void } {
  const controller = new AbortController()

  parent.abort.addEventListener('abort', () => controller.abort(), { once: true })

  const traceContext = parent.traceContext?.createChild(name) ?? createTraceContext(name)

  return {
    abort: controller.signal,
    session: parent.session,
    trace: parent.trace,
    traceContext,
    budget: parent.budget,
    metadata: { ...parent.metadata },
    cancel: () => controller.abort(),
  }
}
