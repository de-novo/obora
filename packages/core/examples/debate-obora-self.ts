#!/usr/bin/env bun
/**
 * Self-Debate: Obora debates about Obora
 *
 * A meta-test where the debate system evaluates its own design and features.
 * Run with: bun packages/core/examples/debate-obora-self.ts
 */

import { DebateEngine, ClaudeProvider, OpenAIProvider } from '../src'

const PROJECT_CONTEXT = `
## Project: Obora - Multi-AI Debate System

### Core Value Proposition
A single AI doesn't know its own blind spots. Obora makes multiple AIs point out each other's weaknesses to produce more robust conclusions.

### Current Features (v0.1.0)
1. **DebateEngine**: Orchestrates multi-AI debates with phases (Initial -> Rebuttal -> Revised -> Consensus)
2. **Providers**: Claude, OpenAI, Gemini with OAuth support (no API keys required for Pro/Plus subscribers)
3. **Debate Modes**: Strong (full debate cycle) vs Weak (no rebuttal)
4. **AgentSkills**: Portable, stateless skill system (fact-checker, devil-advocate, synthesizer, etc.)
5. **Streaming**: Real-time output for long-running debates
6. **WebSearch**: Native web search integration during rebuttal phase

### Architecture
- Monorepo: packages/core (engine, providers, skills) + packages/cli
- TypeScript + Bun runtime
- OAuth via browser-based authentication flow

### Benchmark Results (from README)
| Mode | Time | Consensus Detail |
|------|------|------------------|
| Single | 18.9s | 2.2K chars |
| Strong Debate | 255.7s | 5.2K chars, 8 cautions |

Strong Debate generates 2x more detailed analysis with concrete failure scenarios.

### Current Limitations
- Cost: 6x+ API calls compared to single AI
- Time: ~4 minutes per case (Strong Debate)
- Complexity: Results require user interpretation skills

### Open Questions for This Debate
1. Is the current feature set sufficient for v1.0 release?
2. What are the biggest risks/gaps in the current design?
3. What should be prioritized next: more features, better UX, or npm publishing?
4. Is the "Strong Debate" value proposition clear enough for users?
5. What use cases are we missing?
`

const TOPIC = `
${PROJECT_CONTEXT}

---

**Debate Topic**: "What should be Obora's strategic priority for the next development cycle?"

Consider:
- Feature completeness vs polish
- Developer experience vs end-user value
- Academic rigor vs practical utility
- Open source community building vs internal improvement

Each participant should propose a concrete recommendation with reasoning.
`

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
}

function getColor(name: string): string {
  if (name.includes('claude')) return colors.cyan
  if (name.includes('openai')) return colors.green
  if (name.includes('gemini')) return colors.yellow
  return colors.magenta
}

async function main() {
  console.log(`${colors.bold}${'='.repeat(80)}${colors.reset}`)
  console.log(`${colors.bold}  OBORA SELF-DEBATE: Strategic Priority Discussion${colors.reset}`)
  console.log(`${colors.bold}${'='.repeat(80)}${colors.reset}`)
  console.log()

  // Initialize providers (OAuth - no API keys needed)
  const claude = new ClaudeProvider()
  const openai = new OpenAIProvider()

  const engine = new DebateEngine({
    mode: 'strong',
    skills: {
      global: ['devil-advocate'],
      participants: {
        claude: ['synthesizer'],
        openai: ['fact-checker'],
      },
    },
  })

  console.log(`${colors.dim}Participants: Claude, OpenAI${colors.reset}`)
  console.log(
    `${colors.dim}Skills: devil-advocate (global), synthesizer (Claude), fact-checker (OpenAI)${colors.reset}`,
  )
  console.log()

  const startTime = Date.now()

  let currentPhase = ''
  let currentParticipant = ''

  for await (const event of engine.runStreaming({
    topic: TOPIC,
    participants: [
      { name: 'claude', provider: claude },
      { name: 'openai', provider: openai },
    ],
    orchestrator: claude,
  })) {
    switch (event.type) {
      case 'phase_start':
        currentPhase = event.phase || ''
        console.log()
        console.log(`${colors.bold}${'─'.repeat(60)}${colors.reset}`)
        console.log(`${colors.bold}Phase: ${currentPhase.toUpperCase()}${colors.reset}`)
        console.log(`${colors.bold}${'─'.repeat(60)}${colors.reset}`)
        break

      case 'round_start': {
        currentParticipant = event.participant || ''
        const color = getColor(currentParticipant)
        console.log()
        process.stdout.write(`${color}[${currentParticipant}]${colors.reset} `)
        break
      }

      case 'chunk':
        process.stdout.write(event.chunk || '')
        break

      case 'round_end':
        console.log()
        break

      case 'phase_end':
        break
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log()
  console.log(`${colors.bold}${'='.repeat(80)}${colors.reset}`)
  console.log(`${colors.bold}  DEBATE COMPLETE${colors.reset}`)
  console.log(`${colors.bold}${'='.repeat(80)}${colors.reset}`)
  console.log()
  console.log(`${colors.dim}Total time: ${duration}s${colors.reset}`)
}

main().catch(console.error)
