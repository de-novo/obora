#!/usr/bin/env bun
/**
 * Example: Running a multi-AI debate using @obora/core
 *
 * This demonstrates the new API for running debates
 * with dual backend support (CLI and API modes).
 *
 * Usage:
 *   bun packages/core/examples/debate.ts
 */

import { ClaudeProvider, DebateEngine, type DebateParticipant, OpenAIProvider } from '../src'

const TOPIC = `
B2B SaaS startup (Series A, 5 developers).
Currently running a monolithic Node.js backend. Should we migrate to microservices?
10 enterprise clients, 5,000 MAU, $25,000 monthly revenue.
`

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║           🔥 Multi-AI Debate Demo (@obora/core)               ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log('\n📋 Topic:', TOPIC.trim())

  // Initialize providers (CLI mode by default, API mode if apiKey provided)
  // Uses latest default models: Sonnet 4.5, GPT-4.1 mini
  const claude = new ClaudeProvider({
    // apiKey: process.env.ANTHROPIC_API_KEY, // Uncomment for API mode
  })

  const openai = new OpenAIProvider({
    // apiKey: process.env.OPENAI_API_KEY, // Uncomment for API mode
  })

  // Check availability
  console.log('\n🔍 Checking provider availability...')
  console.log(`   Claude: ${(await claude.isAvailable()) ? '✅' : '❌'}`)
  console.log(`   OpenAI: ${(await openai.isAvailable()) ? '✅' : '❌'}`)

  // Define participants
  const participants: DebateParticipant[] = [
    { name: 'claude', provider: claude },
    { name: 'openai', provider: openai },
  ]

  // Filter available participants
  const availableParticipants: DebateParticipant[] = []
  for (const p of participants) {
    if (await p.provider.isAvailable()) {
      availableParticipants.push(p)
    }
  }

  if (availableParticipants.length < 2) {
    console.log('\n⚠️  Need at least 2 available providers for debate.')
    console.log('   Make sure Claude CLI or Codex CLI is installed.')
    process.exit(1)
  }

  // Initialize engine with strong debate mode
  const engine = new DebateEngine({
    mode: 'strong', // 4-phase debate with rebuttals
    maxRounds: 10,
    timeout: 300000,
  })

  console.log('\n🚀 Starting debate...')
  const startTime = Date.now()

  try {
    const result = await engine.run({
      topic: TOPIC,
      participants: availableParticipants,
      orchestrator: claude, // Claude as orchestrator for consensus
    })

    const elapsed = (Date.now() - startTime) / 1000

    console.log('\n\n')
    console.log('╔══════════════════════════════════════════════════════════════╗')
    console.log('║                       📊 Debate Results                       ║')
    console.log('╚══════════════════════════════════════════════════════════════╝')

    // Results by phase
    const phases = {
      initial: result.rounds.filter((r) => r.phase === 'initial'),
      rebuttal: result.rounds.filter((r) => r.phase === 'rebuttal'),
      revised: result.rounds.filter((r) => r.phase === 'revised'),
      consensus: result.rounds.filter((r) => r.phase === 'consensus'),
    }

    console.log(`\n⏱️  Total time: ${elapsed.toFixed(1)}s`)
    console.log(`📝 Total rounds: ${result.rounds.length}`)
    console.log(`   - Initial positions: ${phases.initial.length}`)
    console.log(`   - Rebuttals: ${phases.rebuttal.length}`)
    console.log(`   - Revised positions: ${phases.revised.length}`)
    console.log(`   - Consensus: ${phases.consensus.length}`)

    if (result.positionChanges.length > 0) {
      console.log(`\n🔄 Position changes: ${result.positionChanges.length}`)
      for (const change of result.positionChanges) {
        console.log(`   - ${change.participant}: ${change.reason}`)
      }
    }

    if (result.unresolvedDisagreements.length > 0) {
      console.log(`\n⚠️  Unresolved disagreements: ${result.unresolvedDisagreements.length}`)
      for (const disagreement of result.unresolvedDisagreements) {
        console.log(`   - ${disagreement}`)
      }
    }

    console.log('\n━━━ Final Consensus ━━━')
    console.log(result.consensus || 'No consensus reached')

    // Save results
    const outputPath = 'packages/core/examples/debate-result.json'
    await Bun.write(
      outputPath,
      JSON.stringify(
        {
          topic: TOPIC,
          mode: result.mode,
          rounds: result.rounds,
          consensus: result.consensus,
          positionChanges: result.positionChanges,
          unresolvedDisagreements: result.unresolvedDisagreements,
          metadata: result.metadata,
        },
        null,
        2,
      ),
    )
    console.log(`\n💾 Results saved: ${outputPath}`)
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

main()
