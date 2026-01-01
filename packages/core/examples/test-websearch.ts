#!/usr/bin/env bun
/**
 * Test WebSearch Tool
 *
 * Usage:
 *   # With mock provider (default)
 *   bun packages/core/examples/test-websearch.ts
 *
 *   # With Tavily
 *   TAVILY_API_KEY=your_key bun packages/core/examples/test-websearch.ts
 *
 *   # With Serper
 *   SERPER_API_KEY=your_key bun packages/core/examples/test-websearch.ts
 */

import { getWebSearchProviderInfo, webSearch } from '../src'

async function main() {
  console.log('🔍 WebSearch Tool Test\n')

  // Check provider info
  const providerInfo = getWebSearchProviderInfo()
  console.log('Provider Info:')
  console.log(`  Provider: ${providerInfo.provider}`)
  console.log(`  Configured: ${providerInfo.configured}`)
  if (providerInfo.envVar) {
    console.log(`  Env Var: ${providerInfo.envVar}`)
  }
  console.log()

  // Test search
  const query = 'Railway SOC2 Type II certification'
  console.log(`Searching: "${query}"\n`)

  try {
    const results = await webSearch(query)

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
