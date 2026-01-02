#!/usr/bin/env bun
import { ClaudeProvider, DebateEngine, type DebateParticipant, OpenAIProvider } from '../src'

const TOPIC = `
Should a B2B SaaS startup use Railway vs AWS for production infrastructure?
Context:
- 5-person team, pre-seed, no dedicated DevOps
- Need SOC2 certification within 12 months
- Currently at $2,000/month in infrastructure costs
- 5 enterprise clients, expecting 20 by end of year

Requirements for recommendation:
- Verify current SOC2 certification status of recommended platforms
- Cite specific pricing tiers and limits
- Reference recent announcements or changes (2024-2025)
`

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║        🔍 Multi-AI Debate with WebSearch Fact-Checking       ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log('\n📋 Topic:', TOPIC.trim())

  const claude = new ClaudeProvider({
    enabledTools: ['WebSearch'],
  })

  const openai = new OpenAIProvider({
    enabledTools: ['WebSearch'],
  })

  console.log('\n🔍 Checking provider availability...')
  console.log(`   Claude: ${(await claude.isAvailable()) ? '✅' : '❌'}`)
  console.log(`   OpenAI: ${(await openai.isAvailable()) ? '✅' : '❌'}`)

  const participants: DebateParticipant[] = [
    { name: 'claude', provider: claude },
    { name: 'openai', provider: openai },
  ]

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

  const engine = new DebateEngine({
    mode: 'strong',
    useNativeWebSearch: true,
    toolPhases: ['rebuttal'],
    timeout: 600000,
  })

  console.log('\n🚀 Starting debate with WebSearch enabled...')
  console.log('   Native WebSearch will be used during rebuttal phase')
  console.log('   for fact-checking claims about SOC2, pricing, etc.\n')

  const startTime = Date.now()

  try {
    const result = await engine.run({
      topic: TOPIC,
      participants: availableParticipants,
      orchestrator: claude,
    })

    const elapsed = (Date.now() - startTime) / 1000

    console.log('\n\n')
    console.log('╔══════════════════════════════════════════════════════════════╗')
    console.log('║                       📊 Debate Results                       ║')
    console.log('╚══════════════════════════════════════════════════════════════╝')

    const phases = {
      initial: result.rounds.filter((r) => r.phase === 'initial'),
      rebuttal: result.rounds.filter((r) => r.phase === 'rebuttal'),
      revised: result.rounds.filter((r) => r.phase === 'revised'),
      consensus: result.rounds.filter((r) => r.phase === 'consensus'),
    }

    console.log(`\n⏱️  Total time: ${elapsed.toFixed(1)}s`)
    console.log(`📝 Total rounds: ${result.rounds.length}`)
    console.log(`   - Initial positions: ${phases.initial.length}`)
    console.log(`   - Rebuttals (with WebSearch): ${phases.rebuttal.length}`)
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

    console.log('\n━━━ REBUTTAL PHASE (WebSearch-backed fact-checking) ━━━')
    for (const round of phases.rebuttal) {
      console.log(`\n[${round.speaker.toUpperCase()}]`)
      console.log(round.content.slice(0, 1000) + (round.content.length > 1000 ? '...' : ''))
    }

    console.log('\n━━━ Final Consensus ━━━')
    console.log(result.consensus || 'No consensus reached')

    const outputPath = 'packages/core/examples/debate-websearch-result.json'
    await Bun.write(
      outputPath,
      JSON.stringify(
        {
          topic: TOPIC,
          mode: result.mode,
          webSearchEnabled: true,
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
