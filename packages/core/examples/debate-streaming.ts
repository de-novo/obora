#!/usr/bin/env bun
/**
 * Example: Streaming Multi-AI Debate
 *
 * This demonstrates real-time streaming of debate responses.
 * Each participant's response is streamed chunk by chunk.
 *
 * Works with:
 * 1. CLI mode (no API keys): Uses Claude CLI headless mode
 *    bun packages/core/examples/debate-streaming.ts
 *
 * 2. API mode (with API keys): Uses Vercel AI SDK
 *    ANTHROPIC_API_KEY=... OPENAI_API_KEY=... bun packages/core/examples/debate-streaming.ts
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
  if (name.startsWith('claude')) return colors.cyan
  if (name.startsWith('openai')) return colors.green
  if (name.startsWith('gemini')) return colors.yellow
  return colors.magenta
}

async function main() {
  console.log(`${colors.bold}╔══════════════════════════════════════════════════════════════╗${colors.reset}`)
  console.log(`${colors.bold}║         🌊 Streaming Multi-AI Debate (@obora/core)           ║${colors.reset}`)
  console.log(`${colors.bold}╚══════════════════════════════════════════════════════════════╝${colors.reset}`)
  console.log(`\n${colors.dim}Topic:${colors.reset}`, TOPIC.trim())

  // Initialize providers
  // Supports both CLI mode (no API keys) and API mode (with keys)
  const providers: { name: string; provider: StreamableProvider }[] = []

  // API mode: Use providers with API keys
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

  // CLI mode: If no API keys, use Claude CLI instances as different "personas"
  if (providers.length < 2) {
    console.log(`\n${colors.dim}No API keys found. Using CLI mode with Claude...${colors.reset}`)

    const claudeCli = new ClaudeProvider() // CLI mode
    const available = await claudeCli.isAvailable()

    if (!available) {
      console.log(`\n${colors.yellow}⚠️  Claude CLI not available.${colors.reset}`)
      console.log(`\nInstall Claude CLI or set API keys:`)
      console.log(`  ANTHROPIC_API_KEY=your_key`)
      console.log(`  OPENAI_API_KEY=your_key`)
      process.exit(1)
    }

    // Create two Claude instances as different debate participants
    providers.length = 0 // Clear any single provider
    providers.push(
      { name: 'claude-a', provider: new ClaudeProvider() },
      { name: 'claude-b', provider: new ClaudeProvider() },
    )
    console.log(`${colors.dim}Running debate between two Claude instances (CLI mode)${colors.reset}`)
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

      case 'round_start': {
        currentParticipant = event.participant || ''
        const color = getParticipantColor(currentParticipant)
        process.stdout.write(`${color}[${currentParticipant}]${colors.reset} `)
        break
      }

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
