#!/usr/bin/env bun

import { ClaudeProvider, GeminiProvider, OpenAIProvider } from '../src'
import type { ChatModel, ChatRequest, ChatResponse, RunEvent, RunHandle } from '../src/llm/types'
import { type AgentConfig, createCrossCheckPattern, type PatternEvent } from '../src/patterns'
import { createRunContext } from '../src/runtime'

const QUESTION = `
TypeScript에서 다음 중 어떤 방식이 더 좋은가요?

Option A: interface 사용
interface User { id: string; name: string; }

Option B: type alias 사용  
type User = { id: string; name: string; }

실무 관점에서 장단점을 분석해주세요.
`

function wrapProvider(
  provider: { stream: (prompt: string) => AsyncGenerator<any>; name: string },
  providerId: 'anthropic' | 'openai' | 'google',
): ChatModel {
  return {
    provider: providerId,
    model: provider.name,
    run(request: ChatRequest, signal?: AbortSignal): RunHandle<ChatResponse> {
      const prompt = request.messages
        .map((m) => {
          if (m.role === 'system') return `System: ${m.content}`
          if (m.role === 'user') return m.content
          if (m.role === 'assistant') return `Assistant: ${m.content}`
          return m.content
        })
        .join('\n\n')

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
          eventResolvers.shift()!({ value: event, done: false })
        } else {
          eventQueue.push(event)
        }
      }

      const runStream = async () => {
        try {
          let fullContent = ''
          for await (const chunk of provider.stream(prompt)) {
            if (signal?.aborted) throw new Error('Aborted')
            if (!chunk.done && chunk.chunk) {
              fullContent += chunk.chunk
              pushEvent({ type: 'token', text: chunk.chunk })
            }
          }
          const message = { role: 'assistant' as const, content: fullContent }
          pushEvent({ type: 'message', message })
          pushEvent({ type: 'done' })
          done = true
          resolveResult!({ message })
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
              if (eventQueue.length > 0) return Promise.resolve({ value: eventQueue.shift()!, done: false })
              if (done) return Promise.resolve({ value: undefined as unknown as RunEvent, done: true })
              return new Promise((resolve) => eventResolvers.push(resolve))
            },
          }),
        }),
        result: () => resultPromise,
      }
    },
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║        🔍 CrossCheck Pattern E2E Test                         ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  const claude = new ClaudeProvider()
  const openai = new OpenAIProvider()
  const gemini = new GeminiProvider()

  console.log('🔍 Checking provider availability...')
  const claudeOk = await claude.isAvailable()
  const openaiOk = await openai.isAvailable()
  const geminiOk = await gemini.isAvailable()

  console.log(`   Claude: ${claudeOk ? '✅' : '❌'}`)
  console.log(`   OpenAI: ${openaiOk ? '✅' : '❌'}`)
  console.log(`   Gemini: ${geminiOk ? '✅' : '❌'}`)

  const agents: AgentConfig[] = []
  if (claudeOk) agents.push({ id: 'claude', name: 'Claude', model: wrapProvider(claude, 'anthropic') })
  if (openaiOk) agents.push({ id: 'openai', name: 'OpenAI', model: wrapProvider(openai, 'openai') })
  if (geminiOk) agents.push({ id: 'gemini', name: 'Gemini', model: wrapProvider(gemini, 'google') })

  if (agents.length < 2) {
    console.log('\n⚠️  Need at least 2 available providers.')
    console.log('   Install: claude CLI, codex CLI, or gemini CLI')
    process.exit(1)
  }

  const judgeProvider = claudeOk ? claude : openaiOk ? openai : gemini
  const judgeId = claudeOk ? 'anthropic' : openaiOk ? 'openai' : 'google'

  console.log(`\n📋 Question: ${QUESTION.trim().slice(0, 80)}...`)
  console.log(`🤖 Agents: ${agents.map((a) => a.name).join(', ')}`)
  console.log(`⚖️  Judge: ${judgeProvider.name}\n`)

  const pattern = createCrossCheckPattern({
    name: 'typescript-debate',
    agents,
    judge: {
      id: 'judge',
      name: 'Judge',
      model: wrapProvider(judgeProvider, judgeId as any),
      systemPrompt: 'You are an impartial judge synthesizing expert opinions.',
    },
  })

  const ctx = createRunContext()

  console.log('─'.repeat(60))
  console.log('⏳ Running CrossCheck pattern...\n')

  const handle = pattern.run(ctx, { prompt: QUESTION })

  for await (const event of handle.events()) {
    printEvent(event)
  }

  const result = await handle.result()

  console.log('\n' + '═'.repeat(60))
  console.log('📊 RESULTS')
  console.log('═'.repeat(60))

  console.log('\n🏆 Final Answer:')
  console.log('─'.repeat(40))
  console.log(result.finalAnswer.slice(0, 500) + (result.finalAnswer.length > 500 ? '...' : ''))

  console.log('\n📈 Statistics:')
  console.log(`   Agreement Score: ${(result.agreement * 100).toFixed(1)}%`)
  console.log(`   Total Duration: ${result.totalDurationMs}ms`)

  for (const agent of result.agentResponses) {
    console.log(`   - ${agent.agentId}: ${agent.durationMs}ms`)
  }

  console.log('\n✅ CrossCheck Pattern E2E Test Complete!')
}

function printEvent(event: PatternEvent) {
  switch (event.type) {
    case 'phase_start':
      console.log(`\n📍 Phase: ${event.phase}`)
      break
    case 'phase_end':
      console.log(`   ✓ ${event.phase} completed (${event.durationMs}ms)`)
      break
    case 'agent_start':
      console.log(`   🤖 ${event.agentName || event.agentId} thinking...`)
      break
    case 'agent_end':
      console.log(`   ✓ ${event.agentId} responded (${event.durationMs}ms)`)
      break
    case 'error':
      console.error(`   ❌ Error:`, event.error)
      break
  }
}

main().catch(console.error)
