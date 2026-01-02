import { GeminiProvider } from '../src/providers/gemini'

async function main() {
  console.log('Testing Gemini WebSearch (Google Search Grounding)...\n')

  const gemini = new GeminiProvider({
    enabledTools: ['google_web_search'],
  })

  console.log('Running query: "What is the current price of Bitcoin?"')
  console.log('---')

  const result = await gemini.run('What is the current price of Bitcoin? Search the web for the latest information.')

  console.log('\nResult:')
  console.log(result.content)
  console.log('\nMetadata:')
  console.log(JSON.stringify(result.metadata, null, 2))
}

main().catch(console.error)
