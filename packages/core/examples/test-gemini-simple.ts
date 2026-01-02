#!/usr/bin/env bun
/**
 * Simple Gemini test
 */

import { GeminiProvider } from '../src'

async function main() {
  console.log('Testing Gemini provider...')

  const gemini = new GeminiProvider()

  console.log('Checking availability...')
  const available = await gemini.isAvailable()
  console.log('Available:', available)

  if (!available) {
    console.log('Gemini not available')
    return
  }

  console.log('Current backend:', await gemini.getCurrentBackendType())

  console.log('Sending test message...')
  const response = await gemini.run('Say "Hello from Gemini!" and nothing else.')
  console.log('Response:', response.content)
}

main().catch((err) => {
  console.error('Error:', err.message)
  console.error(err.stack)
})
