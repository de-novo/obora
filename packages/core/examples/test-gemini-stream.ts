#!/usr/bin/env bun
/**
 * Gemini Streaming Test
 */

import { GeminiProvider } from '../src'

async function main() {
  console.log('Testing Gemini streaming...\n')

  const gemini = new GeminiProvider()

  console.log('Sending: "Write a detailed explanation of how Kubernetes works, with examples."')
  console.log('---')
  console.log('Streaming response:')
  console.log('---')

  let chunkCount = 0
  let totalChars = 0

  for await (const event of gemini.stream('Write a detailed explanation of how Kubernetes works, with examples.')) {
    if (event.chunk) {
      chunkCount++
      totalChars += event.chunk.length
      process.stdout.write(event.chunk)
    }
    if (event.done) {
      console.log('\n---')
      console.log(`Streaming complete!`)
      console.log(`Total chunks: ${chunkCount}`)
      console.log(`Total characters: ${totalChars}`)
    }
  }
}

main().catch(console.error)
