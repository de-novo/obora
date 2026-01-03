import { describe, expect, test } from 'bun:test'
import { AnthropicAdapter } from '../llm/adapters/anthropic'
import { OpenAIAdapter } from '../llm/adapters/openai'
import { createDebatePattern, type DebateEvent, type DebateResult } from '../patterns'
import { ClaudeProvider } from '../providers/claude'
import { OpenAIProvider } from '../providers/openai'
import { createNoopContext } from '../runtime'

const E2E_TIMEOUT = 600000
const SIMPLE_TOPIC = 'Should a small startup use TypeScript or JavaScript for a new project?'

const skipE2E = process.env.E2E_SKIP === 'true'

async function checkProviders() {
  const claude = new ClaudeProvider()
  const openai = new OpenAIProvider()

  const claudeAvailable = await claude.isAvailable()
  const openaiAvailable = await openai.isAvailable()

  return { claudeAvailable, openaiAvailable, bothAvailable: claudeAvailable && openaiAvailable }
}

async function saveE2EResult(name: string, result: DebateResult | Record<string, unknown>) {
  const outputPath = `packages/core/src/__tests__/e2e-results/${name}-${Date.now()}.json`
  await Bun.write(outputPath, JSON.stringify(result, null, 2))
  console.log(`\n📁 E2E result saved: ${outputPath}`)
}

describe('DebatePattern E2E', () => {
  describe('Strong Mode', () => {
    test.skipIf(skipE2E)(
      'runs complete strong debate with real providers',
      async () => {
        const { bothAvailable } = await checkProviders()

        if (!bothAvailable) {
          console.log('⚠️ Both Claude and OpenAI must be available')
          return
        }

        const claude = new AnthropicAdapter()
        const openai = new OpenAIAdapter()

        const pattern = createDebatePattern({
          participants: [
            { id: 'claude', name: 'Claude', model: claude },
            { id: 'openai', name: 'OpenAI', model: openai },
          ],
          orchestrator: { id: 'judge', name: 'Judge', model: claude },
          mode: 'strong',
        })

        console.log('\n🚀 Starting DebatePattern E2E Strong Mode...')
        console.log(`   Topic: ${SIMPLE_TOPIC}`)
        const startTime = Date.now()

        const ctx = createNoopContext()
        const handle = pattern.run(ctx, { topic: SIMPLE_TOPIC })

        const events: DebateEvent[] = []
        for await (const event of handle.events()) {
          events.push(event as DebateEvent)

          if (event.type === 'phase_start') {
            console.log(`\n━━━ Phase: ${(event as { phase: string }).phase?.toUpperCase()} ━━━`)
          }
          if (event.type === 'agent_start') {
            const e = event as { agentName?: string }
            process.stdout.write(`[${e.agentName}] `)
          }
          if (event.type === 'token') {
            process.stdout.write('.')
          }
          if (event.type === 'agent_end') {
            console.log(' done')
          }
        }

        const result = await handle.result()
        const elapsed = (Date.now() - startTime) / 1000
        console.log(`\n⏱️ Debate completed in ${elapsed.toFixed(1)}s`)

        expect(result.topic).toBe(SIMPLE_TOPIC)
        expect(result.mode).toBe('strong')

        const phases = new Set(result.rounds.map((r) => r.phase))
        expect(phases.has('initial')).toBe(true)
        expect(phases.has('rebuttal')).toBe(true)
        expect(phases.has('revised')).toBe(true)
        expect(phases.has('consensus')).toBe(true)

        expect(result.rounds.length).toBe(7)
        expect(result.consensus.length).toBeGreaterThan(200)
        expect(result.metadata.participantCount).toBe(2)

        await saveE2EResult('pattern-strong-mode', result)

        console.log('\n📊 DebatePattern E2E Results:')
        console.log(`   Rounds: ${result.rounds.length}`)
        console.log(`   Position Changes: ${result.positionChanges.length}`)
        console.log(`   Unresolved Disagreements: ${result.unresolvedDisagreements.length}`)
        console.log(`   Consensus Length: ${result.consensus.length} chars`)
        console.log(`   Events Received: ${events.length}`)
      },
      E2E_TIMEOUT,
    )
  })

  describe('Weak Mode', () => {
    test.skipIf(skipE2E)(
      'runs weak mode debate',
      async () => {
        const { bothAvailable } = await checkProviders()

        if (!bothAvailable) {
          console.log('⚠️ Both providers needed')
          return
        }

        const claude = new AnthropicAdapter()
        const openai = new OpenAIAdapter()

        const pattern = createDebatePattern({
          participants: [
            { id: 'claude', name: 'Claude', model: claude },
            { id: 'openai', name: 'OpenAI', model: openai },
          ],
          orchestrator: { id: 'judge', name: 'Judge', model: claude },
          mode: 'weak',
        })

        console.log('\n🚀 Starting DebatePattern E2E Weak Mode...')
        const ctx = createNoopContext()
        const result = await pattern.run(ctx, { topic: SIMPLE_TOPIC }).result()

        expect(result.mode).toBe('weak')
        expect(result.rounds.length).toBe(3)

        const phases = result.rounds.map((r) => r.phase)
        expect(phases.filter((p) => p === 'initial').length).toBe(2)
        expect(phases.filter((p) => p === 'consensus').length).toBe(1)

        await saveE2EResult('pattern-weak-mode', result)

        console.log('\n📊 DebatePattern Weak Mode Results:')
        console.log(`   Rounds: ${result.rounds.length}`)
        console.log(`   Consensus Length: ${result.consensus.length} chars`)
      },
      E2E_TIMEOUT,
    )
  })

  describe('Streaming Events', () => {
    test.skipIf(skipE2E)(
      'streams debate events correctly',
      async () => {
        const { bothAvailable } = await checkProviders()

        if (!bothAvailable) {
          console.log('⚠️ Both providers needed')
          return
        }

        const claude = new AnthropicAdapter()
        const openai = new OpenAIAdapter()

        const pattern = createDebatePattern({
          participants: [
            { id: 'claude', name: 'Claude', model: claude },
            { id: 'openai', name: 'OpenAI', model: openai },
          ],
          mode: 'weak',
        })

        console.log('\n🌊 Starting DebatePattern Streaming test...')

        const ctx = createNoopContext()
        const handle = pattern.run(ctx, { topic: SIMPLE_TOPIC })

        const eventTypes = new Set<string>()
        let tokenCount = 0

        for await (const event of handle.events()) {
          eventTypes.add(event.type)
          if (event.type === 'token') tokenCount++
        }

        await handle.result()

        expect(eventTypes.has('phase_start')).toBe(true)
        expect(eventTypes.has('phase_end')).toBe(true)
        expect(eventTypes.has('agent_start')).toBe(true)
        expect(eventTypes.has('agent_end')).toBe(true)
        expect(eventTypes.has('token')).toBe(true)
        expect(eventTypes.has('done')).toBe(true)

        expect(tokenCount).toBeGreaterThan(50)

        console.log('\n📊 Streaming Results:')
        console.log(`   Event Types: ${[...eventTypes].join(', ')}`)
        console.log(`   Token Events: ${tokenCount}`)
      },
      E2E_TIMEOUT,
    )
  })

  describe('Provider Availability', () => {
    test('checks provider availability', async () => {
      const { claudeAvailable, openaiAvailable } = await checkProviders()

      console.log('\n🔍 Provider Availability:')
      console.log(`   Claude: ${claudeAvailable ? '✅ Available' : '❌ Not Available'}`)
      console.log(`   OpenAI: ${openaiAvailable ? '✅ Available' : '❌ Not Available'}`)

      expect(true).toBe(true)
    })
  })
})

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                 DebatePattern E2E Configuration               ║
╠══════════════════════════════════════════════════════════════╣
║  E2E_SKIP: ${skipE2E ? '⏭️ Skipping' : '▶️ Running'}                                       ║
║  Uses OAuth mode (run 'obora auth login' first)               ║
╠══════════════════════════════════════════════════════════════╣
║  To skip: E2E_SKIP=true bun test                              ║
╚══════════════════════════════════════════════════════════════╝
`)
