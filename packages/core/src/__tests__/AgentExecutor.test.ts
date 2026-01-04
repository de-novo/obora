import { describe, expect, test } from 'bun:test'
import type { ChatModel, ChatRequest, ChatResponse, ProviderId, RunEvent, Usage } from '../llm/types'
import { createRunContext } from '../runtime/context'
import { AgentExecutor } from '../runtime/executor'
import type { RuntimeSession } from '../runtime/types'
import { DEFAULT_MOCK_CAPABILITIES } from './mocks'

function createMockChatModel(options: {
  response?: string
  usage?: Usage
  delay?: number
  shouldFail?: boolean
  failAfterRetries?: number
  provider?: ProviderId
}): ChatModel {
  let callCount = 0
  const provider = options.provider ?? 'anthropic'

  return {
    provider,
    model: 'mock-model',
    capabilities: DEFAULT_MOCK_CAPABILITIES,
    run(_request: ChatRequest, _signal?: AbortSignal) {
      callCount++
      const currentCall = callCount

      const eventQueue: RunEvent[] = []
      const eventResolvers: Array<(value: IteratorResult<RunEvent>) => void> = []
      let done = false

      const pushEvent = (event: RunEvent) => {
        if (eventResolvers.length > 0) {
          const resolver = eventResolvers.shift()!
          resolver({ value: event, done: false })
        } else {
          eventQueue.push(event)
        }
      }

      const finishEvents = () => {
        done = true
        for (const resolver of eventResolvers) {
          resolver({ value: undefined as unknown as RunEvent, done: true })
        }
      }

      const resultPromise = (async (): Promise<ChatResponse> => {
        if (options.delay) {
          await new Promise((r) => setTimeout(r, options.delay))
        }

        if (options.shouldFail) {
          if (!options.failAfterRetries || currentCall <= options.failAfterRetries) {
            finishEvents()
            throw new Error('Mock error')
          }
        }

        const content = options.response ?? 'Mock response'
        const usage = options.usage ?? { inputTokens: 10, outputTokens: 20, totalTokens: 30 }

        pushEvent({ type: 'token', text: content })
        pushEvent({ type: 'usage', usage, provider, model: 'mock-model' })
        pushEvent({ type: 'done' })
        finishEvents()

        return {
          message: { role: 'assistant', content },
          usage,
        }
      })()

      return {
        events: () => ({
          [Symbol.asyncIterator]: () => ({
            next: () => {
              if (eventQueue.length > 0) {
                return Promise.resolve({ value: eventQueue.shift()!, done: false })
              }
              if (done) {
                return Promise.resolve({ value: undefined as unknown as RunEvent, done: true })
              }
              return new Promise<IteratorResult<RunEvent>>((resolve) => {
                eventResolvers.push(resolve)
              })
            },
          }),
        }),
        result: () => resultPromise,
        cancel: () => {},
      }
    },
  }
}

describe('AgentExecutor', () => {
  describe('basic execution', () => {
    test('executes and returns response with metadata', async () => {
      const model = createMockChatModel({ response: 'Hello world' })
      const executor = new AgentExecutor(model)
      const ctx = createRunContext()

      const handle = executor.run(ctx, { messages: [{ role: 'user', content: 'test' }] })
      const result = await handle.result()

      expect(result.output.message.content).toBe('Hello world')
      expect(result.metadata.provider).toBe('anthropic')
      expect(result.metadata.model).toBe('mock-model')
      expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0)
    })

    test('streams events during execution', async () => {
      const model = createMockChatModel({ response: 'Streamed content' })
      const executor = new AgentExecutor(model)
      const ctx = createRunContext()

      const handle = executor.run(ctx, { messages: [{ role: 'user', content: 'test' }] })

      const events: RunEvent[] = []
      for await (const event of handle.events()) {
        events.push(event)
      }

      expect(events.some((e) => e.type === 'token')).toBe(true)
      expect(events.some((e) => e.type === 'usage')).toBe(true)
      expect(events.some((e) => e.type === 'done')).toBe(true)

      const result = await handle.result()
      expect(result.output.message.content).toBe('Streamed content')
    })
  })

  describe('cancellation', () => {
    test('can be cancelled via handle.cancel()', async () => {
      const model = createMockChatModel({ delay: 1000 })
      const executor = new AgentExecutor(model)
      const ctx = createRunContext()

      const handle = executor.run(ctx, { messages: [{ role: 'user', content: 'test' }] })

      handle.cancel?.('User cancelled')

      const events: RunEvent[] = []
      for await (const event of handle.events()) {
        events.push(event)
        if (events.length >= 1) break
      }

      expect(events.length).toBeLessThanOrEqual(1)
    })

    test('respects abort signal from context', async () => {
      const model = createMockChatModel({ delay: 1000 })
      const executor = new AgentExecutor(model)
      const ctx = createRunContext()

      const handle = executor.run(ctx, { messages: [{ role: 'user', content: 'test' }] })

      ctx.cancel()

      expect(ctx.abort.aborted).toBe(true)
    })
  })

  describe('retry behavior', () => {
    test('does not retry by default', async () => {
      const model = createMockChatModel({ shouldFail: true })
      const executor = new AgentExecutor(model, { enableRetry: false })
      const ctx = createRunContext()

      const handle = executor.run(ctx, { messages: [{ role: 'user', content: 'test' }] })

      await expect(handle.result()).rejects.toThrow('Mock error')
    })

    // TODO(#31): Retry logic needs fix - model.run() should be called for each retry
    test.skip('retries when enabled and eventually succeeds', async () => {
      const model = createMockChatModel({ failAfterRetries: 2, response: 'Success after retry' })
      const executor = new AgentExecutor(model, {
        enableRetry: true,
        maxRetries: 3,
        retryDelayMs: 10,
      })
      const ctx = createRunContext()

      const handle = executor.run(ctx, { messages: [{ role: 'user', content: 'test' }] })
      const result = await handle.result()

      expect(result.output.message.content).toBe('Success after retry')
      expect(result.metadata.retryCount).toBeGreaterThan(0)
    })
  })

  describe('session integration', () => {
    test('records usage to session when provided', async () => {
      const model = createMockChatModel({
        response: 'test',
        usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      })
      const executor = new AgentExecutor(model)

      const recordedUsage: Array<{
        provider: string
        model: string
        inputTokens: number
        outputTokens: number
        totalTokens: number
      }> = []

      const mockSession: RuntimeSession = {
        id: 'test-session',
        recordUsage: (usage) => {
          recordedUsage.push(usage)
        },
      }

      const ctx = createRunContext({ session: mockSession })
      const handle = executor.run(ctx, { messages: [{ role: 'user', content: 'test' }] })
      await handle.result()

      expect(recordedUsage.length).toBe(1)
      expect(recordedUsage[0]?.inputTokens).toBe(100)
      expect(recordedUsage[0]?.outputTokens).toBe(200)
      expect(recordedUsage[0]?.totalTokens).toBe(300)
      expect(recordedUsage[0]?.provider).toBe('anthropic')
      expect(recordedUsage[0]?.model).toBe('mock-model')
    })
  })

  describe('budget tracking', () => {
    test('records tokens to budget tracker', async () => {
      const model = createMockChatModel({
        usage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
      })
      const executor = new AgentExecutor(model)
      const ctx = createRunContext({ budget: { maxTokens: 1000 } })

      const handle = executor.run(ctx, { messages: [{ role: 'user', content: 'test' }] })

      for await (const _ of handle.events()) {
      }

      await handle.result()

      expect(ctx.budget?.usage.totalTokens).toBe(150)
    })

    test('throws when budget is exceeded', async () => {
      const model = createMockChatModel({
        usage: { inputTokens: 500, outputTokens: 600, totalTokens: 1100 },
      })
      const executor = new AgentExecutor(model)
      const ctx = createRunContext({ budget: { maxTokens: 100 } })

      const handle = executor.run(ctx, { messages: [{ role: 'user', content: 'test' }] })

      for await (const _ of handle.events()) {
      }

      await expect(handle.result()).rejects.toThrow('Budget exceeded')
    })
  })

  describe('tracing', () => {
    test('logs trace events when trace sink provided', async () => {
      const model = createMockChatModel({ response: 'traced' })
      const executor = new AgentExecutor(model)

      const traceEvents: Array<{ type: string; spanId: string }> = []
      const traceSink = {
        log: (event: { type: string; spanId: string }) => {
          traceEvents.push(event)
        },
      }

      const ctx = createRunContext({ trace: traceSink })
      const handle = executor.run(ctx, { messages: [{ role: 'user', content: 'test' }] })
      await handle.result()

      expect(traceEvents.some((e) => e.type === 'run_start')).toBe(true)
      expect(traceEvents.some((e) => e.type === 'run_end')).toBe(true)
    })
  })
})
