import type { ChatModel, ChatRequest, ChatResponse, RunEvent } from '../llm/types'
import type { ExecutorConfig, ExecutorResult, RunContext, RunHandle, Runnable, TraceEvent } from './types'

function generateSpanId(): string {
  return Math.random().toString(36).slice(2, 11)
}

function createTraceEvent(
  type: TraceEvent['type'],
  spanId: string,
  parentSpanId?: string,
  data?: Record<string, unknown>,
): TraceEvent {
  return {
    type,
    timestamp: Date.now(),
    spanId,
    parentSpanId,
    data,
  }
}

export class AgentExecutor implements Runnable<ChatRequest, ExecutorResult<ChatResponse>> {
  private readonly model: ChatModel
  private readonly config: ExecutorConfig

  constructor(model: ChatModel, config: ExecutorConfig = {}) {
    this.model = model
    this.config = {
      defaultTimeoutMs: 120_000,
      enableRetry: false,
      maxRetries: 3,
      retryDelayMs: 1000,
      ...config,
    }
  }

  run(ctx: RunContext, input: ChatRequest): RunHandle<ExecutorResult<ChatResponse>> {
    const spanId = generateSpanId()
    const startTime = Date.now()
    let cancelled = false

    ctx.trace?.log(
      createTraceEvent('run_start', spanId, undefined, {
        provider: this.model.provider,
        model: this.model.model,
      }),
    )

    const modelHandle = this.model.run(input, ctx.abort)

    const wrappedEvents = (async function* (self: AgentExecutor): AsyncIterable<RunEvent> {
      for await (const event of modelHandle.events()) {
        if (cancelled) break

        if (event.type === 'usage' && ctx.budget) {
          ctx.budget.recordTokens(event.usage, event.provider, event.model)
        }

        yield event
      }
    })(this)

    const result = async (): Promise<ExecutorResult<ChatResponse>> => {
      let retryCount = 0
      let lastError: unknown

      while (retryCount <= (this.config.enableRetry ? this.config.maxRetries! : 0)) {
        try {
          if (ctx.budget?.isExceeded()) {
            throw new Error('Budget exceeded')
          }

          const response = await modelHandle.result()
          const durationMs = Date.now() - startTime

          if (ctx.budget) {
            ctx.budget.recordDuration(durationMs)
          }

          if (response.usage && ctx.session) {
            ctx.session.recordUsage({
              provider: self.model.provider,
              model: self.model.model,
              inputTokens: response.usage.inputTokens,
              outputTokens: response.usage.outputTokens,
              totalTokens: response.usage.totalTokens,
            })
          }

          ctx.trace?.log(createTraceEvent('run_end', spanId, undefined, { durationMs }))

          return {
            output: response,
            metadata: {
              durationMs,
              usage: response.usage,
              provider: self.model.provider,
              model: self.model.model,
              retryCount,
            },
          }
        } catch (error) {
          lastError = error
          retryCount++

          if (retryCount <= (self.config.maxRetries ?? 0) && self.config.enableRetry) {
            ctx.trace?.log(
              createTraceEvent('error', spanId, undefined, {
                error: String(error),
                retryCount,
              }),
            )
            await new Promise((resolve) => setTimeout(resolve, self.config.retryDelayMs))
          }
        }
      }

      ctx.trace?.log(createTraceEvent('error', spanId, undefined, { error: String(lastError) }))
      throw lastError
    }

    const self = this

    return {
      events: () => wrappedEvents,
      result,
      cancel: (reason?: string) => {
        cancelled = true
        modelHandle.cancel?.(reason)
      },
    }
  }
}

export function createAgentExecutor(model: ChatModel, config?: ExecutorConfig): AgentExecutor {
  return new AgentExecutor(model, config)
}
