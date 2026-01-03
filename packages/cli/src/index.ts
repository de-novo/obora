#!/usr/bin/env bun
/**
 * Obora CLI
 *
 * Run multi-AI debates from the command line.
 *
 * Usage:
 *   obora debate "Should we use microservices?"
 *   obora debate "Topic" --mode strong --providers claude,openai
 *   obora debate --file questions.txt --output results/
 */

import { auth } from './commands/auth'
import { debate } from './commands/debate'
import { session } from './commands/session'

const HELP = `
Obora - Multi-AI Debate CLI

Usage:
  obora <command> [options]

Commands:
  auth              Manage OAuth authentication
  debate <topic>    Run a debate on the given topic
  session           Manage session logs and cost tracking

Options:
  -h, --help        Show this help message
  -v, --version     Show version

Examples:
  obora auth login              # Login with Claude Pro/Max
  obora auth login openai       # Login with ChatGPT Plus
  obora auth status             # Check auth status
  obora debate "Should we migrate to microservices?"
  obora session list            # List all logged sessions
  obora session cost            # Show total cost across sessions
`

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    console.log(HELP)
    process.exit(0)
  }

  if (args[0] === '-v' || args[0] === '--version') {
    console.log('obora v0.1.0')
    process.exit(0)
  }

  const command = args[0]

  switch (command) {
    case 'auth':
      await auth(args.slice(1))
      break
    case 'debate':
      await debate(args.slice(1))
      break
    case 'session':
      await session(args.slice(1))
      break
    default:
      console.error(`Unknown command: ${command}`)
      console.log(HELP)
      process.exit(1)
  }
}

main().catch((error) => {
  console.error('Error:', error.message)
  process.exit(1)
})
