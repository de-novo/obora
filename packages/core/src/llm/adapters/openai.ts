import { OpenAIProvider, type OpenAIProviderConfig } from '../../providers/openai'
import type { StreamChunk } from '../../providers/types'
import type {
  ChatMessage,
  ChatModel,
  ChatModelCapabilities,
  ChatRequest,
  ChatResponse,
  RunEvent,
  RunHandle,
  Usage,
} from '../types'

const OPENAI_CAPABILITIES: ChatModelCapabilities = {
  structuredOutput: true,
  toolCalling: true,
  streaming: 'token',
  maxContextWindow: 128000,
  supportsSystemMessages: true,
  promptCaching: false,
  webSearch: true,
  vision: true,
}

export class OpenAIAdapter implements ChatModel {
  readonly provider = 'openai' as const
  readonly model: string
  readonly capabilities: ChatModelCapabilities = OPENAI_CAPABILITIES
  private openai: OpenAIProvider

  constructor(config: OpenAIProviderConfig = {}) {
    this.model = config.model || 'gpt-5.2'
    this.openai = new OpenAIProvider({ ...config, model: this.model })
  }

  run(request: ChatRequest, signal?: AbortSignal): RunHandle<ChatResponse> {
    const prompt = this.formatMessages(request.messages)
    let resolveResult: (value: ChatResponse) => void
    let rejectResult: (error: unknown) => void

    const resultPromise = new Promise<ChatResponse>((resolve, reject) => {
      resolveResult = resolve
      rejectResult = reject
    })

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

    const runStream = async () => {
      try {
        let fullContent = ''
        let usage: Usage | undefined

        const stream = this.openai.stream(prompt) as AsyncGenerator<StreamChunk>
        for await (const streamChunk of stream) {
          if (signal?.aborted) {
            throw new Error('Aborted')
          }

          if (!streamChunk.done && streamChunk.chunk) {
            fullContent += streamChunk.chunk
            pushEvent({ type: 'token', text: streamChunk.chunk })
          }

          if (streamChunk.done && streamChunk.usage) {
            usage = {
              inputTokens: streamChunk.usage.inputTokens || 0,
              outputTokens: streamChunk.usage.outputTokens || 0,
              totalTokens: streamChunk.usage.totalTokens || 0,
            }
          }
        }

        const message: ChatMessage = { role: 'assistant', content: fullContent }
        pushEvent({ type: 'message', message })

        if (usage) {
          pushEvent({ type: 'usage', usage, model: this.model, provider: 'openai' })
        }

        pushEvent({ type: 'done' })
        done = true

        resolveResult!({ message, usage })
      } catch (error) {
        pushEvent({ type: 'error', error })
        pushEvent({ type: 'done' })
        done = true
        rejectResult!(error)
      }

      for (const resolver of eventResolvers) {
        resolver({ value: undefined as unknown as RunEvent, done: true })
      }
    }

    runStream()

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
            return new Promise((resolve) => {
              eventResolvers.push(resolve)
            })
          },
        }),
      }),
      result: () => resultPromise,
    }
  }

  private formatMessages(messages: ChatMessage[]): string {
    return messages
      .map((m) => {
        if (m.role === 'system') return `System: ${m.content}`
        if (m.role === 'user') return `User: ${m.content}`
        if (m.role === 'assistant') return `Assistant: ${m.content}`
        return m.content
      })
      .join('\n\n')
  }
}
