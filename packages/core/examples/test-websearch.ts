#!/usr/bin/env bun
/**
 * Test Custom WebSearch Tool
 *
 * This tests the CUSTOM search providers (Tavily, Serper, Exa).
 * For basic fact-checking, use Provider's built-in tools instead:
 *   - ClaudeProvider: enabledTools: ['WebSearch']
 *   - OpenAIProvider: enableWebSearch: true
 *   - GeminiProvider: enabledTools: ['google_web_search']
 *
 * Usage:
 *   TAVILY_API_KEY=your_key bun packages/core/examples/test-websearch.ts
 *   SERPER_API_KEY=your_key bun packages/core/examples/test-websearch.ts
 */

import { webSearch } from '../src'

async function main() {
  console.log('🔍 Custom WebSearch Tool Test\n')

  // Detect provider from environment
  const provider = process.env.TAVILY_API_KEY
    ? 'tavily'
    : process.env.SERPER_API_KEY
      ? 'serper'
      : process.env.EXA_API_KEY
        ? 'exa'
        : null

  const apiKey = process.env.TAVILY_API_KEY || process.env.SERPER_API_KEY || process.env.EXA_API_KEY

  if (!provider || !apiKey) {
    console.log('❌ No API key found.')
    console.log('')
    console.log('Set one of the following environment variables:')
    console.log('  TAVILY_API_KEY=your_key  (recommended for AI)')
    console.log('  SERPER_API_KEY=your_key  (Google search)')
    console.log('  EXA_API_KEY=your_key     (semantic search)')
    console.log('')
    console.log('For basic fact-checking, use Provider built-in tools instead:')
    console.log('  ClaudeProvider({ enabledTools: ["WebSearch"] })')
    process.exit(1)
  }

  console.log(`Provider: ${provider}`)
  console.log('')

  // Test search
  const query = 'Railway SOC2 Type II certification'
  console.log(`Searching: "${query}"\n`)

  try {
    const results = await webSearch(query, { provider, apiKey })

    console.log(`Found ${results.length} results:\n`)
    for (const result of results) {
      console.log(`📄 ${result.title}`)
      console.log(`   ${result.url}`)
      console.log(`   ${result.snippet.slice(0, 150)}...`)
      console.log()
    }
  } catch (error) {
    console.error('❌ Search failed:', error)
    process.exit(1)
  }

  console.log('✅ Test completed')
}

main()
