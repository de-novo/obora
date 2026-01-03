import type { ChatMessage, ChatResponse } from '../llm/types'
import type { RunContext } from '../runtime/types'
import type {
  AgentConfig,
  ParallelConfig,
  ParallelInput,
  ParallelResult,
  Pattern,
  PatternEvent,
  PatternRunHandle,
} from './types'

async function runAgent(
  agent: AgentConfig,
  prompt: string,
  ctx: RunContext,
  onEvent: (event: PatternEvent) => void,
): Promise<{ response: ChatResponse; durationMs: number }> {
  const startTime = Date.now()
  onEvent({ type: 'agent_start', agentId: agent.id, agentName: agent.name })

  const messages: ChatMessage[] = []
  if (agent.systemPrompt) {
    messages.push({ role: 'system', content: agent.systemPrompt })
  }
  messages.push({ role: 'user', content: prompt })

  const handle = agent.model.run({ messages }, ctx.abort)

  for await (const event of handle.events()) {
    onEvent({ ...event, agentId: agent.id } as PatternEvent)
  }

  const response = await handle.result()
  const durationMs = Date.now() - startTime

  onEvent({ type: 'agent_end', agentId: agent.id, durationMs })
  return { response, durationMs }
}

export class ParallelPattern implements Pattern<ParallelInput, ParallelResult> {
  readonly name: string
  private readonly config: ParallelConfig

  constructor(config: ParallelConfig) {
    this.name = config.name || 'parallel'
    this.config = config
  }

  run(ctx: RunContext, input: ParallelInput): PatternRunHandle<ParallelResult> {
    const eventQueue: PatternEvent[] = []
    let resolveEvents: (() => void) | null = null
    let done = false

    const pushEvent = (event: PatternEvent) => {
      eventQueue.push(event)
      resolveEvents?.()
    }

    const events = async function* (): AsyncIterable<PatternEvent> {
      while (!done || eventQueue.length > 0) {
        if (eventQueue.length > 0) {
          yield eventQueue.shift()!
        } else {
          await new Promise<void>((resolve) => {
            resolveEvents = resolve
          })
        }
      }
    }

    const resultPromise = this.execute(ctx, input, pushEvent).finally(() => {
      done = true
      resolveEvents?.()
    })

    return {
      events,
      result: () => resultPromise,
      cancel: () => ctx.abort,
    }
  }

  private async execute(
    ctx: RunContext,
    input: ParallelInput,
    onEvent: (event: PatternEvent) => void,
  ): Promise<ParallelResult> {
    const startTime = Date.now()
    const prompt = input.context
      ? `<context>\n${input.context}\n</context>\n\n<task>\n${input.prompt}\n</task>`
      : input.prompt

    onEvent({ type: 'phase_start', phase: 'parallel-execution' })

    const agentPromises = this.config.agents.map((agent) =>
      runAgent(agent, prompt, ctx, onEvent)
        .then((result) => ({
          agentId: agent.id,
          response: result.response,
          durationMs: result.durationMs,
          success: true as const,
        }))
        .catch((error) => {
          onEvent({ type: 'error', error })
          return {
            agentId: agent.id,
            response: { message: { role: 'assistant' as const, content: '' } } as ChatResponse,
            durationMs: 0,
            success: false as const,
            error: String(error),
          }
        }),
    )

    const responses = await Promise.all(agentPromises)

    onEvent({ type: 'phase_end', phase: 'parallel-execution', durationMs: Date.now() - startTime })
    onEvent({ type: 'done' })

    return {
      responses,
      totalDurationMs: Date.now() - startTime,
    }
  }
}

export function createParallelPattern(config: ParallelConfig): ParallelPattern {
  return new ParallelPattern(config)
}
