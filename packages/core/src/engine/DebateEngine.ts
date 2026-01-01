/**
 * Debate Engine
 *
 * Orchestrates multi-AI debates with structured phases.
 * Supports both 'strong' (with rebuttals) and 'weak' (simple rounds) modes.
 */

import type { Tool } from 'ai'
import type { Provider, StreamableProvider } from '../providers/types'
import type { DebateEngineConfig, DebatePhase, DebateResult, DebateRound, PositionChange, ToolCall } from './types'

export interface DebateParticipant {
  name: string
  provider: Provider
}

/**
 * Streaming participant with stream() method
 */
export interface StreamingParticipant extends DebateParticipant {
  provider: StreamableProvider
}

/**
 * Streaming event emitted during debate
 */
export interface DebateStreamEvent {
  type: 'chunk' | 'round_start' | 'round_end' | 'phase_start' | 'phase_end'
  phase?: DebatePhase
  participant?: string
  chunk?: string
  content?: string
  timestamp: number
}

export interface DebateOptions {
  topic: string
  participants: DebateParticipant[]
  orchestrator?: Provider
  config?: Partial<DebateEngineConfig>
}

export interface StreamingDebateOptions extends DebateOptions {
  participants: StreamingParticipant[]
}

const DEFAULT_CONFIG: DebateEngineConfig = {
  mode: 'strong',
  maxRounds: 10,
  timeout: 300000, // 5 minutes
  toolPhases: ['rebuttal'], // Enable tools during rebuttal by default
}

/**
 * Prompt templates for each debate phase
 */
const PROMPTS = {
  initial: (topic: string) => `Topic: ${topic}

You must present a clear position as an expert on this topic.
- Provide a specific recommendation
- Clearly explain the reasoning behind your choice
- Also mention potential risks`,

  rebuttal: (topic: string, othersOpinions: string, hasTools: boolean) => `Topic: ${topic}

Other experts' opinions:
${othersOpinions}

Your role: Critical Reviewer
Point out problems, gaps, and underestimated risks in the above opinions.
- Find weaknesses even if you agree
- Avoid phrases like "Good point, but..."
- Provide specific counterexamples or failure scenarios
- Specify conditions under which the approach could fail${
    hasTools
      ? `

IMPORTANT: Before making factual claims, use the webSearch tool to verify:
- Service certifications (SOC2, HIPAA, etc.)
- Current pricing or feature availability
- Recent announcements or changes
- Technical specifications

Example: If you claim "Service X lacks SOC2", search to confirm this is current.`
      : ''
  }`,

  revised: (topic: string, allHistory: string) => `Topic: ${topic}

Discussion so far:
${allHistory}

Considering other experts' rebuttals:
1. Revise your initial position if needed
2. Defend with stronger evidence if you maintain your position
3. Present your final recommendation`,

  consensus: (historyStr: string) => `You are the debate moderator. An intense debate has concluded.

Full debate transcript:
${historyStr}

Please summarize:
1. Points of agreement (what all experts agreed on)
2. Unresolved disagreements (where opinions still differ and each position)
3. Final recommendation (practical approach considering disagreements)
4. Cautions (risks raised in rebuttals that must be considered)`,
}

export class DebateEngine {
  private config: DebateEngineConfig

  constructor(config: Partial<DebateEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Run a debate on the given topic
   */
  async run(options: DebateOptions): Promise<DebateResult> {
    const { topic, participants, orchestrator } = options
    const config = { ...this.config, ...options.config }

    const startTime = Date.now()
    const rounds: DebateRound[] = []
    const history: { role: string; content: string }[] = [{ role: 'user', content: topic }]
    const positionChanges: PositionChange[] = []

    if (config.mode === 'strong') {
      // Phase 1: Initial positions
      await this.runPhase('initial', topic, participants, rounds, history)

      // Phase 2: Rebuttal round (with tools if configured)
      const rebuttalTools = config.toolPhases?.includes('rebuttal') ? config.tools : undefined
      await this.runRebuttalPhase(topic, participants, rounds, history, rebuttalTools)

      // Phase 3: Revised positions (detect position changes)
      const initialPositions = this.extractPositions(rounds, 'initial')
      await this.runRevisedPhase(topic, participants, rounds, history)
      const revisedPositions = this.extractPositions(rounds, 'revised')

      // Detect position changes
      for (const participant of participants) {
        const initial = initialPositions.get(participant.name)
        const revised = revisedPositions.get(participant.name)
        if (initial && revised && this.hasPositionChanged(initial, revised)) {
          positionChanges.push({
            participant: participant.name,
            from: initial,
            to: revised,
            reason: 'Revised after rebuttal phase',
            phase: 'revised',
          })
        }
      }
    } else {
      // Weak mode: Simple rounds without rebuttals
      await this.runPhase('initial', topic, participants, rounds, history)
    }

    // Phase 4: Consensus (if orchestrator provided)
    let consensus = ''
    if (orchestrator) {
      const historyStr = history.map((m) => `[${m.role}] ${m.content}`).join('\n\n---\n\n')
      const response = await orchestrator.run(PROMPTS.consensus(historyStr))
      consensus = response.content
      rounds.push({
        phase: 'consensus',
        speaker: 'orchestrator',
        content: consensus,
        timestamp: Date.now(),
      })
    }

    const endTime = Date.now()

    return {
      topic,
      mode: config.mode,
      rounds,
      consensus,
      positionChanges,
      unresolvedDisagreements: this.extractDisagreements(consensus),
      metadata: {
        startTime,
        endTime,
        totalDurationMs: endTime - startTime,
        participantCount: participants.length,
      },
    }
  }

  private async runPhase(
    phase: DebatePhase,
    topic: string,
    participants: DebateParticipant[],
    rounds: DebateRound[],
    history: { role: string; content: string }[],
  ): Promise<void> {
    for (const participant of participants) {
      const prompt = PROMPTS.initial(topic)
      const response = await participant.provider.run(prompt)

      rounds.push({
        phase,
        speaker: participant.name,
        content: response.content,
        timestamp: Date.now(),
      })
      history.push({ role: participant.name, content: response.content })
    }
  }

  private async runRebuttalPhase(
    topic: string,
    participants: DebateParticipant[],
    rounds: DebateRound[],
    history: { role: string; content: string }[],
    tools?: Record<string, Tool>,
  ): Promise<void> {
    const hasTools = tools && Object.keys(tools).length > 0

    for (const participant of participants) {
      const othersOpinions = history
        .filter((h) => h.role !== 'user' && h.role !== participant.name)
        .map((h) => `[${h.role}] ${h.content}`)
        .join('\n\n---\n\n')

      const prompt = PROMPTS.rebuttal(topic, othersOpinions, !!hasTools)

      // TODO: Implement actual tool calling with AI SDK generateText
      // For now, just use regular provider with enhanced prompt
      const response = await participant.provider.run(prompt)

      rounds.push({
        phase: 'rebuttal',
        speaker: participant.name,
        content: response.content,
        timestamp: Date.now(),
        // toolCalls will be populated when tool integration is complete
      })
      history.push({
        role: `${participant.name}(rebuttal)`,
        content: response.content,
      })
    }
  }

  private async runRevisedPhase(
    topic: string,
    participants: DebateParticipant[],
    rounds: DebateRound[],
    history: { role: string; content: string }[],
  ): Promise<void> {
    for (const participant of participants) {
      const allHistory = history
        .filter((h) => h.role !== 'user')
        .map((h) => `[${h.role}] ${h.content}`)
        .join('\n\n---\n\n')

      const prompt = PROMPTS.revised(topic, allHistory)
      const response = await participant.provider.run(prompt)

      rounds.push({
        phase: 'revised',
        speaker: participant.name,
        content: response.content,
        timestamp: Date.now(),
      })
      history.push({
        role: `${participant.name}(final)`,
        content: response.content,
      })
    }
  }

  private extractPositions(rounds: DebateRound[], phase: DebatePhase): Map<string, string> {
    const positions = new Map<string, string>()
    for (const round of rounds) {
      if (round.phase === phase) {
        positions.set(round.speaker, round.content)
      }
    }
    return positions
  }

  private hasPositionChanged(initial: string, revised: string): boolean {
    // Simple heuristic: check if the revised position differs significantly
    // In practice, this could use semantic similarity
    const _normalizedInitial = initial.toLowerCase().trim()
    const normalizedRevised = revised.toLowerCase().trim()

    // Check for explicit change indicators
    const changeIndicators = [
      'i have revised',
      'i now agree',
      'i changed my position',
      'reconsidering',
      'after reviewing',
      'i must acknowledge',
      'my position has evolved',
    ]

    return changeIndicators.some((indicator) => normalizedRevised.includes(indicator))
  }

  private extractDisagreements(consensus: string): string[] {
    // Extract disagreements from consensus text
    // Look for section about unresolved disagreements
    const lines = consensus.split('\n')
    const disagreements: string[] = []
    let inDisagreementSection = false

    for (const line of lines) {
      const lowerLine = line.toLowerCase()
      if (lowerLine.includes('unresolved') || lowerLine.includes('disagreement')) {
        inDisagreementSection = true
        continue
      }
      if (inDisagreementSection && (lowerLine.includes('recommendation') || lowerLine.includes('caution'))) {
        break
      }
      if (inDisagreementSection && line.trim().startsWith('-')) {
        disagreements.push(line.trim().substring(1).trim())
      }
    }

    return disagreements
  }

  /**
   * Get the current configuration
   */
  getConfig(): DebateEngineConfig {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<DebateEngineConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Run a debate with streaming responses
   *
   * @example
   * ```typescript
   * for await (const event of engine.runStreaming(options)) {
   *   if (event.type === 'chunk') {
   *     process.stdout.write(event.chunk);
   *   }
   * }
   * ```
   */
  async *runStreaming(options: StreamingDebateOptions): AsyncGenerator<DebateStreamEvent> {
    const { topic, participants, orchestrator } = options
    const config = { ...this.config, ...options.config }
    const history: { role: string; content: string }[] = [{ role: 'user', content: topic }]

    // Phase 1: Initial positions with streaming
    yield { type: 'phase_start', phase: 'initial', timestamp: Date.now() }

    for (const participant of participants) {
      yield {
        type: 'round_start',
        phase: 'initial',
        participant: participant.name,
        timestamp: Date.now(),
      }

      const prompt = PROMPTS.initial(topic)
      let content = ''

      for await (const { chunk, done } of participant.provider.stream(prompt)) {
        if (!done && chunk) {
          content += chunk
          yield {
            type: 'chunk',
            phase: 'initial',
            participant: participant.name,
            chunk,
            timestamp: Date.now(),
          }
        }
      }

      history.push({ role: participant.name, content })

      yield {
        type: 'round_end',
        phase: 'initial',
        participant: participant.name,
        content,
        timestamp: Date.now(),
      }
    }

    yield { type: 'phase_end', phase: 'initial', timestamp: Date.now() }

    if (config.mode === 'strong') {
      // Phase 2: Rebuttal with streaming
      yield { type: 'phase_start', phase: 'rebuttal', timestamp: Date.now() }

      for (const participant of participants) {
        yield {
          type: 'round_start',
          phase: 'rebuttal',
          participant: participant.name,
          timestamp: Date.now(),
        }

        const othersOpinions = history
          .filter((h) => h.role !== 'user' && h.role !== participant.name)
          .map((h) => `[${h.role}] ${h.content}`)
          .join('\n\n---\n\n')

        // Streaming mode doesn't support tools yet
        const prompt = PROMPTS.rebuttal(topic, othersOpinions, false)
        let content = ''

        for await (const { chunk, done } of participant.provider.stream(prompt)) {
          if (!done && chunk) {
            content += chunk
            yield {
              type: 'chunk',
              phase: 'rebuttal',
              participant: participant.name,
              chunk,
              timestamp: Date.now(),
            }
          }
        }

        history.push({ role: `${participant.name}(rebuttal)`, content })

        yield {
          type: 'round_end',
          phase: 'rebuttal',
          participant: participant.name,
          content,
          timestamp: Date.now(),
        }
      }

      yield { type: 'phase_end', phase: 'rebuttal', timestamp: Date.now() }

      // Phase 3: Revised positions with streaming
      yield { type: 'phase_start', phase: 'revised', timestamp: Date.now() }

      for (const participant of participants) {
        yield {
          type: 'round_start',
          phase: 'revised',
          participant: participant.name,
          timestamp: Date.now(),
        }

        const allHistory = history
          .filter((h) => h.role !== 'user')
          .map((h) => `[${h.role}] ${h.content}`)
          .join('\n\n---\n\n')

        const prompt = PROMPTS.revised(topic, allHistory)
        let content = ''

        for await (const { chunk, done } of participant.provider.stream(prompt)) {
          if (!done && chunk) {
            content += chunk
            yield {
              type: 'chunk',
              phase: 'revised',
              participant: participant.name,
              chunk,
              timestamp: Date.now(),
            }
          }
        }

        history.push({ role: `${participant.name}(final)`, content })

        yield {
          type: 'round_end',
          phase: 'revised',
          participant: participant.name,
          content,
          timestamp: Date.now(),
        }
      }

      yield { type: 'phase_end', phase: 'revised', timestamp: Date.now() }
    }

    // Phase 4: Consensus (non-streaming for orchestrator)
    if (orchestrator) {
      yield { type: 'phase_start', phase: 'consensus', timestamp: Date.now() }

      const historyStr = history.map((m) => `[${m.role}] ${m.content}`).join('\n\n---\n\n')

      const response = await orchestrator.run(PROMPTS.consensus(historyStr))

      yield {
        type: 'round_end',
        phase: 'consensus',
        participant: 'orchestrator',
        content: response.content,
        timestamp: Date.now(),
      }

      yield { type: 'phase_end', phase: 'consensus', timestamp: Date.now() }
    }
  }
}
