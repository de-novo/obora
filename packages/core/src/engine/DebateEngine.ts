/**
 * Debate Engine
 *
 * Orchestrates multi-AI debates with structured phases.
 * Supports both 'strong' (with rebuttals) and 'weak' (simple rounds) modes.
 *
 * @packageDocumentation
 * @module engine/DebateEngine
 */

import type { Tool } from 'ai'
import type { Provider, StreamableProvider, ToolEnabledProvider } from '../providers/types'
import { SkillLoader } from '../skills/loader'
import type { Skill } from '../skills/types'
import type { DebateEngineConfig, DebatePhase, DebateResult, DebateRound, PositionChange, ToolCall } from './types'

function isToolEnabledProvider(provider: Provider): provider is ToolEnabledProvider {
  return 'runWithTools' in provider && typeof (provider as ToolEnabledProvider).runWithTools === 'function'
}

/**
 * A participant in the debate with their AI provider.
 *
 * @example
 * ```typescript
 * const participant: DebateParticipant = {
 *   name: 'claude',
 *   provider: new ClaudeProvider()
 * }
 * ```
 */
export interface DebateParticipant {
  /** Display name for this participant */
  name: string
  /** AI provider that will generate responses */
  provider: Provider
  /** Skills assigned to this participant (overrides global skills) */
  skills?: string[]
}

/**
 * Participant with streaming capability for real-time output.
 *
 * @example
 * ```typescript
 * const participant: StreamingParticipant = {
 *   name: 'openai',
 *   provider: new OpenAIProvider() // Must implement stream()
 * }
 * ```
 */
export interface StreamingParticipant extends DebateParticipant {
  /** Provider must support streaming */
  provider: StreamableProvider
}

/**
 * Events emitted during streaming debate.
 *
 * Event flow:
 * 1. `phase_start` - New phase begins
 * 2. `round_start` - AI begins speaking
 * 3. `chunk` - Partial response text (many events)
 * 4. `round_end` - AI finishes, includes full content
 * 5. `phase_end` - Phase completes
 *
 * @example
 * ```typescript
 * for await (const event of engine.runStreaming(options)) {
 *   switch (event.type) {
 *     case 'phase_start':
 *       console.log(`\n=== ${event.phase} ===`)
 *       break
 *     case 'chunk':
 *       process.stdout.write(event.chunk)
 *       break
 *   }
 * }
 * ```
 */
export interface DebateStreamEvent {
  type: 'chunk' | 'round_start' | 'round_end' | 'phase_start' | 'phase_end'
  phase?: DebatePhase
  participant?: string
  chunk?: string
  content?: string
  timestamp: number
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    model?: string
  }
}

/**
 * Options for running a debate.
 *
 * @example
 * ```typescript
 * const options: DebateOptions = {
 *   topic: 'Should we use microservices?',
 *   participants: [
 *     { name: 'claude', provider: new ClaudeProvider() },
 *     { name: 'openai', provider: new OpenAIProvider() }
 *   ],
 *   orchestrator: new ClaudeProvider()
 * }
 * ```
 */
export interface DebateOptions {
  /** The topic or question to debate */
  topic: string
  /** AI participants (minimum 2 required) */
  participants: DebateParticipant[]
  /** Optional orchestrator for generating consensus */
  orchestrator?: Provider
  /** Override engine configuration for this debate */
  config?: Partial<DebateEngineConfig>
}

/**
 * Options for streaming debate with real-time output.
 */
export interface StreamingDebateOptions extends DebateOptions {
  /** Participants must support streaming */
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
  initial: (topic: string, skillInstructions?: string) => {
    const skillSection = skillInstructions ? `\n\n${skillInstructions}` : ''
    return `Topic: ${topic}

You must present a clear position as an expert on this topic.
- Provide a specific recommendation
- Clearly explain the reasoning behind your choice
- Also mention potential risks${skillSection}`
  },

  rebuttal: (topic: string, othersOpinions: string, hasTools: boolean, skillInstructions?: string) => {
    const toolSection = hasTools
      ? `

IMPORTANT: Before making factual claims, use the webSearch tool to verify:
- Service certifications (SOC2, HIPAA, etc.)
- Current pricing or feature availability
- Recent announcements or changes
- Technical specifications

Example: If you claim "Service X lacks SOC2", search to confirm this is current.`
      : ''
    const skillSection = skillInstructions ? `\n\n${skillInstructions}` : ''

    return `Topic: ${topic}

Other experts' opinions:
${othersOpinions}

Your role: Critical Reviewer
Point out problems, gaps, and underestimated risks in the above opinions.
- Find weaknesses even if you agree
- Avoid phrases like "Good point, but..."
- Provide specific counterexamples or failure scenarios
- Specify conditions under which the approach could fail${toolSection}${skillSection}`
  },

  revised: (topic: string, allHistory: string, skillInstructions?: string) => {
    const skillSection = skillInstructions ? `\n\n${skillInstructions}` : ''
    return `Topic: ${topic}

Discussion so far:
${allHistory}

Considering other experts' rebuttals:
1. Revise your initial position if needed
2. Defend with stronger evidence if you maintain your position
3. Present your final recommendation${skillSection}`
  },

  consensus: (historyStr: string) => `You are the debate moderator. An intense debate has concluded.

Full debate transcript:
${historyStr}

Please summarize:
1. Points of agreement (what all experts agreed on)
2. Unresolved disagreements (where opinions still differ and each position)
3. Final recommendation (practical approach considering disagreements)
4. Cautions (risks raised in rebuttals that must be considered)`,
}

/**
 * Multi-AI Debate Engine
 *
 * Orchestrates structured debates between multiple AI models.
 * Supports two modes:
 *
 * - **Strong Mode**: Full 4-phase debate with rebuttals and position revision
 *   - Initial: Each AI presents their position
 *   - Rebuttal: AIs critique each other's positions
 *   - Revised: AIs update positions based on critiques
 *   - Consensus: Orchestrator summarizes agreements/disagreements
 *
 * - **Weak Mode**: Simple 2-phase debate
 *   - Initial: Each AI presents their position
 *   - Consensus: Orchestrator summarizes
 *
 * @example Basic usage
 * ```typescript
 * import { DebateEngine, ClaudeProvider, OpenAIProvider } from '@obora/core'
 *
 * const engine = new DebateEngine({ mode: 'strong' })
 *
 * const result = await engine.run({
 *   topic: 'Should we migrate to microservices?',
 *   participants: [
 *     { name: 'claude', provider: new ClaudeProvider() },
 *     { name: 'openai', provider: new OpenAIProvider() }
 *   ],
 *   orchestrator: new ClaudeProvider()
 * })
 *
 * console.log(result.consensus)
 * ```
 *
 * @example Streaming output
 * ```typescript
 * for await (const event of engine.runStreaming(options)) {
 *   if (event.type === 'chunk') {
 *     process.stdout.write(event.chunk)
 *   }
 * }
 * ```
 */
export class DebateEngine {
  private config: DebateEngineConfig
  private skillLoader: SkillLoader
  private skillCache: Map<string, Skill> = new Map()

  /**
   * Create a new DebateEngine instance.
   *
   * @param config - Configuration options (mode, timeout, tools, etc.)
   *
   * @example
   * ```typescript
   * // Strong mode (default)
   * const engine = new DebateEngine({ mode: 'strong' })
   *
   * // Weak mode for quick discussions
   * const weakEngine = new DebateEngine({ mode: 'weak' })
   *
   * // With custom timeout
   * const customEngine = new DebateEngine({
   *   mode: 'strong',
   *   timeout: 600000 // 10 minutes
   * })
   * ```
   */
  constructor(config: Partial<DebateEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.skillLoader = new SkillLoader({
      customSkillsPath: config.skillsPath,
    })
  }

  /**
   * Run a complete debate session.
   *
   * Executes all phases of the debate and returns comprehensive results
   * including the consensus, position changes, and full transcript.
   *
   * @param options - Debate options including topic, participants, and orchestrator
   * @returns Complete debate result with consensus and analysis
   *
   * @example
   * ```typescript
   * const result = await engine.run({
   *   topic: 'AWS vs managed platforms for a startup?',
   *   participants: [
   *     { name: 'claude', provider: new ClaudeProvider() },
   *     { name: 'openai', provider: new OpenAIProvider() }
   *   ],
   *   orchestrator: new ClaudeProvider()
   * })
   *
   * console.log('Consensus:', result.consensus)
   * console.log('Position changes:', result.positionChanges.length)
   * console.log('Duration:', result.metadata.totalDurationMs, 'ms')
   * ```
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
      const useNativeWebSearch = config.toolPhases?.includes('rebuttal') && config.useNativeWebSearch
      await this.runRebuttalPhase(topic, participants, rounds, history, rebuttalTools, useNativeWebSearch)

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
      const skills = await this.loadSkillsForParticipant(participant.name, participant.skills)
      const skillInstructions = this.buildSkillPrompt(skills, phase)
      const prompt = PROMPTS.initial(topic, skillInstructions || undefined)
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
    useNativeWebSearch?: boolean,
  ): Promise<void> {
    const hasCustomTools = tools && Object.keys(tools).length > 0
    const hasWebSearch = hasCustomTools || useNativeWebSearch

    for (const participant of participants) {
      const othersOpinions = history
        .filter((h) => h.role !== 'user' && h.role !== participant.name)
        .map((h) => `[${h.role}] ${h.content}`)
        .join('\n\n---\n\n')

      const skills = await this.loadSkillsForParticipant(participant.name, participant.skills)
      const skillInstructions = this.buildSkillPrompt(skills, 'rebuttal')
      const prompt = PROMPTS.rebuttal(topic, othersOpinions, !!hasWebSearch, skillInstructions || undefined)

      let content: string
      let toolCalls: ToolCall[] | undefined

      if (useNativeWebSearch) {
        const response = await participant.provider.run(prompt)
        content = response.content
      } else if (hasCustomTools && isToolEnabledProvider(participant.provider)) {
        const response = await participant.provider.runWithTools(prompt, tools)
        content = response.content
        toolCalls = response.toolCalls
      } else {
        const response = await participant.provider.run(prompt)
        content = response.content
      }

      rounds.push({
        phase: 'rebuttal',
        speaker: participant.name,
        content,
        timestamp: Date.now(),
        toolCalls,
      })
      history.push({
        role: `${participant.name}(rebuttal)`,
        content,
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

      const skills = await this.loadSkillsForParticipant(participant.name, participant.skills)
      const skillInstructions = this.buildSkillPrompt(skills, 'revised')
      const prompt = PROMPTS.revised(topic, allHistory, skillInstructions || undefined)
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

  private getSkillsForParticipant(participantName: string, participantSkills?: string[]): string[] {
    if (participantSkills && participantSkills.length > 0) {
      return participantSkills
    }
    const perParticipant = this.config.skills?.participants?.[participantName]
    if (perParticipant && perParticipant.length > 0) {
      return perParticipant
    }
    return this.config.skills?.global ?? []
  }

  private async loadSkillsForParticipant(participantName: string, participantSkills?: string[]): Promise<Skill[]> {
    const skillNames = this.getSkillsForParticipant(participantName, participantSkills)
    if (skillNames.length === 0) return []

    const skills: Skill[] = []
    for (const name of skillNames) {
      if (this.skillCache.has(name)) {
        skills.push(this.skillCache.get(name)!)
      } else {
        try {
          const skill = await this.skillLoader.load(name)
          this.skillCache.set(name, skill)
          skills.push(skill)
        } catch {}
      }
    }
    return skills
  }

  private buildSkillPrompt(skills: Skill[], phase: DebatePhase): string {
    if (skills.length === 0) return ''

    const phaseContext = {
      initial: 'presenting your initial position',
      rebuttal: 'critiquing other positions',
      revised: 'revising your position',
      consensus: 'summarizing the debate',
    }

    const escapeXml = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const discoveryBlocks = skills
      .map(
        (skill) => `<skill>
<name>
${escapeXml(skill.name)}
</name>
<description>
${escapeXml(skill.description)}
</description>
<location>
${skill.location}
</location>
</skill>`,
      )
      .join('\n')

    const activatedContents = skills
      .map((skill) => {
        const frontmatterLines = [
          '---',
          `name: ${skill.frontmatter.name}`,
          `description: ${skill.frontmatter.description}`,
        ]
        if (skill.frontmatter.license) {
          frontmatterLines.push(`license: ${skill.frontmatter.license}`)
        }
        if (skill.frontmatter.compatibility) {
          frontmatterLines.push(`compatibility: ${skill.frontmatter.compatibility}`)
        }
        if (skill.frontmatter['allowed-tools']) {
          frontmatterLines.push(`allowed-tools: ${skill.frontmatter['allowed-tools']}`)
        }
        frontmatterLines.push('---')

        return `[${skill.name}]
${frontmatterLines.join('\n')}

${skill.instructions}`
      })
      .join('\n\n---\n\n')

    return `<skills_context>
<activation-phase>${phase}</activation-phase>
<purpose>Apply these skills while ${phaseContext[phase]}</purpose>
</skills_context>

<available_skills>
${discoveryBlocks}
</available_skills>

<activated_skill_contents>
${activatedContents}
</activated_skill_contents>`
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

      const skills = await this.loadSkillsForParticipant(participant.name, participant.skills)
      const skillInstructions = this.buildSkillPrompt(skills, 'initial')
      const prompt = PROMPTS.initial(topic, skillInstructions || undefined)
      let content = ''
      let roundUsage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined

      for await (const { chunk, done, usage } of participant.provider.stream(prompt)) {
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
        if (done && usage) {
          roundUsage = usage
        }
      }

      history.push({ role: participant.name, content })

      yield {
        type: 'round_end',
        phase: 'initial',
        participant: participant.name,
        content,
        timestamp: Date.now(),
        usage: roundUsage,
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

        const useNativeWebSearch = config.toolPhases?.includes('rebuttal') && config.useNativeWebSearch
        const skills = await this.loadSkillsForParticipant(participant.name, participant.skills)
        const skillInstructions = this.buildSkillPrompt(skills, 'rebuttal')
        const prompt = PROMPTS.rebuttal(topic, othersOpinions, !!useNativeWebSearch, skillInstructions || undefined)
        let content = ''
        let roundUsage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined

        for await (const { chunk, done, usage } of participant.provider.stream(prompt)) {
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
          if (done && usage) {
            roundUsage = usage
          }
        }

        history.push({ role: `${participant.name}(rebuttal)`, content })

        yield {
          type: 'round_end',
          phase: 'rebuttal',
          participant: participant.name,
          content,
          timestamp: Date.now(),
          usage: roundUsage,
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

        const skills = await this.loadSkillsForParticipant(participant.name, participant.skills)
        const skillInstructions = this.buildSkillPrompt(skills, 'revised')
        const prompt = PROMPTS.revised(topic, allHistory, skillInstructions || undefined)
        let content = ''
        let roundUsage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined

        for await (const { chunk, done, usage } of participant.provider.stream(prompt)) {
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
          if (done && usage) {
            roundUsage = usage
          }
        }

        history.push({ role: `${participant.name}(final)`, content })

        yield {
          type: 'round_end',
          phase: 'revised',
          participant: participant.name,
          content,
          timestamp: Date.now(),
          usage: roundUsage,
        }
      }

      yield { type: 'phase_end', phase: 'revised', timestamp: Date.now() }
    }

    // Phase 4: Consensus (non-streaming for orchestrator)
    if (orchestrator) {
      yield { type: 'phase_start', phase: 'consensus', timestamp: Date.now() }

      const historyStr = history.map((m) => `[${m.role}] ${m.content}`).join('\n\n---\n\n')

      const response = await orchestrator.run(PROMPTS.consensus(historyStr))

      const orchestratorParticipant = participants.find((p) => p.provider === orchestrator)
      const orchestratorName = orchestratorParticipant?.name || 'orchestrator'

      const consensusUsage = response.metadata
        ? {
            inputTokens: response.metadata.inputTokens,
            outputTokens: response.metadata.outputTokens,
            totalTokens: response.metadata.tokensUsed,
            model: response.metadata.model,
          }
        : undefined

      yield {
        type: 'round_end',
        phase: 'consensus',
        participant: orchestratorName,
        content: response.content,
        timestamp: Date.now(),
        usage: consensusUsage,
      }

      yield { type: 'phase_end', phase: 'consensus', timestamp: Date.now() }
    }
  }
}
