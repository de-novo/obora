import { parseArgs } from 'node:util'
import { type SessionDetails, sessionManager } from '@obora/core'

const HELP = `
Usage: obora session <subcommand> [options]

Subcommands:
  list              List all sessions
  show <id>         Show details of a session
  cost [id]         Show cost summary (all sessions or specific)
  clean [--before <days>]  Remove old sessions

Options:
  -h, --help        Show this help message
  --json            Output as JSON

Examples:
  obora session list
  obora session list --json
  obora session show 01JGXYZ123ABC
  obora session cost
  obora session cost 01JGXYZ123ABC
  obora session clean --before 30
`

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

function formatCost(usd: number | undefined): string {
  if (usd === undefined) return 'N/A'
  return `$${usd.toFixed(4)}`
}

function formatTokens(count: number | undefined): string {
  if (count === undefined) return 'N/A'
  if (count < 1000) return count.toString()
  return `${(count / 1000).toFixed(1)}k`
}

async function listSessions(json: boolean) {
  const sessions = await sessionManager.list()

  if (sessions.length === 0) {
    console.log('No sessions found.')
    return
  }

  if (json) {
    console.log(JSON.stringify(sessions, null, 2))
    return
  }

  console.log(`${colors.bold}Sessions (${sessions.length})${colors.reset}\n`)
  console.log(
    `${'ID'.padEnd(28)} ${'Status'.padEnd(10)} ${'Features'.padEnd(15)} ${'Created'.padEnd(20)} ${'Cost'.padEnd(10)}`,
  )
  console.log('-'.repeat(90))

  for (const session of sessions) {
    const statusColor =
      session.status === 'completed' ? colors.green : session.status === 'failed' ? colors.red : colors.yellow
    const status = `${statusColor}${session.status}${colors.reset}`
    const features = session.features.join(', ') || '-'
    const created = formatDate(session.createdAt)
    const cost = formatCost(session.costUsd)

    console.log(`${session.id.padEnd(28)} ${status.padEnd(19)} ${features.padEnd(15)} ${created.padEnd(20)} ${cost}`)
  }
}

async function showSession(id: string, json: boolean) {
  const details = await sessionManager.get(id)
  if (!details) {
    console.error(`Session not found: ${id}`)
    process.exit(1)
  }

  if (json) {
    console.log(JSON.stringify(details, null, 2))
    return
  }

  console.log(`${colors.bold}Session: ${details.id}${colors.reset}`)
  console.log()
  console.log(`  Status:    ${details.status}`)
  console.log(`  Features:  ${details.features.join(', ') || 'none'}`)
  console.log(`  Created:   ${formatDate(details.createdAt)}`)
  console.log(`  Updated:   ${formatDate(details.updatedAt)}`)
  console.log(`  Directory: ${details.cwd || 'N/A'}`)

  if (details.summary) {
    console.log()
    console.log(`${colors.bold}Usage Summary${colors.reset}`)
    console.log(`  Input tokens:  ${formatTokens(details.summary.inputTokens)}`)
    console.log(`  Output tokens: ${formatTokens(details.summary.outputTokens)}`)
    console.log(`  Total tokens:  ${formatTokens(details.summary.totalTokens)}`)
    console.log(`  Cost:          ${formatCost(details.summary.costUsd)}`)
    if (details.summary.providers?.length) {
      console.log(`  Providers:     ${details.summary.providers.join(', ')}`)
    }
    if (details.summary.models?.length) {
      console.log(`  Models:        ${details.summary.models.join(', ')}`)
    }
  }

  console.log()
  console.log(`${colors.bold}Events (${details.events.length})${colors.reset}`)

  const eventSummary: Record<string, number> = {}
  for (const event of details.events) {
    eventSummary[event.type] = (eventSummary[event.type] || 0) + 1
  }

  for (const [type, count] of Object.entries(eventSummary)) {
    console.log(`  ${type}: ${count}`)
  }
}

async function showCost(id?: string, json?: boolean) {
  if (id) {
    const cost = await sessionManager.getCostSummary(id)
    if (!cost) {
      console.error(`Session not found: ${id}`)
      process.exit(1)
    }

    if (json) {
      console.log(JSON.stringify({ sessionId: id, ...cost }, null, 2))
      return
    }

    console.log(`${colors.bold}Cost: ${id}${colors.reset}`)
    console.log(`  Input tokens:  ${formatTokens(cost.inputTokens)}`)
    console.log(`  Output tokens: ${formatTokens(cost.outputTokens)}`)
    console.log(`  Total tokens:  ${formatTokens(cost.totalTokens)}`)
    console.log(`  Estimated:     ${formatCost(cost.costUsd)}`)
    return
  }

  const totalCost = await sessionManager.getTotalCost()
  const sessions = await sessionManager.list()

  if (json) {
    console.log(
      JSON.stringify(
        {
          sessionCount: sessions.length,
          ...totalCost,
        },
        null,
        2,
      ),
    )
    return
  }

  console.log(`${colors.bold}Total Cost Summary${colors.reset}`)
  console.log(`  Sessions:      ${sessions.length}`)
  console.log(`  Input tokens:  ${formatTokens(totalCost.inputTokens)}`)
  console.log(`  Output tokens: ${formatTokens(totalCost.outputTokens)}`)
  console.log(`  Total tokens:  ${formatTokens(totalCost.totalTokens)}`)
  console.log(`  Total cost:    ${formatCost(totalCost.costUsd)}`)
}

async function cleanSessions(beforeDays: number) {
  const deleted = await sessionManager.cleanup(beforeDays)
  console.log(`Deleted ${deleted} session(s) older than ${beforeDays} days.`)
}

export async function session(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean' },
      before: { type: 'string' },
    },
    allowPositionals: true,
  })

  if (values.help || positionals.length === 0) {
    console.log(HELP)
    return
  }

  const subcommand = positionals[0]

  switch (subcommand) {
    case 'list':
      await listSessions(!!values.json)
      break

    case 'show':
      if (!positionals[1]) {
        console.error('Error: Session ID required')
        console.log('Usage: obora session show <id>')
        process.exit(1)
      }
      await showSession(positionals[1], !!values.json)
      break

    case 'cost':
      await showCost(positionals[1], !!values.json)
      break

    case 'clean': {
      const beforeDays = values.before ? parseInt(values.before, 10) : 30
      if (isNaN(beforeDays) || beforeDays < 1) {
        console.error('Error: --before must be a positive number')
        process.exit(1)
      }
      await cleanSessions(beforeDays)
      break
    }

    default:
      console.error(`Unknown subcommand: ${subcommand}`)
      console.log(HELP)
      process.exit(1)
  }
}
