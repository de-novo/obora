/**
 * Obora Agent System
 *
 * Claude Code-compatible subagent architecture for multi-AI debate.
 */

export { AgentLoader } from './loader'
import { AgentRunner } from './runner'

export { AgentRunner } from './runner'
export * from './types'

// Pre-built debate agents
export const DEBATE_AGENTS = {
  devilAdvocate: 'devil-advocate',
  factChecker: 'fact-checker',
  synthesizer: 'synthesizer',
} as const

// Helper function to run a debate agent
export async function runDebateAgent(
  agentName: string,
  task: string,
  options?: {
    mode?: 'delegation' | 'handoff'
    stream?: boolean
    history?: import('./types').ConversationEntry[]
    activeFiles?: string[]
    parentSessionId?: string
    timeout?: number
  },
) {
  const runner = new AgentRunner()

  if (options?.stream) {
    return runner.invokeStream(agentName, task, options)
  }

  return runner.invoke(agentName, task, options)
}
