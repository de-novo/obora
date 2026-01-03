#!/usr/bin/env bun

import { ClaudeProvider, GeminiProvider, OpenAIProvider } from '../src'
import type { ChatModel, ChatRequest, ChatResponse, RunEvent, RunHandle } from '../src/llm/types'
import {
  type AgentConfig,
  createCrossCheckPattern,
  createEnsemblePattern,
  createParallelPattern,
  createSequentialPattern,
  type PatternEvent,
} from '../src/patterns'
import { createRunContext } from '../src/runtime'

const QUESTION = 'TypeScript에서 interface와 type의 차이점을 한 문장으로 설명해주세요.'

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
          pushEvent({ type: 'message', message: { role: 'assistant', content: fullContent } })
          pushEvent({ type: 'done' })
          done = true
          resolveResult!({ message: { role: 'assistant', content: fullContent } })
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
  console.log('║           🧪 All Patterns E2E Test                            ║')
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
    process.exit(1)
  }

  console.log(`\n📋 Question: ${QUESTION}\n`)
  const ctx = createRunContext()

  console.log('═'.repeat(60))
  console.log('🔍 1. CrossCheck Pattern')
  console.log('═'.repeat(60))

  const crossCheck = createCrossCheckPattern({
    agents: agents.slice(0, 2),
    judge: agents[0]!,
  })

  let startTime = Date.now()
  const crossCheckResult = await crossCheck.run(ctx, { prompt: QUESTION }).result()
  console.log(`   ⏱️  ${Date.now() - startTime}ms`)
  console.log(`   📊 Agreement: ${(crossCheckResult.agreement * 100).toFixed(1)}%`)
  console.log(`   💬 ${crossCheckResult.finalAnswer.slice(0, 100)}...`)

  console.log('\n' + '═'.repeat(60))
  console.log('🎭 2. Ensemble Pattern (longest)')
  console.log('═'.repeat(60))

  const ensemble = createEnsemblePattern({
    agents: agents.slice(0, 2),
    aggregation: 'longest',
  })

  startTime = Date.now()
  const ensembleResult = await ensemble.run(ctx, { prompt: QUESTION }).result()
  console.log(`   ⏱️  ${Date.now() - startTime}ms`)
  console.log(`   📊 Strategy: ${ensembleResult.aggregationStrategy}`)
  console.log(`   💬 ${ensembleResult.finalAnswer.slice(0, 100)}...`)

  console.log('\n' + '═'.repeat(60))
  console.log('🔗 3. Sequential Pattern')
  console.log('═'.repeat(60))

  const sequential = createSequentialPattern({
    agents: [
      { ...agents[0]!, systemPrompt: 'Answer the question briefly.' },
      { ...agents[1]!, systemPrompt: 'Improve and expand the previous answer.' },
    ],
  })

  startTime = Date.now()
  const sequentialResult = await sequential.run(ctx, { prompt: QUESTION }).result()
  console.log(`   ⏱️  ${Date.now() - startTime}ms`)
  console.log(`   📊 Steps: ${sequentialResult.steps.length}`)
  console.log(`   💬 ${sequentialResult.finalAnswer.slice(0, 100)}...`)

  console.log('\n' + '═'.repeat(60))
  console.log('⚡ 4. Parallel Pattern')
  console.log('═'.repeat(60))

  const parallel = createParallelPattern({
    agents,
  })

  startTime = Date.now()
  const parallelResult = await parallel.run(ctx, { prompt: QUESTION }).result()
  console.log(`   ⏱️  ${Date.now() - startTime}ms`)
  console.log(
    `   📊 Responses: ${parallelResult.responses.filter((r) => r.success).length}/${parallelResult.responses.length} success`,
  )

  for (const r of parallelResult.responses) {
    const status = r.success ? '✅' : '❌'
    const preview = r.success ? r.response.message?.content?.slice(0, 50) + '...' : r.error
    console.log(`   ${status} ${r.agentId}: ${preview}`)
  }

  console.log('\n' + '═'.repeat(60))
  console.log('✅ All Patterns E2E Test Complete!')
  console.log('═'.repeat(60))
}

main().catch(console.error)
