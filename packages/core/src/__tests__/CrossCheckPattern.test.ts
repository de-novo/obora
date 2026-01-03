import { describe, expect, test } from 'bun:test'
import type { ChatModel, ChatRequest, ChatResponse, RunEvent } from '../llm/types'
import { type CrossCheckConfig, createCrossCheckPattern, type PatternEvent } from '../patterns'
import { createNoopContext } from '../runtime'

function createMockChatModel(name: string, response: string): ChatModel {
  return {
    provider: 'openai',
    model: 'mock-model',
    run(_request: ChatRequest, _signal?: AbortSignal) {
      const events: RunEvent[] = [
        { type: 'token', text: response },
        { type: 'message', message: { role: 'assistant', content: response } },
        { type: 'done' },
      ]

      let eventIndex = 0

      return {
        events: async function* () {
          for (const event of events) {
            yield event
            eventIndex++
          }
        },
        result: async (): Promise<ChatResponse> => ({
          message: { role: 'assistant', content: response },
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        }),
      }
    },
  }
}

describe('CrossCheckPattern', () => {
  test('should run multiple agents in parallel and judge results', async () => {
    const config: CrossCheckConfig = {
      name: 'test-cross-check',
      agents: [
        { id: 'agent-1', name: 'Agent 1', model: createMockChatModel('agent-1', 'The answer is 42.') },
        { id: 'agent-2', name: 'Agent 2', model: createMockChatModel('agent-2', 'The answer is 42.') },
        { id: 'agent-3', name: 'Agent 3', model: createMockChatModel('agent-3', 'The answer is forty-two.') },
      ],
      judge: {
        id: 'judge',
        name: 'Judge',
        model: createMockChatModel('judge', 'All agents agree: the answer is 42.'),
      },
    }

    const pattern = createCrossCheckPattern(config)
    const ctx = createNoopContext()

    const handle = pattern.run(ctx, { prompt: 'What is the meaning of life?' })
    const result = await handle.result()

    expect(result.finalAnswer).toBe('All agents agree: the answer is 42.')
    expect(result.agentResponses).toHaveLength(3)
    expect(result.agentResponses[0]?.agentId).toBe('agent-1')
    expect(result.agentResponses[1]?.agentId).toBe('agent-2')
    expect(result.agentResponses[2]?.agentId).toBe('agent-3')
    expect(result.agreement).toBeGreaterThan(0)
    expect(result.totalDurationMs).toBeGreaterThan(0)
  })

  test('should emit events during execution', async () => {
    const config: CrossCheckConfig = {
      agents: [{ id: 'agent-1', model: createMockChatModel('agent-1', 'Response 1') }],
      judge: { id: 'judge', model: createMockChatModel('judge', 'Final answer') },
    }

    const pattern = createCrossCheckPattern(config)
    const ctx = createNoopContext()

    const handle = pattern.run(ctx, { prompt: 'Test' })

    const events: PatternEvent[] = []
    for await (const event of handle.events()) {
      events.push(event)
    }

    await handle.result()

    const phaseStarts = events.filter((e) => e.type === 'phase_start')
    const phaseEnds = events.filter((e) => e.type === 'phase_end')
    const agentStarts = events.filter((e) => e.type === 'agent_start')
    const agentEnds = events.filter((e) => e.type === 'agent_end')

    expect(phaseStarts).toHaveLength(2)
    expect(phaseEnds).toHaveLength(2)
    expect(agentStarts).toHaveLength(2)
    expect(agentEnds).toHaveLength(2)
  })

  test('should use custom judge prompt template', async () => {
    let judgeReceivedPrompt = ''

    const mockJudgeModel: ChatModel = {
      provider: 'anthropic',
      model: 'mock-judge',
      run(request: ChatRequest) {
        judgeReceivedPrompt = request.messages[request.messages.length - 1]?.content ?? ''
        return {
          events: async function* () {
            yield { type: 'done' as const }
          },
          result: async (): Promise<ChatResponse> => ({
            message: { role: 'assistant', content: 'Custom judged response' },
          }),
        }
      },
    }

    const config: CrossCheckConfig = {
      agents: [{ id: 'agent-1', model: createMockChatModel('agent-1', 'Agent response') }],
      judge: { id: 'judge', model: mockJudgeModel },
      judgePromptTemplate: 'CUSTOM TEMPLATE: {{responses}}',
    }

    const pattern = createCrossCheckPattern(config)
    const ctx = createNoopContext()

    await pattern.run(ctx, { prompt: 'Test question' }).result()

    expect(judgeReceivedPrompt).toContain('CUSTOM TEMPLATE:')
    expect(judgeReceivedPrompt).toContain('Agent response')
  })

  test('should calculate agreement score', async () => {
    const config: CrossCheckConfig = {
      agents: [
        { id: 'agent-1', model: createMockChatModel('agent-1', 'The sky is blue') },
        { id: 'agent-2', model: createMockChatModel('agent-2', 'The sky is blue today') },
      ],
      judge: { id: 'judge', model: createMockChatModel('judge', 'Consensus: sky is blue') },
    }

    const pattern = createCrossCheckPattern(config)
    const ctx = createNoopContext()

    const result = await pattern.run(ctx, { prompt: 'What color is the sky?' }).result()

    expect(result.agreement).toBeGreaterThan(0.5)
    expect(result.agreement).toBeLessThanOrEqual(1)
  })

  test('should include context in structured prompt', async () => {
    let receivedPrompt = ''

    const mockModel: ChatModel = {
      provider: 'openai',
      model: 'mock',
      run(request: ChatRequest) {
        receivedPrompt = request.messages[request.messages.length - 1]?.content ?? ''
        return {
          events: async function* () {
            yield { type: 'done' as const }
          },
          result: async (): Promise<ChatResponse> => ({
            message: { role: 'assistant', content: 'Response' },
          }),
        }
      },
    }

    const config: CrossCheckConfig = {
      agents: [{ id: 'agent-1', model: mockModel }],
      judge: { id: 'judge', model: createMockChatModel('judge', 'Final') },
    }

    const pattern = createCrossCheckPattern(config)
    const ctx = createNoopContext()

    await pattern.run(ctx, { prompt: 'Question?', context: 'Background info' }).result()

    expect(receivedPrompt).toContain('<context>')
    expect(receivedPrompt).toContain('Background info')
    expect(receivedPrompt).toContain('<question>')
    expect(receivedPrompt).toContain('Question?')
  })
})
