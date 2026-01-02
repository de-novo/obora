#!/usr/bin/env bun
/**
 * Test: Verify skills are being injected into debate prompts
 */

import { DebateEngine } from '../src/engine/DebateEngine'
import type { Provider, ProviderResponse } from '../src/providers/types'

class PromptCapturingProvider implements Provider {
  name: string
  capturedPrompts: string[] = []
  private responseIndex = 0
  private responses: string[]

  constructor(name: string, responses: string[] = ['Test response']) {
    this.name = name
    this.responses = responses
  }

  async run(prompt: string): Promise<ProviderResponse> {
    this.capturedPrompts.push(prompt)
    const content = this.responses[this.responseIndex % this.responses.length] || 'Response'
    this.responseIndex++
    return { content, raw: { content } }
  }

  async *stream(prompt: string) {
    this.capturedPrompts.push(prompt)
    const content = this.responses[this.responseIndex % this.responses.length] || 'Response'
    this.responseIndex++
    yield { chunk: content, done: false }
    yield { chunk: '', done: true }
  }

  async isAvailable(): Promise<boolean> {
    return true
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║              🧪 Skills Integration Test                       ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  // Test 1: Global skills
  console.log('━━━ Test 1: Global Skills ━━━\n')

  const provider1 = new PromptCapturingProvider('alice', ['Initial position', 'Rebuttal response', 'Revised position'])

  const engine1 = new DebateEngine({
    mode: 'strong',
    skills: {
      global: ['fact-checker'],
    },
  })

  await engine1.run({
    topic: 'Test topic',
    participants: [
      { name: 'alice', provider: provider1 },
      { name: 'bob', provider: new PromptCapturingProvider('bob', ['B1', 'B2', 'B3']) },
    ],
  })

  const initialPrompt = provider1.capturedPrompts[0]

  console.log('✓ Skills config: global: ["fact-checker"]')
  console.log('✓ Captured initial phase prompt for alice:\n')

  // Show skill-related parts of the prompt
  if (initialPrompt?.includes('<available_skills>')) {
    console.log('📋 Skills Discovery Block:')
    const skillsStart = initialPrompt.indexOf('<available_skills>')
    const skillsEnd = initialPrompt.indexOf('</available_skills>') + '</available_skills>'.length
    console.log(initialPrompt.slice(skillsStart, skillsEnd))
    console.log()
  }

  if (initialPrompt?.includes('<activated_skill_contents>')) {
    console.log('📋 Activated Skill Contents (truncated):')
    const contentsStart = initialPrompt.indexOf('<activated_skill_contents>')
    const contentsEnd = initialPrompt.indexOf('</activated_skill_contents>') + '</activated_skill_contents>'.length
    const contents = initialPrompt.slice(contentsStart, contentsEnd)
    // Show first 500 chars
    console.log(contents.slice(0, 800) + (contents.length > 800 ? '\n...(truncated)' : ''))
    console.log()
  }

  if (initialPrompt?.includes('<skills_context>')) {
    console.log('📋 Skills Context:')
    const ctxStart = initialPrompt.indexOf('<skills_context>')
    const ctxEnd = initialPrompt.indexOf('</skills_context>') + '</skills_context>'.length
    console.log(initialPrompt.slice(ctxStart, ctxEnd))
    console.log()
  }

  // Test 2: Per-participant skills
  console.log('\n━━━ Test 2: Per-Participant Skills ━━━\n')

  const aliceProvider = new PromptCapturingProvider('alice', ['A1', 'A2', 'A3'])
  const bobProvider = new PromptCapturingProvider('bob', ['B1', 'B2', 'B3'])

  const engine2 = new DebateEngine({
    mode: 'strong',
    skills: {
      participants: {
        alice: ['devil-advocate'],
        bob: ['fact-checker'],
      },
    },
  })

  await engine2.run({
    topic: 'Test topic 2',
    participants: [
      { name: 'alice', provider: aliceProvider },
      { name: 'bob', provider: bobProvider },
    ],
  })

  const aliceHasDevilAdvocate = aliceProvider.capturedPrompts[0]?.includes('devil-advocate')
  const bobHasFactChecker = bobProvider.capturedPrompts[0]?.includes('fact-checker')
  const aliceDoesNotHaveFactChecker = !aliceProvider.capturedPrompts[0]?.includes('fact-checker')
  const bobDoesNotHaveDevilAdvocate = !bobProvider.capturedPrompts[0]?.includes('devil-advocate')

  console.log('✓ Skills config: participants: { alice: ["devil-advocate"], bob: ["fact-checker"] }')
  console.log(`✓ Alice prompt contains "devil-advocate": ${aliceHasDevilAdvocate ? '✅' : '❌'}`)
  console.log(`✓ Alice prompt does NOT contain "fact-checker": ${aliceDoesNotHaveFactChecker ? '✅' : '❌'}`)
  console.log(`✓ Bob prompt contains "fact-checker": ${bobHasFactChecker ? '✅' : '❌'}`)
  console.log(`✓ Bob prompt does NOT contain "devil-advocate": ${bobDoesNotHaveDevilAdvocate ? '✅' : '❌'}`)

  // Test 3: Phase context
  console.log('\n━━━ Test 3: Phase Context in Skills ━━━\n')

  const provider3 = new PromptCapturingProvider('test', ['I1', 'R1', 'Rev1'])

  const engine3 = new DebateEngine({
    mode: 'strong',
    skills: {
      global: ['fact-checker'],
    },
  })

  await engine3.run({
    topic: 'Phase test',
    participants: [
      { name: 'test', provider: provider3 },
      { name: 'other', provider: new PromptCapturingProvider('other', ['O1', 'O2', 'O3']) },
    ],
  })

  const initialHasPhase = provider3.capturedPrompts[0]?.includes('<activation-phase>initial</activation-phase>')
  const rebuttalHasPhase = provider3.capturedPrompts[1]?.includes('<activation-phase>rebuttal</activation-phase>')
  const revisedHasPhase = provider3.capturedPrompts[2]?.includes('<activation-phase>revised</activation-phase>')

  console.log('✓ Skills config: global: ["fact-checker"]')
  console.log(`✓ Initial phase has "<activation-phase>initial": ${initialHasPhase ? '✅' : '❌'}`)
  console.log(`✓ Rebuttal phase has "<activation-phase>rebuttal": ${rebuttalHasPhase ? '✅' : '❌'}`)
  console.log(`✓ Revised phase has "<activation-phase>revised": ${revisedHasPhase ? '✅' : '❌'}`)

  // Summary
  console.log('\n━━━ Summary ━━━\n')

  const allPassed =
    initialPrompt?.includes('<available_skills>') &&
    aliceHasDevilAdvocate &&
    bobHasFactChecker &&
    aliceDoesNotHaveFactChecker &&
    bobDoesNotHaveDevilAdvocate &&
    initialHasPhase &&
    rebuttalHasPhase &&
    revisedHasPhase

  if (allPassed) {
    console.log('✅ All skill integration tests passed!')
    console.log('   - Skills are correctly injected into prompts')
    console.log('   - Per-participant skills work correctly')
    console.log('   - Phase context is included')
    console.log('   - agentskills XML format is correct')
  } else {
    console.log('❌ Some tests failed')
    process.exit(1)
  }
}

main().catch(console.error)
