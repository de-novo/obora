import type { ChatMessage, ChatResponse } from '../llm/types'
import type { RunContext } from '../runtime/types'
import type {
  AgentConfig,
  CrossCheckConfig,
  CrossCheckInput,
  CrossCheckResult,
  Pattern,
  PatternEvent,
  PatternRunHandle,
} from './types'

const DEFAULT_JUDGE_PROMPT = `<role>
You are an impartial judge evaluating responses from multiple AI agents.
</role>

<task>
Analyze each agent's response and synthesize the best answer.
</task>

<evaluation_criteria>
- Accuracy: Is the information correct?
- Completeness: Does it fully address the question?
- Reasoning: Is the logic sound?
- Clarity: Is it well-explained?
</evaluation_criteria>

<agent_responses>
{{responses}}
</agent_responses>

<instructions>
1. Compare all responses against the evaluation criteria
2. Identify consensus points and disagreements
3. Synthesize the strongest elements into a final answer
4. If significant disagreement exists, explain your reasoning
</instructions>

<output_format>
Provide your synthesized answer directly. Be concise but thorough.
</output_format>`

function buildJudgePrompt(template: string, responses: Array<{ agentId: string; content: string }>): string {
  const responsesXml = responses
    .map(
      (r, i) => `<agent id="${r.agentId}" index="${i + 1}">
${r.content}
</agent>`,
    )
    .join('\n\n')
  return template.replace('{{responses}}', responsesXml)
}

function calculateAgreement(responses: ChatResponse[]): number {
  if (responses.length < 2) return 1.0

  const contents = responses.map((r) => (r.message?.content ?? '').toLowerCase())
  let totalSimilarity = 0
  let comparisons = 0

  for (let i = 0; i < contents.length; i++) {
    for (let j = i + 1; j < contents.length; j++) {
      const content1 = contents[i] ?? ''
      const content2 = contents[j] ?? ''
      const words1 = new Set(content1.split(/\s+/))
      const words2 = new Set(content2.split(/\s+/))
      const intersection = [...words1].filter((w) => words2.has(w)).length
      const union = new Set([...words1, ...words2]).size
      totalSimilarity += union > 0 ? intersection / union : 0
      comparisons++
    }
  }

  return comparisons > 0 ? totalSimilarity / comparisons : 1.0
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

export class CrossCheckPattern implements Pattern<CrossCheckInput, CrossCheckResult> {
  readonly name: string
  private readonly config: CrossCheckConfig

  constructor(config: CrossCheckConfig) {
    this.name = config.name || 'cross-check'
    this.config = config
  }

  run(ctx: RunContext, input: CrossCheckInput): PatternRunHandle<CrossCheckResult> {
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
    input: CrossCheckInput,
    onEvent: (event: PatternEvent) => void,
  ): Promise<CrossCheckResult> {
    const startTime = Date.now()

    const structuredPrompt = input.context
      ? `<context>\n${input.context}\n</context>\n\n<question>\n${input.prompt}\n</question>`
      : `<question>\n${input.prompt}\n</question>`

    onEvent({ type: 'phase_start', phase: 'parallel-execution' })

    const agentPromises = this.config.agents.map((agent) =>
      runAgent(agent, structuredPrompt, ctx, onEvent).then((result) => ({
        agentId: agent.id,
        ...result,
      })),
    )

    const agentResults = await Promise.all(agentPromises)

    const parallelDurationMs = Date.now() - startTime
    onEvent({ type: 'phase_end', phase: 'parallel-execution', durationMs: parallelDurationMs })

    onEvent({ type: 'phase_start', phase: 'judge-evaluation' })

    const judgePromptTemplate = this.config.judgePromptTemplate || DEFAULT_JUDGE_PROMPT
    const judgePrompt = buildJudgePrompt(
      judgePromptTemplate,
      agentResults.map((r) => ({
        agentId: r.agentId,
        content: r.response.message.content,
      })),
    )

    const fullJudgePrompt = `<original_question>\n${input.prompt}\n</original_question>\n\n${judgePrompt}`

    const { response: judgeResponse, durationMs: judgeDurationMs } = await runAgent(
      this.config.judge,
      fullJudgePrompt,
      ctx,
      onEvent,
    )

    onEvent({ type: 'phase_end', phase: 'judge-evaluation', durationMs: judgeDurationMs })

    const agreement = calculateAgreement(agentResults.map((r) => r.response))

    onEvent({ type: 'done' })

    return {
      finalAnswer: judgeResponse.message.content,
      agentResponses: agentResults.map((r) => ({
        agentId: r.agentId,
        response: r.response,
        durationMs: r.durationMs,
      })),
      judgeResponse,
      agreement,
      totalDurationMs: Date.now() - startTime,
    }
  }
}

export function createCrossCheckPattern(config: CrossCheckConfig): CrossCheckPattern {
  return new CrossCheckPattern(config)
}
