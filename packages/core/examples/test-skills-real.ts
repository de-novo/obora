#!/usr/bin/env bun
/**
 * Test: Verify AIs actually USE skills during debate
 *
 * Compares AI behavior WITH and WITHOUT skills to see the difference.
 *
 * Usage:
 *   bun packages/core/examples/test-skills-real.ts
 *
 * Requires: obora auth login anthropic
 */

import { ClaudeProvider, DebateEngine } from '../src'

const TOPIC = `
Should a 3-person startup use AWS Lambda or ECS Fargate for their backend?
Context: Pre-seed, $5k/month budget, no DevOps experience, variable traffic.
`

async function runDebateWithoutSkills(provider: ClaudeProvider) {
  console.log('\n━━━ Debate WITHOUT Skills ━━━\n')

  const engine = new DebateEngine({
    mode: 'weak', // Simple mode for faster test
  })

  const result = await engine.run({
    topic: TOPIC,
    participants: [
      { name: 'expert-a', provider },
      { name: 'expert-b', provider },
    ],
  })

  console.log('[expert-a] Initial Position (NO SKILLS):')
  console.log(result.rounds[0]?.content.slice(0, 800))
  console.log('...\n')
}

async function runDebateWithFactChecker(provider: ClaudeProvider) {
  console.log('\n━━━ Debate WITH fact-checker Skill ━━━\n')

  const engine = new DebateEngine({
    mode: 'weak',
    skills: {
      global: ['fact-checker'],
    },
  })

  const result = await engine.run({
    topic: TOPIC,
    participants: [
      { name: 'expert-a', provider },
      { name: 'expert-b', provider },
    ],
  })

  console.log('[expert-a] Initial Position (WITH fact-checker):')
  console.log(result.rounds[0]?.content.slice(0, 800))
  console.log('...\n')
}

async function runDebateWithDevilAdvocate(provider: ClaudeProvider) {
  console.log('\n━━━ Debate WITH devil-advocate Skill ━━━\n')

  const engine = new DebateEngine({
    mode: 'weak',
    skills: {
      global: ['devil-advocate'],
    },
  })

  const result = await engine.run({
    topic: TOPIC,
    participants: [
      { name: 'expert-a', provider },
      { name: 'expert-b', provider },
    ],
  })

  console.log('[expert-a] Initial Position (WITH devil-advocate):')
  console.log(result.rounds[0]?.content.slice(0, 800))
  console.log('...\n')
}

async function runRebuttalWithSkills(provider: ClaudeProvider) {
  console.log('\n━━━ Strong Debate - Rebuttal Phase WITH fact-checker ━━━\n')

  const engine = new DebateEngine({
    mode: 'strong',
    skills: {
      participants: {
        critic: ['fact-checker', 'devil-advocate'],
      },
    },
  })

  const result = await engine.run({
    topic: TOPIC,
    participants: [
      { name: 'proposer', provider },
      { name: 'critic', provider },
    ],
  })

  const rebuttalRound = result.rounds.find((r) => r.phase === 'rebuttal' && r.speaker === 'critic')

  console.log('[critic] Rebuttal (WITH fact-checker + devil-advocate):')
  console.log(rebuttalRound?.content.slice(0, 1200) || 'No rebuttal found')
  console.log('...\n')
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║        🔬 Real AI Skills Usage Test                          ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log('\n📋 Topic:', TOPIC.trim())

  const claude = new ClaudeProvider()

  if (!(await claude.isAvailable())) {
    console.log('\n❌ Claude provider not available')
    process.exit(1)
  }

  console.log('\n✅ Claude provider available\n')

  try {
    // Run tests sequentially
    await runDebateWithoutSkills(claude)
    await runDebateWithFactChecker(claude)
    await runDebateWithDevilAdvocate(claude)
    await runRebuttalWithSkills(claude)

    console.log('\n━━━ Comparison Notes ━━━\n')
    console.log('Compare the outputs above to see how skills affect AI behavior:')
    console.log('')
    console.log('📌 WITHOUT skills:')
    console.log('   - Generic recommendation')
    console.log('')
    console.log('📌 WITH fact-checker:')
    console.log('   - Should cite specific sources')
    console.log('   - Should verify claims with evidence')
    console.log('   - May include disclaimers about verification')
    console.log('')
    console.log('📌 WITH devil-advocate:')
    console.log('   - Should challenge assumptions')
    console.log('   - Should present counter-arguments')
    console.log('   - Should identify hidden risks')
    console.log('')
    console.log('📌 Rebuttal WITH both skills:')
    console.log('   - Should critically analyze claims')
    console.log('   - Should question unsupported assertions')
    console.log('   - Should provide evidence-based challenges')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

main()
