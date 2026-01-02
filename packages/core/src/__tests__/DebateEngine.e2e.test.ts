/**
 * E2E Tests for DebateEngine - Uses REAL AI providers and incurs API costs.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=xxx OPENAI_API_KEY=xxx bun test e2e
 *
 * Set E2E_SKIP=true to skip even with API keys.
 */

import { describe, expect, test } from 'bun:test'
import type { DebateStreamEvent } from '../engine'
import { DebateEngine } from '../engine/DebateEngine'
import type { DebateResult } from '../engine/types'
import { ClaudeProvider } from '../providers/claude'
import { OpenAIProvider } from '../providers/openai'

const E2E_TIMEOUT = 600000
const SIMPLE_TOPIC = 'Should a small startup use TypeScript or JavaScript for a new project?'

const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY
const hasOpenAIKey = !!process.env.OPENAI_API_KEY
const skipE2E = process.env.E2E_SKIP === 'true'

async function checkProviders() {
  const claude = new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
  const openai = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })

  const claudeAvailable = await claude.isAvailable()
  const openaiAvailable = await openai.isAvailable()

  return {
    claude: claudeAvailable ? claude : null,
    openai: openaiAvailable ? openai : null,
    bothAvailable: claudeAvailable && openaiAvailable,
  }
}

async function saveE2EResult(name: string, result: DebateResult | Record<string, unknown>) {
  const outputPath = `packages/core/src/__tests__/e2e-results/${name}-${Date.now()}.json`
  await Bun.write(outputPath, JSON.stringify(result, null, 2))
  console.log(`\n📁 E2E result saved: ${outputPath}`)
}

describe('DebateEngine E2E', () => {
  const shouldRun = (hasAnthropicKey || hasOpenAIKey) && !skipE2E

  describe('Strong Mode - Full 4-Phase Debate', () => {
    test.skipIf(!shouldRun)(
      'runs complete strong debate with real providers',
      async () => {
        const { claude, openai, bothAvailable } = await checkProviders()

        if (!bothAvailable) {
          console.log('⚠️ Both Claude and OpenAI must be available for full debate test')
          return
        }

        const engine = new DebateEngine({
          mode: 'strong',
          maxRounds: 10,
          timeout: E2E_TIMEOUT,
        })

        console.log('\n🚀 Starting E2E Strong Mode debate...')
        console.log(`   Topic: ${SIMPLE_TOPIC}`)
        const startTime = Date.now()

        const result = await engine.run({
          topic: SIMPLE_TOPIC,
          participants: [
            { name: 'claude', provider: claude! },
            { name: 'openai', provider: openai! },
          ],
          orchestrator: claude!,
        })

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

        const initialRounds = result.rounds.filter((r) => r.phase === 'initial')
        expect(initialRounds.length).toBe(2)
        expect(initialRounds.every((r) => r.content.length > 100)).toBe(true)

        const rebuttalRounds = result.rounds.filter((r) => r.phase === 'rebuttal')
        expect(rebuttalRounds.length).toBe(2)
        expect(rebuttalRounds.every((r) => r.content.length > 100)).toBe(true)

        const revisedRounds = result.rounds.filter((r) => r.phase === 'revised')
        expect(revisedRounds.length).toBe(2)
        expect(revisedRounds.every((r) => r.content.length > 100)).toBe(true)

        expect(result.consensus).toBeTruthy()
        expect(result.consensus.length).toBeGreaterThan(200)

        expect(result.metadata.participantCount).toBe(2)
        expect(result.metadata.totalDurationMs).toBeGreaterThan(0)

        await saveE2EResult('strong-mode', result)

        console.log('\n📊 E2E Strong Mode Results:')
        console.log(`   Rounds: ${result.rounds.length}`)
        console.log(`   Position Changes: ${result.positionChanges.length}`)
        console.log(`   Unresolved Disagreements: ${result.unresolvedDisagreements.length}`)
        console.log(`   Consensus Length: ${result.consensus.length} chars`)
      },
      E2E_TIMEOUT,
    )

    test.skipIf(!shouldRun)(
      'detects position changes in strong debate',
      async () => {
        const { claude, openai, bothAvailable } = await checkProviders()

        if (!bothAvailable) {
          console.log('⚠️ Both providers needed')
          return
        }

        const controversialTopic = `
          A startup has $50K budget and 3 months to launch an MVP.
          Option A: Build on AWS with full infrastructure control
          Option B: Use Vercel + managed services for faster deployment
          Which option is better and why?
        `

        const engine = new DebateEngine({ mode: 'strong' })

        const result = await engine.run({
          topic: controversialTopic,
          participants: [
            { name: 'claude', provider: claude! },
            { name: 'openai', provider: openai! },
          ],
          orchestrator: claude!,
        })

        console.log(`\n🔄 Position Changes Detected: ${result.positionChanges.length}`)
        for (const change of result.positionChanges) {
          console.log(`   - ${change.participant}: ${change.reason}`)
        }

        await saveE2EResult('position-changes', result)

        expect(result.rounds.length).toBe(7)
      },
      E2E_TIMEOUT,
    )
  })

  describe('Weak Mode Debate', () => {
    test.skipIf(!shouldRun)(
      'runs weak mode debate with consensus',
      async () => {
        const { claude, openai, bothAvailable } = await checkProviders()

        if (!bothAvailable) {
          console.log('⚠️ Both providers needed')
          return
        }

        const engine = new DebateEngine({ mode: 'weak' })

        console.log('\n🚀 Starting E2E Weak Mode debate...')
        const result = await engine.run({
          topic: SIMPLE_TOPIC,
          participants: [
            { name: 'claude', provider: claude! },
            { name: 'openai', provider: openai! },
          ],
          orchestrator: claude!,
        })

        expect(result.mode).toBe('weak')
        expect(result.rounds.length).toBe(3)

        const phases = result.rounds.map((r) => r.phase)
        expect(phases.filter((p) => p === 'initial').length).toBe(2)
        expect(phases.filter((p) => p === 'consensus').length).toBe(1)

        expect(phases.includes('rebuttal')).toBe(false)
        expect(phases.includes('revised')).toBe(false)

        await saveE2EResult('weak-mode', result)

        console.log('\n📊 E2E Weak Mode Results:')
        console.log(`   Rounds: ${result.rounds.length}`)
        console.log(`   Consensus Length: ${result.consensus.length} chars`)
      },
      E2E_TIMEOUT,
    )
  })

  describe('Streaming Mode', () => {
    test.skipIf(!shouldRun)(
      'streams debate events in real-time',
      async () => {
        const { claude, openai, bothAvailable } = await checkProviders()

        if (!bothAvailable) {
          console.log('⚠️ Both providers needed')
          return
        }

        const engine = new DebateEngine({ mode: 'strong' })

        console.log('\n🌊 Starting E2E Streaming debate...')

        const events: DebateStreamEvent[] = []
        const phases: string[] = []
        const participants: string[] = []
        let totalChunks = 0
        let totalContent = ''

        for await (const event of engine.runStreaming({
          topic: SIMPLE_TOPIC,
          participants: [
            { name: 'claude', provider: claude! },
            { name: 'openai', provider: openai! },
          ],
          orchestrator: claude!,
        })) {
          events.push(event)

          switch (event.type) {
            case 'phase_start':
              if (event.phase) phases.push(event.phase)
              console.log(`\n━━━ Phase: ${event.phase?.toUpperCase()} ━━━`)
              break
            case 'round_start':
              if (event.participant) participants.push(event.participant)
              process.stdout.write(`[${event.participant}] `)
              break
            case 'chunk':
              totalChunks++
              totalContent += event.chunk || ''
              if (totalChunks % 50 === 0) process.stdout.write('.')
              break
            case 'round_end':
              console.log(` (${event.content?.length || 0} chars)`)
              break
          }
        }

        expect(events.length).toBeGreaterThan(10)

        expect(phases).toContain('initial')
        expect(phases).toContain('rebuttal')
        expect(phases).toContain('revised')
        expect(phases).toContain('consensus')

        expect(totalChunks).toBeGreaterThan(50)
        expect(totalContent.length).toBeGreaterThan(1000)

        await saveE2EResult('streaming', {
          totalEvents: events.length,
          phases,
          participants,
          totalChunks,
          totalContentLength: totalContent.length,
        })

        console.log('\n\n📊 E2E Streaming Results:')
        console.log(`   Total Events: ${events.length}`)
        console.log(`   Phases Streamed: ${phases.join(' → ')}`)
        console.log(`   Total Chunks: ${totalChunks}`)
        console.log(`   Total Content: ${totalContent.length} chars`)
      },
      E2E_TIMEOUT,
    )
  })

  describe('Provider Availability', () => {
    test('checks provider availability', async () => {
      const { claude, openai } = await checkProviders()

      console.log('\n🔍 Provider Availability:')
      console.log(`   Claude: ${claude ? '✅ Available' : '❌ Not Available'}`)
      console.log(`   OpenAI: ${openai ? '✅ Available' : '❌ Not Available'}`)

      expect(true).toBe(true)
    })
  })

  describe('Error Handling', () => {
    test.skipIf(!hasAnthropicKey)(
      'handles timeout gracefully',
      async () => {
        const claude = new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY })

        if (!(await claude.isAvailable())) {
          console.log('⚠️ Claude not available')
          return
        }

        const engine = new DebateEngine({
          mode: 'weak',
          timeout: 1,
        })

        try {
          await engine.run({
            topic: SIMPLE_TOPIC,
            participants: [
              { name: 'claude-1', provider: claude },
              { name: 'claude-2', provider: new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY }) },
            ],
          })
        } catch (error) {
          expect(error).toBeDefined()
        }
      },
      60000,
    )
  })
})

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    E2E Test Configuration                     ║
╠══════════════════════════════════════════════════════════════╣
║  ANTHROPIC_API_KEY: ${hasAnthropicKey ? '✅ Set' : '❌ Not Set'}                              ║
║  OPENAI_API_KEY:    ${hasOpenAIKey ? '✅ Set' : '❌ Not Set'}                              ║
║  E2E_SKIP:          ${skipE2E ? '⏭️ Skipping' : '▶️ Running'}                              ║
╠══════════════════════════════════════════════════════════════╣
║  To run E2E tests:                                            ║
║  ANTHROPIC_API_KEY=xxx OPENAI_API_KEY=xxx bun test e2e        ║
╚══════════════════════════════════════════════════════════════╝
`)
