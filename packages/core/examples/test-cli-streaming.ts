#!/usr/bin/env bun
/**
 * Test CLI Streaming
 *
 * Tests streaming output from Claude CLI (headless mode).
 * No API key required - uses `claude -p` command.
 *
 * Usage:
 *   bun packages/core/examples/test-cli-streaming.ts
 */

import { ClaudeProvider } from '../src'

async function main() {
  console.log('🌊 CLI Streaming Test\n')

  const claude = new ClaudeProvider({
    // No apiKey - uses CLI backend
  })

  // Check availability
  const available = await claude.isAvailable()
  if (!available) {
    console.log('❌ Claude CLI not available. Install claude CLI first.')
    process.exit(1)
  }

  console.log('✅ Claude CLI available')
  console.log('📝 Streaming response...\n')
  console.log('─'.repeat(50))

  const prompt = 'Write a haiku about programming. Be concise.'

  let fullContent = ''
  for await (const { chunk, done } of claude.stream(prompt)) {
    if (!done && chunk) {
      process.stdout.write(chunk)
      fullContent += chunk
    }
  }

  console.log('\n' + '─'.repeat(50))
  console.log(`\n✅ Streaming complete (${fullContent.length} chars)`)
}

main().catch(console.error)
