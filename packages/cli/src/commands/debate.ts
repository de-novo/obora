/**
 * Debate Command
 *
 * Run a multi-AI debate on a given topic.
 */

import { parseArgs } from 'node:util'
import {
  ClaudeProvider,
  createNoopLogger,
  DebateEngine,
  type DebateParticipant,
  GeminiProvider,
  OpenAIProvider,
  SessionLogger,
  type SessionLoggerInstance,
  type StreamableProvider,
  type StreamingParticipant,
} from '@obora/core'

const HELP = `
Usage: obora debate <topic> [options]

Arguments:
  topic                 The topic to debate (required unless --file is used)

Options:
  -m, --mode <mode>     Debate mode: strong, weak (default: strong)
  -p, --providers <list> Comma-separated list of providers (default: claude,openai)
                        Available: claude, openai, gemini
  -s, --streaming       Enable streaming output
  -o, --output <path>   Save results to file (JSON)
  -f, --file <path>     Read topic from file
  -l, --log             Enable session logging for cost tracking
  --log-dir <path>      Custom directory for session logs (default: ~/.config/obora/sessions)
  -h, --help            Show this help message

Examples:
  obora debate "Should we use microservices?"
  obora debate "Topic" --mode strong --providers claude,openai
  obora debate "Topic" --streaming
  obora debate "Topic" --output result.json
  obora debate "Topic" --log                    # Enable session logging
  obora debate "Topic" --log --log-dir ./logs   # Custom log directory
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

function getProviderColor(name: string): string {
  if (name.startsWith('claude')) return colors.cyan
  if (name.startsWith('openai')) return colors.green
  if (name.startsWith('gemini')) return colors.yellow
  return colors.magenta
}

type ProviderName = 'claude' | 'openai' | 'gemini'

function createProvider(name: ProviderName): StreamableProvider {
  switch (name) {
    case 'claude':
      return new ClaudeProvider()
    case 'openai':
      return new OpenAIProvider()
    case 'gemini':
      return new GeminiProvider()
    default:
      throw new Error(`Unknown provider: ${name}`)
  }
}

export async function debate(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      mode: { type: 'string', short: 'm', default: 'strong' },
      providers: { type: 'string', short: 'p', default: 'claude,openai' },
      streaming: { type: 'boolean', short: 's', default: false },
      output: { type: 'string', short: 'o' },
      file: { type: 'string', short: 'f' },
      log: { type: 'boolean', short: 'l', default: false },
      'log-dir': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })

  if (values.help) {
    console.log(HELP)
    return
  }

  // Get topic
  let topic: string
  if (values.file) {
    topic = await Bun.file(values.file).text()
  } else if (positionals.length > 0) {
    topic = positionals.join(' ')
  } else {
    console.error('Error: Topic is required')
    console.log(HELP)
    process.exit(1)
  }

  // Parse providers
  const providerNames = values.providers!.split(',').map((p) => p.trim()) as ProviderName[]

  // Validate providers
  const validProviders = ['claude', 'openai', 'gemini']
  for (const name of providerNames) {
    if (!validProviders.includes(name)) {
      console.error(`Error: Unknown provider: ${name}`)
      console.error(`Available providers: ${validProviders.join(', ')}`)
      process.exit(1)
    }
  }

  if (providerNames.length < 2) {
    console.error('Error: At least 2 providers are required for a debate')
    process.exit(1)
  }

  // Create providers and check availability
  console.log(`${colors.bold}🔍 Checking providers...${colors.reset}`)
  const participants: StreamingParticipant[] = []

  for (const name of providerNames) {
    const provider = createProvider(name)
    const available = await provider.isAvailable()
    const status = available ? `${colors.green}✓${colors.reset}` : `${colors.dim}✗${colors.reset}`
    console.log(`   ${status} ${name}`)

    if (available) {
      participants.push({ name, provider })
    }
  }

  if (participants.length < 2) {
    console.error('\nError: At least 2 available providers are required')
    console.error('Install CLI tools or set API keys:')
    console.error('  - Claude: Install claude CLI or set ANTHROPIC_API_KEY')
    console.error('  - OpenAI: Install codex CLI or set OPENAI_API_KEY')
    console.error('  - Gemini: Install gemini CLI or set GOOGLE_API_KEY')
    process.exit(1)
  }

  const mode = values.mode as 'strong' | 'weak'
  const engine = new DebateEngine({ mode })

  const logger: SessionLoggerInstance = values.log
    ? await SessionLogger.create({
        feature: 'debate',
        config: { dir: values['log-dir'], logPrompts: false, logResponses: true },
      })
    : createNoopLogger()

  if (values.log) {
    console.log(`${colors.dim}Session: ${logger.id}${colors.reset}`)
  }

  console.log(`\n${colors.bold}📋 Topic:${colors.reset} ${topic.trim()}`)
  console.log(`${colors.dim}Mode: ${mode} | Participants: ${participants.map((p) => p.name).join(', ')}${colors.reset}`)

  try {
    if (values.streaming) {
      await runStreamingDebate(engine, topic, participants, logger)
    } else {
      await runNormalDebate(engine, topic, participants, logger, values.output)
    }
    await logger.close('completed')
  } catch (error) {
    await logger.close('failed')
    throw error
  }

  if (values.log && logger.id !== 'noop') {
    console.log(`\n${colors.dim}Session saved: ${logger.dir}${colors.reset}`)
  }
}

async function runNormalDebate(
  engine: DebateEngine,
  topic: string,
  participants: DebateParticipant[],
  logger: SessionLoggerInstance,
  outputPath?: string,
) {
  console.log(`\n${colors.bold}🚀 Starting debate...${colors.reset}\n`)
  const startTime = Date.now()

  await logger.log('session.started', { argv: process.argv })

  const result = await engine.run({
    topic,
    participants,
    orchestrator: participants[0]?.provider,
  })

  for (const round of result.rounds) {
    await logger.log(
      'debate.round.ended',
      { phase: round.phase, speaker: round.speaker, roundIndex: 0, response: round.content },
      { feature: 'debate' },
    )
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log(`${colors.bold}━━━ Results ━━━${colors.reset}`)
  console.log(`Time: ${elapsed}s | Rounds: ${result.rounds.length}`)

  if (result.positionChanges.length > 0) {
    console.log(`\n${colors.yellow}Position Changes:${colors.reset}`)
    for (const change of result.positionChanges) {
      console.log(`  - ${change.participant}: ${change.reason}`)
    }
  }

  console.log(`\n${colors.bold}━━━ Consensus ━━━${colors.reset}`)
  console.log(result.consensus || 'No consensus reached')

  if (outputPath) {
    await Bun.write(outputPath, JSON.stringify(result, null, 2))
    console.log(`\n${colors.green}✓${colors.reset} Results saved to ${outputPath}`)
  }

  await logger.saveArtifact('result.json', result)
}

async function runStreamingDebate(
  engine: DebateEngine,
  topic: string,
  participants: StreamingParticipant[],
  logger: SessionLoggerInstance,
) {
  console.log(`\n${colors.bold}🚀 Starting streaming debate...${colors.reset}\n`)

  const orchestrator = participants[0]?.provider
  if (!orchestrator) {
    console.error('No orchestrator available')
    process.exit(1)
  }

  await logger.log('session.started', { argv: process.argv })

  let currentPhase: 'initial' | 'rebuttal' | 'revised' | 'consensus' = 'initial'
  let roundIndex = 0
  let currentResponse = ''

  for await (const event of engine.runStreaming({
    topic,
    participants,
    orchestrator,
  })) {
    switch (event.type) {
      case 'phase_start':
        if (event.phase) {
          currentPhase = event.phase
          console.log(`\n${colors.bold}━━━ ${event.phase.toUpperCase()} ━━━${colors.reset}\n`)
          await logger.log(
            'debate.phase.started',
            { phase: currentPhase, participants: participants.map((p) => p.name) },
            { feature: 'debate' },
          )
          roundIndex = 0
        }
        break

      case 'round_start': {
        const speaker = event.participant || 'unknown'
        const color = getProviderColor(speaker)
        process.stdout.write(`${color}[${speaker}]${colors.reset} `)
        await logger.log('debate.round.started', { phase: currentPhase, speaker, roundIndex }, { feature: 'debate' })
        currentResponse = ''
        break
      }

      case 'chunk':
        process.stdout.write(event.chunk || '')
        currentResponse += event.chunk || ''
        break

      case 'round_end': {
        const speaker = event.participant || 'unknown'
        console.log('\n')
        await logger.log(
          'debate.round.ended',
          { phase: currentPhase, speaker, roundIndex, response: currentResponse },
          {
            feature: 'debate',
            usage: event.usage
              ? {
                  inputTokens: event.usage.inputTokens,
                  outputTokens: event.usage.outputTokens,
                  totalTokens: event.usage.totalTokens,
                  provider: speaker,
                  model: event.usage.model,
                }
              : undefined,
          },
        )
        roundIndex++
        currentResponse = ''
        break
      }
    }
  }

  console.log(`${colors.bold}✅ Debate complete${colors.reset}`)
}
