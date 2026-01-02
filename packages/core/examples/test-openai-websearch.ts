import { OpenAIProvider } from '../src/providers/openai'

async function main() {
  console.log('Testing OpenAI WebSearch integration...\n')

  const openai = new OpenAIProvider({
    enabledTools: ['WebSearch'],
  })

  console.log('Running query: "What is the current price of Bitcoin?"')
  console.log('---')

  const result = await openai.run('What is the current price of Bitcoin? Search the web for the latest information.')

  console.log('\nResult:')
  console.log(result.content)
  console.log('\nMetadata:')
  console.log(JSON.stringify(result.metadata, null, 2))
}

main().catch(console.error)
