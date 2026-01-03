import { describe, expect, test } from 'bun:test'
import type { ChatModel, ChatRequest, ChatResponse, RunEvent } from '../llm/types'
import {
  createDebatePattern,
  createEnsemblePattern,
  createParallelPattern,
  createSequentialPattern,
  type DebateConfig,
  type EnsembleConfig,
  type ParallelConfig,
  type PatternEvent,
  type SequentialConfig,
} from '../patterns'
import { createNoopContext } from '../runtime'

function createMockModel(response: string): ChatModel {
  return {
    provider: 'openai',
    model: 'mock',
    run(_request: ChatRequest) {
      return {
        events: async function* () {
          yield { type: 'done' as const }
        },
        result: async (): Promise<ChatResponse> => ({
          message: { role: 'assistant', content: response },
        }),
      }
    },
  }
}

function createDelayedMockModel(response: string, delayMs: number): ChatModel {
  return {
    provider: 'openai',
    model: 'mock',
    run(_request: ChatRequest) {
      return {
        events: async function* () {
          yield { type: 'done' as const }
        },
        result: async (): Promise<ChatResponse> => {
          await new Promise((r) => setTimeout(r, delayMs))
          return { message: { role: 'assistant', content: response } }
        },
      }
    },
  }
}

describe('EnsemblePattern', () => {
  test('aggregates responses with longest strategy', async () => {
    const config: EnsembleConfig = {
      agents: [
        { id: 'short', model: createMockModel('Short') },
        { id: 'long', model: createMockModel('This is a much longer response') },
      ],
      aggregation: 'longest',
    }

    const pattern = createEnsemblePattern(config)
    const result = await pattern.run(createNoopContext(), { prompt: 'Test' }).result()

    expect(result.finalAnswer).toBe('This is a much longer response')
    expect(result.aggregationStrategy).toBe('longest')
    expect(result.agentResponses).toHaveLength(2)
  })

  test('aggregates responses with first strategy', async () => {
    const config: EnsembleConfig = {
      agents: [
        { id: 'first', model: createMockModel('First response') },
        { id: 'second', model: createMockModel('Second response') },
      ],
      aggregation: 'first',
    }

    const pattern = createEnsemblePattern(config)
    const result = await pattern.run(createNoopContext(), { prompt: 'Test' }).result()

    expect(result.finalAnswer).toBe('First response')
  })

  test('aggregates responses with concat strategy', async () => {
    const config: EnsembleConfig = {
      agents: [
        { id: 'a', model: createMockModel('Response A') },
        { id: 'b', model: createMockModel('Response B') },
      ],
      aggregation: 'concat',
    }

    const pattern = createEnsemblePattern(config)
    const result = await pattern.run(createNoopContext(), { prompt: 'Test' }).result()

    expect(result.finalAnswer).toContain('[Agent 1]')
    expect(result.finalAnswer).toContain('Response A')
    expect(result.finalAnswer).toContain('[Agent 2]')
    expect(result.finalAnswer).toContain('Response B')
  })

  test('supports custom aggregator', async () => {
    const config: EnsembleConfig = {
      agents: [
        { id: 'a', model: createMockModel('Hello') },
        { id: 'b', model: createMockModel('World') },
      ],
      aggregation: 'custom',
      customAggregator: (responses) => responses.map((r) => r.message?.content).join(' + '),
    }

    const pattern = createEnsemblePattern(config)
    const result = await pattern.run(createNoopContext(), { prompt: 'Test' }).result()

    expect(result.finalAnswer).toBe('Hello + World')
  })
})

describe('SequentialPattern', () => {
  test('chains agents sequentially', async () => {
    const config: SequentialConfig = {
      agents: [
        { id: 'step1', model: createMockModel('Step 1 output') },
        { id: 'step2', model: createMockModel('Step 2 output') },
        { id: 'step3', model: createMockModel('Final output') },
      ],
    }

    const pattern = createSequentialPattern(config)
    const result = await pattern.run(createNoopContext(), { prompt: 'Start' }).result()

    expect(result.finalAnswer).toBe('Final output')
    expect(result.steps).toHaveLength(3)
    expect(result.steps[0]?.agentId).toBe('step1')
    expect(result.steps[1]?.agentId).toBe('step2')
    expect(result.steps[2]?.agentId).toBe('step3')
  })

  test('passes context between steps by default', async () => {
    let step2Input = ''
    const step2Model: ChatModel = {
      provider: 'openai',
      model: 'mock',
      run(request: ChatRequest) {
        step2Input = request.messages[request.messages.length - 1]?.content ?? ''
        return {
          events: async function* () {
            yield { type: 'done' as const }
          },
          result: async (): Promise<ChatResponse> => ({
            message: { role: 'assistant', content: 'Step 2 done' },
          }),
        }
      },
    }

    const config: SequentialConfig = {
      agents: [
        { id: 'step1', model: createMockModel('Output from step 1') },
        { id: 'step2', model: step2Model },
      ],
    }

    const pattern = createSequentialPattern(config)
    await pattern.run(createNoopContext(), { prompt: 'Start' }).result()

    expect(step2Input).toContain('Output from step 1')
  })

  test('emits events in order', async () => {
    const config: SequentialConfig = {
      agents: [
        { id: 'a', model: createMockModel('A') },
        { id: 'b', model: createMockModel('B') },
      ],
    }

    const pattern = createSequentialPattern(config)
    const handle = pattern.run(createNoopContext(), { prompt: 'Test' })

    const events: PatternEvent[] = []
    for await (const event of handle.events()) {
      events.push(event)
    }

    const agentStarts = events.filter((e) => e.type === 'agent_start')
    expect(agentStarts[0]).toMatchObject({ agentId: 'a' })
    expect(agentStarts[1]).toMatchObject({ agentId: 'b' })
  })
})

describe('ParallelPattern', () => {
  test('runs agents in parallel', async () => {
    const config: ParallelConfig = {
      agents: [
        { id: 'fast', model: createDelayedMockModel('Fast', 10) },
        { id: 'slow', model: createDelayedMockModel('Slow', 50) },
      ],
    }

    const pattern = createParallelPattern(config)
    const startTime = Date.now()
    const result = await pattern.run(createNoopContext(), { prompt: 'Test' }).result()
    const duration = Date.now() - startTime

    expect(result.responses).toHaveLength(2)
    expect(duration).toBeLessThan(100)
  })

  test('handles partial failures', async () => {
    const failingModel: ChatModel = {
      provider: 'openai',
      model: 'mock',
      run() {
        return {
          events: async function* () {
            yield { type: 'done' as const }
          },
          result: async () => {
            throw new Error('Agent failed')
          },
        }
      },
    }

    const config: ParallelConfig = {
      agents: [
        { id: 'success', model: createMockModel('Success') },
        { id: 'fail', model: failingModel },
      ],
    }

    const pattern = createParallelPattern(config)
    const result = await pattern.run(createNoopContext(), { prompt: 'Test' }).result()

    expect(result.responses).toHaveLength(2)

    const successResponse = result.responses.find((r) => r.agentId === 'success')
    const failResponse = result.responses.find((r) => r.agentId === 'fail')

    expect(successResponse?.success).toBe(true)
    expect(failResponse?.success).toBe(false)
    expect(failResponse?.error).toContain('Agent failed')
  })

  test('includes all responses with metadata', async () => {
    const config: ParallelConfig = {
      agents: [
        { id: 'agent1', model: createMockModel('Response 1') },
        { id: 'agent2', model: createMockModel('Response 2') },
        { id: 'agent3', model: createMockModel('Response 3') },
      ],
    }

    const pattern = createParallelPattern(config)
    const result = await pattern.run(createNoopContext(), { prompt: 'Test' }).result()

    expect(result.responses).toHaveLength(3)
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0)

    for (const response of result.responses) {
      expect(response.agentId).toBeTruthy()
      expect(response.response.message?.content).toBeTruthy()
    }
  })
})

function createSequentialMockModel(responses: string[]): ChatModel {
  let callCount = 0
  return {
    provider: 'openai',
    model: 'mock',
    run(_request: ChatRequest) {
      const response = responses[callCount] ?? responses[responses.length - 1] ?? 'Mock response'
      callCount++
      return {
        events: async function* () {
          yield { type: 'done' as const }
        },
        result: async (): Promise<ChatResponse> => ({
          message: { role: 'assistant', content: response },
        }),
      }
    },
  }
}

describe('DebatePattern', () => {
  test('runs weak mode debate (initial + consensus only)', async () => {
    const config: DebateConfig = {
      participants: [
        { id: 'claude', name: 'Claude', model: createMockModel('I recommend Option A.') },
        { id: 'openai', name: 'OpenAI', model: createMockModel('I recommend Option B.') },
      ],
      orchestrator: { id: 'judge', name: 'Judge', model: createMockModel('Consensus: Both options have merit.') },
      mode: 'weak',
    }

    const pattern = createDebatePattern(config)
    const result = await pattern.run(createNoopContext(), { topic: 'Which option is best?' }).result()

    expect(result.mode).toBe('weak')
    expect(result.rounds).toHaveLength(3)
    expect(result.rounds[0]?.phase).toBe('initial')
    expect(result.rounds[1]?.phase).toBe('initial')
    expect(result.rounds[2]?.phase).toBe('consensus')
    expect(result.consensus).toContain('Consensus')
  })

  test('runs strong mode debate (initial + rebuttal + revised + consensus)', async () => {
    const claudeResponses = [
      'I recommend Option A for scalability.',
      'The other position overlooks cost concerns.',
      'I maintain my position on Option A.',
    ]
    const openaiResponses = [
      'I recommend Option B for simplicity.',
      'Option A has operational complexity issues.',
      'After reviewing, I have revised my position to Option A with guardrails.',
    ]

    const config: DebateConfig = {
      participants: [
        { id: 'claude', name: 'Claude', model: createSequentialMockModel(claudeResponses) },
        { id: 'openai', name: 'OpenAI', model: createSequentialMockModel(openaiResponses) },
      ],
      orchestrator: { id: 'judge', name: 'Judge', model: createMockModel('Consensus reached.') },
      mode: 'strong',
    }

    const pattern = createDebatePattern(config)
    const result = await pattern.run(createNoopContext(), { topic: 'Which option?' }).result()

    expect(result.mode).toBe('strong')
    expect(result.rounds.filter((r) => r.phase === 'initial')).toHaveLength(2)
    expect(result.rounds.filter((r) => r.phase === 'rebuttal')).toHaveLength(2)
    expect(result.rounds.filter((r) => r.phase === 'revised')).toHaveLength(2)
    expect(result.rounds.filter((r) => r.phase === 'consensus')).toHaveLength(1)
  })

  test('detects position changes', async () => {
    const claudeResponses = ['I recommend Option A.', 'Rebuttal content.', 'I maintain my position.']
    const openaiResponses = [
      'I recommend Option B.',
      'Rebuttal content.',
      'After reviewing, I have revised my position to agree with Option A.',
    ]

    const config: DebateConfig = {
      participants: [
        { id: 'claude', name: 'Claude', model: createSequentialMockModel(claudeResponses) },
        { id: 'openai', name: 'OpenAI', model: createSequentialMockModel(openaiResponses) },
      ],
      mode: 'strong',
    }

    const pattern = createDebatePattern(config)
    const result = await pattern.run(createNoopContext(), { topic: 'Test topic' }).result()

    expect(result.positionChanges).toHaveLength(1)
    expect(result.positionChanges[0]?.participant).toBe('OpenAI')
  })

  test('emits debate events', async () => {
    const config: DebateConfig = {
      participants: [
        { id: 'claude', name: 'Claude', model: createMockModel('Claude response') },
        { id: 'openai', name: 'OpenAI', model: createMockModel('OpenAI response') },
      ],
      mode: 'weak',
    }

    const pattern = createDebatePattern(config)
    const handle = pattern.run(createNoopContext(), { topic: 'Test' })

    const events: PatternEvent[] = []
    for await (const event of handle.events()) {
      events.push(event)
    }

    const phaseStarts = events.filter((e) => e.type === 'phase_start')
    const agentStarts = events.filter((e) => e.type === 'agent_start')

    expect(phaseStarts.length).toBeGreaterThanOrEqual(1)
    expect(agentStarts.length).toBeGreaterThanOrEqual(2)
  })

  test('extracts unresolved disagreements from consensus', async () => {
    const consensusWithDisagreements = `## Summary
### Points of Agreement
- Both agree on X

### Unresolved Disagreements
- Timing of migration
- Resource allocation

### Final Recommendation
Proceed carefully.`

    const config: DebateConfig = {
      participants: [
        { id: 'a', name: 'A', model: createMockModel('Position A') },
        { id: 'b', name: 'B', model: createMockModel('Position B') },
      ],
      orchestrator: { id: 'judge', name: 'Judge', model: createMockModel(consensusWithDisagreements) },
      mode: 'weak',
    }

    const pattern = createDebatePattern(config)
    const result = await pattern.run(createNoopContext(), { topic: 'Test' }).result()

    expect(result.unresolvedDisagreements).toHaveLength(2)
    expect(result.unresolvedDisagreements[0]).toContain('Timing')
  })

  test('includes metadata in result', async () => {
    const config: DebateConfig = {
      participants: [
        { id: 'a', name: 'A', model: createMockModel('Response') },
        { id: 'b', name: 'B', model: createMockModel('Response') },
      ],
      mode: 'weak',
    }

    const pattern = createDebatePattern(config)
    const result = await pattern.run(createNoopContext(), { topic: 'Test' }).result()

    expect(result.metadata.participantCount).toBe(2)
    expect(result.metadata.totalDurationMs).toBeGreaterThanOrEqual(0)
    expect(result.metadata.startTime).toBeLessThanOrEqual(result.metadata.endTime)
  })

  test('supports skills configuration', async () => {
    const config: DebateConfig = {
      participants: [
        { id: 'claude', name: 'Claude', model: createMockModel('Response with skills'), skills: ['fact-checker'] },
        { id: 'openai', name: 'OpenAI', model: createMockModel('Response') },
      ],
      skills: {
        global: ['devil-advocate'],
        participants: {
          OpenAI: ['synthesizer'],
        },
      },
      mode: 'weak',
    }

    const pattern = createDebatePattern(config)
    const result = await pattern.run(createNoopContext(), { topic: 'Test' }).result()

    expect(result.rounds).toHaveLength(2)
  })
})
