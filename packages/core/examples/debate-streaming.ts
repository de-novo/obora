#!/usr/bin/env bun
/**
 * Example: Streaming Multi-AI Debate
 *
 * This demonstrates real-time streaming of debate responses.
 * Each participant's response is streamed chunk by chunk.
 *
 * Requires API keys for streaming (CLI backends don't support streaming yet):
 *   ANTHROPIC_API_KEY=your_key bun packages/core/examples/debate-streaming.ts
 *   OPENAI_API_KEY=your_key bun packages/core/examples/debate-streaming.ts
 *
 * Or both for a full debate:
 *   ANTHROPIC_API_KEY=... OPENAI_API_KEY=... bun packages/core/examples/debate-streaming.ts
 */

import {
  ClaudeProvider,
  DebateEngine,
  GeminiProvider,
  OpenAIProvider,
  type StreamableProvider,
  type StreamingParticipant,
} from '../src'

const TOPIC = `
Should a B2B SaaS startup (Series A, 5 developers) migrate from monolithic Node.js to microservices?
Currently: 10 enterprise clients, 5,000 MAU, $25,000 monthly revenue.
`

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
}

function getParticipantColor(name: string): string {
  switch (name) {
    case 'claude':
      return colors.cyan
    case 'openai':
      return colors.green
    case 'gemini':
      return colors.yellow
    default:
      return colors.magenta
  }
}

async function main() {
  console.log(`${colors.bold}╔══════════════════════════════════════════════════════════════╗${colors.reset}`)
  console.log(`${colors.bold}║         🌊 Streaming Multi-AI Debate (@obora/core)           ║${colors.reset}`)
  console.log(`${colors.bold}╚══════════════════════════════════════════════════════════════╝${colors.reset}`)
  console.log(`\n${colors.dim}Topic:${colors.reset}`, TOPIC.trim())

  // Initialize providers with API keys (required for streaming)
  const providers: { name: string; provider: StreamableProvider }[] = []

  if (process.env.ANTHROPIC_API_KEY) {
    providers.push({
      name: 'claude',
      provider: new ClaudeProvider({
        apiKey: process.env.ANTHROPIC_API_KEY,
      }),
    })
  }

  if (process.env.OPENAI_API_KEY) {
    providers.push({
      name: 'openai',
      provider: new OpenAIProvider({
        apiKey: process.env.OPENAI_API_KEY,
      }),
    })
  }

  if (process.env.GOOGLE_API_KEY) {
    providers.push({
      name: 'gemini',
      provider: new GeminiProvider({
        apiKey: process.env.GOOGLE_API_KEY,
      }),
    })
  }

  if (providers.length < 2) {
    console.log(`\n${colors.yellow}⚠️  Need at least 2 API keys for streaming debate.${colors.reset}`)
    console.log(`\nSet environment variables:`)
    console.log(`  ANTHROPIC_API_KEY=your_key`)
    console.log(`  OPENAI_API_KEY=your_key`)
    console.log(`  GOOGLE_API_KEY=your_key`)
    console.log(`\nExample:`)
    console.log(`  ANTHROPIC_API_KEY=... OPENAI_API_KEY=... bun packages/core/examples/debate-streaming.ts`)
    process.exit(1)
  }

  console.log(`\n${colors.dim}Participants:${colors.reset}`, providers.map((p) => p.name).join(', '))

  // Create streaming participants
  const participants: StreamingParticipant[] = providers.map((p) => ({
    name: p.name,
    provider: p.provider,
  }))

  // Initialize engine with strong debate mode
  const engine = new DebateEngine({
    mode: 'strong',
    maxRounds: 10,
  })

  console.log(`\n${colors.bold}🚀 Starting streaming debate...${colors.reset}\n`)

  let currentPhase = ''
  let currentParticipant = ''

  // Run streaming debate
  const orchestrator = participants[0]?.provider
  if (!orchestrator) {
    console.error('No orchestrator available')
    process.exit(1)
  }

  for await (const event of engine.runStreaming({
    topic: TOPIC,
    participants,
    orchestrator,
  })) {
    switch (event.type) {
      case 'phase_start':
        currentPhase = event.phase || ''
        console.log(`\n${colors.bold}━━━ Phase: ${currentPhase.toUpperCase()} ━━━${colors.reset}\n`)
        break

      case 'round_start':
        currentParticipant = event.participant || ''
        const color = getParticipantColor(currentParticipant)
        process.stdout.write(`${color}[${currentParticipant}]${colors.reset} `)
        break

      case 'chunk':
        // Stream chunk to stdout
        process.stdout.write(event.chunk || '')
        break

      case 'round_end':
        console.log('\n')
        break

      case 'phase_end':
        // Phase completed
        break
    }
  }

  console.log(`${colors.bold}╔══════════════════════════════════════════════════════════════╗${colors.reset}`)
  console.log(`${colors.bold}║                    ✅ Debate Complete                         ║${colors.reset}`)
  console.log(`${colors.bold}╚══════════════════════════════════════════════════════════════╝${colors.reset}`)
}

main().catch(console.error)
