import type { ChatMessage, ChatResponse } from '../llm/types'
import type { RunContext } from '../runtime/types'
import type {
  AgentConfig,
  AggregationStrategy,
  EnsembleConfig,
  EnsembleInput,
  EnsembleResult,
  Pattern,
  PatternEvent,
  PatternRunHandle,
} from './types'

const AGGREGATORS: Record<AggregationStrategy, (responses: ChatResponse[]) => string> = {
  first: (responses) => responses[0]?.message?.content ?? '',
  longest: (responses) => {
    let longest = ''
    for (const r of responses) {
      const content = r.message?.content ?? ''
      if (content.length > longest.length) longest = content
    }
    return longest
  },
  shortest: (responses) => {
    let shortest: string | null = null
    for (const r of responses) {
      const content = r.message?.content ?? ''
      if (shortest === null || content.length < shortest.length) shortest = content
    }
    return shortest ?? ''
  },
  concat: (responses) => {
    return responses.map((r, i) => `[Agent ${i + 1}]\n${r.message?.content ?? ''}`).join('\n\n')
  },
  custom: () => '',
}

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

export class EnsemblePattern implements Pattern<EnsembleInput, EnsembleResult> {
  readonly name: string
  private readonly config: EnsembleConfig

  constructor(config: EnsembleConfig) {
    this.name = config.name || 'ensemble'
    this.config = config
  }

  run(ctx: RunContext, input: EnsembleInput): PatternRunHandle<EnsembleResult> {
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
    input: EnsembleInput,
    onEvent: (event: PatternEvent) => void,
  ): Promise<EnsembleResult> {
    const startTime = Date.now()
    const prompt = input.context
      ? `<context>\n${input.context}\n</context>\n\n<question>\n${input.prompt}\n</question>`
      : `<question>\n${input.prompt}\n</question>`

    onEvent({ type: 'phase_start', phase: 'parallel-execution' })

    const agentPromises = this.config.agents.map((agent) =>
      runAgent(agent, prompt, ctx, onEvent)
        .then((result) => ({ agentId: agent.id, ...result, success: true as const }))
        .catch((error) => {
          onEvent({ type: 'error', error })
          return {
            agentId: agent.id,
            response: { message: { role: 'assistant' as const, content: '' } },
            durationMs: 0,
            success: false as const,
          }
        }),
    )

    const allResults = await Promise.all(agentPromises)
    const successfulResults = allResults.filter((r) => r.success && r.response.message?.content)

    onEvent({ type: 'phase_end', phase: 'parallel-execution', durationMs: Date.now() - startTime })

    if (successfulResults.length === 0) {
      throw new Error('All agents failed to respond')
    }

    onEvent({ type: 'phase_start', phase: 'aggregation' })

    const strategy = this.config.aggregation || 'longest'
    const aggregator =
      strategy === 'custom' && this.config.customAggregator ? this.config.customAggregator : AGGREGATORS[strategy]

    const finalAnswer = aggregator(successfulResults.map((r) => r.response))

    onEvent({ type: 'phase_end', phase: 'aggregation', durationMs: 0 })
    onEvent({ type: 'done' })

    return {
      finalAnswer,
      agentResponses: allResults.map((r) => ({
        agentId: r.agentId,
        response: r.response,
        durationMs: r.durationMs,
      })),
      aggregationStrategy: strategy,
      totalDurationMs: Date.now() - startTime,
    }
  }
}

export function createEnsemblePattern(config: EnsembleConfig): EnsemblePattern {
  return new EnsemblePattern(config)
}
