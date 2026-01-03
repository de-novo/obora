#!/usr/bin/env bun
/**
 * Architecture Debate: Unified Runtime Proposal
 *
 * Debate the proposed architecture redesign:
 * - Replace DebateEngine + AgentRunner with unified Runnable + Patterns
 *
 * Run with: bun packages/core/examples/debate-architecture.ts
 */

import { ClaudeProvider, DebateEngine, OpenAIProvider } from '../src'

const ARCHITECTURE_CONTEXT = `
## Current Architecture Problems

### 1. DebateEngine and AgentRunner are Disconnected
- DebateEngine has its own participant/provider management
- AgentRunner has invocation modes but no LLM integration (TODO placeholders)
- Code duplication and conceptual overlap

### 2. DebateEngine is Hardcoded
- Phases (initial, rebuttal, revised, consensus) are baked in
- Can't easily add cross-check or ensemble patterns
- Prompts are hardcoded strings

### 3. Vision vs Implementation Gap
- Vision: "Combination of AIs" with 3 pillars (Agent+Model, Multi-AI Perspective, Workflow)
- Reality: Only debate is implemented, and it's rigid

## Proposed Architecture

### Core Abstractions
1. **Runnable<I,O>** - Universal execution interface with streaming
2. **RunHandle<O>** - Streaming events + final result
3. **AgentExecutor** - Unified agent execution (replaces both DebateEngine's participant handling and AgentRunner)
4. **Pattern<I,O>** - Orchestrates multiple agents (DebatePattern, EnsemblePattern, CrossCheckPattern, etc.)

### Key Changes
- **Agents own model choice** - AgentSpec includes ModelRef
- **Patterns are data** - DebatePhase[] instead of hardcoded phases
- **One execution path** - Everything uses AgentExecutor
- **Composable** - Patterns can contain other patterns

### Migration Path
1. Introduce llm/ChatModel adapters (wrap existing providers)
2. Implement runtime/ + AgentExecutor
3. Bridge DebateEngine to runtime (adapter pattern)
4. Extract debate prompts into configurable phases
5. Delete AgentRunner TODOs, rebuild on AgentExecutor
6. Add new patterns incrementally

### Trade-offs

**Pros:**
- Unified execution model
- Supports all multi-AI patterns (debate, ensemble, cross-check)
- Agents own their model (Vision Pillar 1)
- Composable workflows (Vision Pillar 3)

**Cons:**
- Significant refactor effort
- Current debate code works well - why change?
- Risk of over-engineering
- New abstractions to learn
`

const TOPIC = `
${ARCHITECTURE_CONTEXT}

---

**Debate Topic**: "Should Obora adopt the proposed unified runtime architecture?"

Consider:
1. Is the Runnable/Pattern abstraction the right approach?
2. Are there simpler alternatives to achieve the same goals?
3. Is the migration path realistic (incremental vs big bang)?
4. What are the risks of this refactor?
5. Is this solving real user problems or just engineering elegance?

Each participant should:
- Take a clear position (adopt, reject, or modify)
- Provide specific critiques or improvements
- Consider both short-term and long-term implications
`

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
  console.log(`${colors.bold}  OBORA ARCHITECTURE DEBATE${colors.reset}`)
  console.log(`${colors.bold}  Topic: Unified Runtime Proposal${colors.reset}`)
  console.log(`${colors.bold}${'='.repeat(80)}${colors.reset}`)
  console.log()

  const claude = new ClaudeProvider()
  const openai = new OpenAIProvider()

  const engine = new DebateEngine({
    mode: 'strong',
    skills: {
      global: ['devil-advocate'],
    },
  })

  console.log(`${colors.dim}Participants: Claude, OpenAI${colors.reset}`)
  console.log(`${colors.dim}Mode: Strong Debate (Initial -> Rebuttal -> Revised -> Consensus)${colors.reset}`)
  console.log(`${colors.dim}Skills: devil-advocate (global)${colors.reset}`)
  console.log()

  const startTime = Date.now()
  const transcript: { phase: string; speaker: string; content: string }[] = []

  let currentPhase = ''
  let currentParticipant = ''
  let currentContent = ''

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
        currentContent = ''
        const color = getColor(currentParticipant)
        console.log()
        process.stdout.write(`${color}[${currentParticipant}]${colors.reset} `)
        break
      }

      case 'chunk':
        currentContent += event.chunk || ''
        process.stdout.write(event.chunk || '')
        break

      case 'round_end':
        transcript.push({
          phase: currentPhase,
          speaker: currentParticipant,
          content: currentContent,
        })
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
  console.log(`${colors.dim}Rounds: ${transcript.length}${colors.reset}`)

  const outputPath = `docs/research/ARCHITECTURE_DEBATE_${new Date().toISOString().split('T')[0]}.json`
  await Bun.write(outputPath, JSON.stringify({ topic: TOPIC, duration, transcript }, null, 2))
  console.log(`${colors.dim}Transcript saved: ${outputPath}${colors.reset}`)
}

main().catch(console.error)
