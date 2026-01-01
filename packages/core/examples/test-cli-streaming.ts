#!/usr/bin/env bun
/**
 * Test CLI Streaming for All Providers
 *
 * Tests streaming output from CLI (headless mode) for:
 * - Claude: `claude -p`
 * - OpenAI: `codex exec`
 * - Gemini: `gemini`
 *
 * No API keys required - uses CLI tools directly.
 *
 * Usage:
 *   bun packages/core/examples/test-cli-streaming.ts
 *   bun packages/core/examples/test-cli-streaming.ts claude
 *   bun packages/core/examples/test-cli-streaming.ts codex
 *   bun packages/core/examples/test-cli-streaming.ts gemini
 */

import { ClaudeProvider, GeminiProvider, OpenAIProvider, type StreamableProvider } from '../src'

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
}

interface ProviderInfo {
  name: string
  provider: StreamableProvider
  color: string
}

async function testProvider(info: ProviderInfo): Promise<boolean> {
  const { name, provider, color } = info

  const available = await provider.isAvailable()
  if (!available) {
    console.log(`${colors.dim}[${name}] Not available (CLI not installed)${colors.reset}`)
    return false
  }

  console.log(`\n${color}[${name}]${colors.reset} Streaming...`)
  console.log('─'.repeat(50))

  const prompt = 'Write a haiku about programming. Be concise, output only the haiku.'

  let fullContent = ''
  try {
    for await (const { chunk, done } of provider.stream(prompt)) {
      if (!done && chunk) {
        process.stdout.write(chunk)
        fullContent += chunk
      }
    }
    console.log('\n' + '─'.repeat(50))
    console.log(`${colors.green}✓${colors.reset} ${fullContent.length} chars`)
    return true
  } catch (error) {
    console.log(`\n${colors.red}✗ Error: ${error}${colors.reset}`)
    return false
  }
}

async function main() {
  console.log(`${colors.bold}🌊 CLI Streaming Test${colors.reset}\n`)

  const providers: ProviderInfo[] = [
    { name: 'claude', provider: new ClaudeProvider(), color: colors.cyan },
    { name: 'codex', provider: new OpenAIProvider(), color: colors.green },
    { name: 'gemini', provider: new GeminiProvider(), color: colors.yellow },
  ]

  // Filter by argument if provided
  const filter = process.argv[2]
  const toTest = filter ? providers.filter((p) => p.name === filter) : providers

  if (filter && toTest.length === 0) {
    console.log(`Unknown provider: ${filter}`)
    console.log(`Available: ${providers.map((p) => p.name).join(', ')}`)
    process.exit(1)
  }

  let successCount = 0
  for (const provider of toTest) {
    if (await testProvider(provider)) {
      successCount++
    }
  }

  console.log(`\n${colors.bold}Results: ${successCount}/${toTest.length} providers working${colors.reset}`)
}

main().catch(console.error)
