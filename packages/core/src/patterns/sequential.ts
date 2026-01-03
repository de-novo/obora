import type { ChatMessage, ChatResponse } from '../llm/types'
import type { RunContext } from '../runtime/types'
import type {
  AgentConfig,
  Pattern,
  PatternEvent,
  PatternRunHandle,
  SequentialConfig,
  SequentialInput,
  SequentialResult,
} from './types'

export class SequentialPattern implements Pattern<SequentialInput, SequentialResult> {
  readonly name: string
  private readonly config: SequentialConfig

  constructor(config: SequentialConfig) {
    this.name = config.name || 'sequential'
    this.config = config
  }

  run(ctx: RunContext, input: SequentialInput): PatternRunHandle<SequentialResult> {
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
    input: SequentialInput,
    onEvent: (event: PatternEvent) => void,
  ): Promise<SequentialResult> {
    const startTime = Date.now()
    const steps: SequentialResult['steps'] = []

    let currentInput = input.context
      ? `<context>\n${input.context}\n</context>\n\n<task>\n${input.prompt}\n</task>`
      : input.prompt

    onEvent({ type: 'phase_start', phase: 'sequential-execution' })

    for (let i = 0; i < this.config.agents.length; i++) {
      const agent = this.config.agents[i]!
      const stepStartTime = Date.now()

      onEvent({ type: 'agent_start', agentId: agent.id, agentName: agent.name })

      const messages: ChatMessage[] = []
      if (agent.systemPrompt) {
        messages.push({ role: 'system', content: agent.systemPrompt })
      }

      const stepPrompt =
        i > 0 && this.config.passContext !== false
          ? `<previous_output>\n${steps[i - 1]?.response.message?.content ?? ''}\n</previous_output>\n\n<current_task>\n${currentInput}\n</current_task>`
          : currentInput

      messages.push({ role: 'user', content: stepPrompt })

      const handle = agent.model.run({ messages }, ctx.abort)

      for await (const event of handle.events()) {
        onEvent({ ...event, agentId: agent.id } as PatternEvent)
      }

      const response = await handle.result()
      const durationMs = Date.now() - stepStartTime

      onEvent({ type: 'agent_end', agentId: agent.id, durationMs })

      steps.push({
        agentId: agent.id,
        input: stepPrompt,
        response,
        durationMs,
      })

      if (this.config.passContext !== false) {
        currentInput = response.message?.content ?? ''
      }
    }

    onEvent({ type: 'phase_end', phase: 'sequential-execution', durationMs: Date.now() - startTime })
    onEvent({ type: 'done' })

    const lastStep = steps[steps.length - 1]
    return {
      finalAnswer: lastStep?.response.message?.content ?? '',
      steps,
      totalDurationMs: Date.now() - startTime,
    }
  }
}

export function createSequentialPattern(config: SequentialConfig): SequentialPattern {
  return new SequentialPattern(config)
}
