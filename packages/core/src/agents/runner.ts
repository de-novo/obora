/**
 * AgentRunner - Executes agents with all invocation modes
 *
 * Supports:
 * - delegation: Call & return (function-like)
 * - handoff: Full control transfer
 * - parallel: Independent concurrent execution
 */

import { AgentLoader, parseFrontmatter } from './loader'
import {
  type Agent,
  type AgentChunk,
  type AgentContext,
  type AgentGroup,
  type AgentResult,
  type ConversationEntry,
  createJsonOutput,
  createStructuredOutput,
  createTextOutput,
  type GroupResult,
  type HandoffRequest,
  type HandoffResponse,
  type InvocationMode,
  isJsonOutput,
  isStructuredOutput,
  isTextOutput,
  type ToolCall,
} from './types'

// ============================================================================
// AgentRunner Class
// ============================================================================

export class AgentRunner {
  private loader: AgentLoader
  private sessionCounter = 0
  private activeSessions = new Map<string, AgentContext>()
  private handoffQueue = new Map<string, HandoffRequest>()

  constructor() {
    this.loader = new AgentLoader()
  }

  // ============================================================================
  // Delegation Mode (Call & Return)
  // ============================================================================

  /**
   * Invoke agent in delegation mode - returns result after completion
   */
  async invoke(
    agentName: string,
    task: string,
    options: {
      history?: ConversationEntry[]
      activeFiles?: string[]
      parentSessionId?: string
      timeout?: number
      stream?: boolean
    } = {},
  ): Promise<AgentResult> {
    const sessionId = this.generateSessionId()
    const startTime = Date.now()

    try {
      const agent = await this.loader.load(agentName)
      const fm = agent.frontmatter

      // Build context
      const context: AgentContext = {
        agent,
        task,
        sessionId,
        parentSessionId: options.parentSessionId,
        history: options.history || [],
        activeFiles: options.activeFiles || [],
      }

      // Store context
      this.activeSessions.set(sessionId, context)

      // Generate prompt
      const prompt = this.loader.toPrompt(agent, context)

      // Execute based on output format
      const timeout = options.timeout || fm.invocation.timeout || 60000
      const output = await this.executeAgent(agent, prompt, fm.output, timeout)

      return this.createSuccessResult(output, sessionId, Date.now() - startTime, [])
    } catch (err) {
      return this.createErrorResult(
        err instanceof Error ? err.message : 'Unknown error',
        sessionId,
        Date.now() - startTime,
        [],
      )
    } finally {
      this.activeSessions.delete(sessionId)
    }
  }

  /**
   * Invoke agent with streaming output
   */
  async *invokeStream(
    agentName: string,
    task: string,
    options: {
      history?: ConversationEntry[]
      activeFiles?: string[]
      parentSessionId?: string
      timeout?: number
    } = {},
  ): AsyncGenerator<AgentChunk, void, unknown> {
    const sessionId = this.generateSessionId()

    try {
      const agent = await this.loader.load(agentName)
      const fm = agent.frontmatter

      const context: AgentContext = {
        agent,
        task,
        sessionId,
        parentSessionId: options.parentSessionId,
        history: options.history || [],
        activeFiles: options.activeFiles || [],
      }

      const prompt = this.loader.toPrompt(agent, context)
      const timeout = options.timeout || fm.invocation.timeout || 60000

      // Stream execution
      yield* this.streamExecution(agent, prompt, fm.output, sessionId, timeout)
    } catch (err) {
      yield {
        type: 'metadata',
        content: { error: err instanceof Error ? err.message : 'Unknown error' },
        sessionId,
      }
    }
  }

  // ============================================================================
  // Handoff Mode (Full Control Transfer)
  // ============================================================================

  /**
   * Request handoff to another agent
   */
  async requestHandoff(request: HandoffRequest): Promise<HandoffResponse> {
    const { fromAgent, toAgent, context, reason } = request

    // Check if target agent accepts handoffs
    try {
      const agent = await this.loader.load(toAgent)

      if (agent.frontmatter.handoff?.allowedTransfers?.length) {
        if (!agent.frontmatter.handoff.allowedTransfers.includes(fromAgent)) {
          return {
            accepted: false,
            reason: `Handoff from '${fromAgent}' not allowed by '${toAgent}'`,
          }
        }
      }

      // Prepare transferred context
      const transferredContext = {
        ...context,
        parentSessionId: context.sessionId,
        sessionId: this.generateSessionId(),
      }

      return {
        accepted: true,
        transferredContext,
      }
    } catch {
      return {
        accepted: false,
        reason: `Target agent '${toAgent}' not found`,
      }
    }
  }

  /**
   * Execute handoff - full control transfer to agent
   */
  async handoff(
    agentName: string,
    task: string,
    options: {
      history?: ConversationEntry[]
      activeFiles?: string[]
      parentContext?: Partial<AgentContext>
    } = {},
  ): Promise<AgentResult> {
    const sessionId = this.generateSessionId()
    const startTime = Date.now()

    try {
      const agent = await this.loader.load(agentName)
      const fm = agent.frontmatter

      if (fm.invocation.mode !== 'handoff' && fm.invocation.mode !== 'parallel') {
        console.warn(`Agent '${agentName}' is not configured for handoff mode`)
      }

      // Build extended context for handoff
      const context: AgentContext = {
        agent,
        task,
        sessionId,
        parentSessionId: options.parentContext?.sessionId,
        history: options.history || options.parentContext?.history || [],
        activeFiles: options.activeFiles || options.parentContext?.activeFiles || [],
        metadata: {
          ...options.parentContext?.metadata,
          handoffTime: Date.now(),
          originalTask: options.parentContext?.task,
        },
      }

      this.activeSessions.set(sessionId, context)

      const prompt = this.loader.toPrompt(agent, context)
      const output = await this.executeAgent(agent, prompt, fm.output, fm.invocation.timeout || 120000)

      return this.createSuccessResult(output, sessionId, Date.now() - startTime, [])
    } catch (err) {
      return this.createErrorResult(
        err instanceof Error ? err.message : 'Unknown error',
        sessionId,
        Date.now() - startTime,
        [],
      )
    }
  }

  // ============================================================================
  // Parallel Mode (Concurrent Execution)
  // ============================================================================

  /**
   * Execute multiple agents in parallel
   */
  async executeParallel(
    agentNames: string[],
    task: string,
    options: {
      aggregator?: string
      history?: ConversationEntry[]
      activeFiles?: string[]
    } = {},
  ): Promise<GroupResult> {
    const groupId = `group-${this.generateSessionId()}`
    const startTime = Date.now()

    // Execute all agents concurrently
    const results = await Promise.all(
      agentNames.map((name) =>
        this.invoke(name, task, {
          history: options.history,
          activeFiles: options.activeFiles,
        }),
      ),
    )

    let aggregated: AgentResult['output'] | undefined

    // If aggregator specified, synthesize results
    if (options.aggregator) {
      const aggregatorResult = await this.aggregateResults(options.aggregator, task, results)
      aggregated = aggregatorResult.output
    }

    return {
      groupId,
      results,
      aggregated,
      duration: Date.now() - startTime,
    }
  }

  /**
   * Execute agents in sequence
   */
  async executeSequential(
    agentNames: string[],
    task: string,
    options: {
      history?: ConversationEntry[]
      activeFiles?: string[]
    } = {},
  ): Promise<GroupResult> {
    const groupId = `group-${this.generateSessionId()}`
    const startTime = Date.now()
    const results: AgentResult[] = []

    let currentHistory = options.history || []

    for (const name of agentNames) {
      const result = await this.invoke(name, task, {
        history: currentHistory,
        activeFiles: options.activeFiles,
      })

      results.push(result)

      if (result.success) {
        currentHistory = [
          ...currentHistory,
          {
            role: 'assistant',
            content: this.outputToString(result.output),
            timestamp: Date.now(),
          },
        ]
      }
    }

    return {
      groupId,
      results,
      duration: Date.now() - startTime,
    }
  }

  /**
   * Execute agents in round-robin fashion (for debates)
   */
  async executeRoundRobin(
    agents: { name: string; role: string }[],
    task: string,
    rounds: number,
    options: {
      history?: ConversationEntry[]
      activeFiles?: string[]
    } = {},
  ): Promise<GroupResult> {
    const groupId = `group-${this.generateSessionId()}`
    const startTime = Date.now()
    const results: AgentResult[] = []

    let currentHistory = options.history || []

    for (let round = 0; round < rounds; round++) {
      for (const { name, role } of agents) {
        const result = await this.invoke(name, `[Round ${round + 1}] ${role}: ${task}`, {
          history: currentHistory,
          activeFiles: options.activeFiles,
        })

        results.push(result)

        if (result.success) {
          currentHistory = [
            ...currentHistory,
            {
              role: 'assistant',
              content: `(${role}) ${this.outputToString(result.output)}`,
              timestamp: Date.now(),
              metadata: { round, role },
            },
          ]
        }
      }
    }

    return {
      groupId,
      results,
      duration: Date.now() - startTime,
    }
  }

  // ============================================================================
  // Execution Methods
  // ============================================================================

  /**
   * Execute agent and return output
   */
  private async executeAgent(
    agent: Agent,
    prompt: string,
    outputFormat: Agent['frontmatter']['output'],
    timeout: number,
  ): Promise<AgentResult['output']> {
    // TODO: Integrate with actual LLM provider
    // This is a placeholder that would call the appropriate provider

    // Simulate execution delay
    await new Promise((resolve) => setTimeout(resolve, 100))

    const formatType = outputFormat?.type || 'text'
    const example = outputFormat?.example

    switch (formatType) {
      case 'json':
        return createJsonOutput(
          example || {
            status: 'completed',
            agent: agent.name,
            result: {},
          },
        )

      case 'structured':
        return createStructuredOutput(
          example || {
            status: 'completed',
            agent: agent.name,
            data: {},
          },
          { confidence: 1.0 },
        )

      case 'text':
      default:
        return createTextOutput(
          `[Agent: ${agent.name}] Task completed successfully.\n\n${agent.instructions.slice(0, 200)}...`,
        )
    }
  }

  private async *streamExecution(
    agent: Agent,
    prompt: string,
    outputFormat: Agent['frontmatter']['output'],
    sessionId: string,
    timeout: number,
  ): AsyncGenerator<AgentChunk, void, unknown> {
    // TODO: Integrate with actual streaming LLM provider
    // This is a placeholder for streaming output

    yield {
      type: 'text',
      content: `[${agent.name}] Starting task...`,
      sessionId,
    }

    // Simulate streaming
    const chunks = [
      `Analyzing the request...`,
      `Applying ${agent.frontmatter.persona.role} perspective...`,
      `Formulating response...`,
      `Completed.`,
    ]

    for (const chunk of chunks) {
      yield {
        type: 'text',
        content: chunk,
        sessionId,
      }
    }
  }

  /**
   * Aggregate results from multiple agents
   */
  private async aggregateResults(aggregatorName: string, task: string, results: AgentResult[]): Promise<AgentResult> {
    const sessionId = this.generateSessionId()
    const startTime = Date.now()

    try {
      const aggregator = await this.loader.load(aggregatorName)

      // Build summary of all results
      const summary = results.map((r, i) => ({
        index: i + 1,
        success: r.success,
        output: this.outputToString(r.output),
        error: r.error,
      }))

      const aggregateTask = `
Task: ${task}

Results from ${results.length} agents:
${summary.map((s) => `- Agent ${s.index}: ${s.success ? 'Success' : 'Failed'}`).join('\n')}
${
  results.some((r) => r.success)
    ? `\nCombined outputs:\n${summary
        .filter((s) => s.success)
        .map((s) => s.output)
        .join('\n---\n')}`
    : ''
}

Please synthesize these results into a comprehensive summary.
      `.trim()

      const prompt = this.loader.toPrompt(aggregator, {
        agent: aggregator,
        task: aggregateTask,
        sessionId,
      })

      const output = await this.executeAgent(aggregator, prompt, aggregator.frontmatter.output, 60000)

      return this.createSuccessResult(output, sessionId, Date.now() - startTime, [])
    } catch (err) {
      return this.createErrorResult(
        err instanceof Error ? err.message : 'Unknown error',
        sessionId,
        Date.now() - startTime,
        [],
      )
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * List all available agents
   */
  async listAgents(): Promise<Agent[]> {
    const metadata = await this.loader.discover()
    return Promise.all(metadata.map((m) => this.loader.load(m.name)))
  }

  /**
   * Get agent by name
   */
  async getAgent(name: string): Promise<Agent | null> {
    try {
      return await this.loader.load(name)
    } catch {
      return null
    }
  }

  /**
   * Find agents by type
   */
  async findByType(type: Agent['agentType']): Promise<Agent[]> {
    return this.loader.findByType(type)
  }

  /**
   * Find agents by trigger
   */
  async findByTrigger(trigger: string): Promise<Agent[]> {
    return this.loader.findByTrigger(trigger)
  }

  /**
   * Get agent categories
   */
  async getCategories(): Promise<string[]> {
    return this.loader.getCategories()
  }

  /**
   * Get active session
   */
  getActiveSession(sessionId: string): AgentContext | undefined {
    return this.activeSessions.get(sessionId)
  }

  /**
   * Cancel active session
   */
  cancelSession(sessionId: string): boolean {
    return this.activeSessions.delete(sessionId)
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private generateSessionId(): string {
    return `session-${++this.sessionCounter}-${Date.now().toString(36)}`
  }

  private createSuccessResult(
    output: AgentResult['output'],
    sessionId: string,
    duration: number,
    toolCalls: ToolCall[],
  ): AgentResult {
    return {
      success: true,
      output,
      sessionId,
      duration,
      toolCalls,
    }
  }

  private createErrorResult(error: string, sessionId: string, duration: number, toolCalls: ToolCall[]): AgentResult {
    return {
      success: false,
      output: createTextOutput(`Error: ${error}`),
      error,
      sessionId,
      duration,
      toolCalls,
    }
  }

  private outputToString(output: AgentResult['output']): string {
    if (isTextOutput(output)) {
      return output.content
    }
    if (isStructuredOutput(output)) {
      return JSON.stringify(output.data, null, 2)
    }
    if (isJsonOutput(output)) {
      return JSON.stringify(output.data, null, 2)
    }
    return String(output)
  }
}

// ============================================================================
// Export
// ============================================================================

export { AgentRunner as default }
