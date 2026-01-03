import type { ChatMessage, ChatModel, ChatResponse } from '../llm/types'
import type { RunContext, TraceContext } from '../runtime/types'
import { SkillLoader } from '../skills/loader'
import type { Skill } from '../skills/types'
import type { Pattern, PatternConfig, PatternEvent, PatternRunHandle } from './types'
import { withTrace } from './types'

function createNoopTrace(): TraceContext {
  const noopTrace: TraceContext = {
    traceId: '',
    spanId: '',
    path: [],
    createChild: (name: string) => ({ ...noopTrace, path: [...noopTrace.path, name] }),
    createSibling: () => noopTrace,
  }
  return noopTrace
}

export type DebatePhase = 'initial' | 'rebuttal' | 'revised' | 'consensus'
export type DebateMode = 'strong' | 'weak'

export interface DebateRound {
  phase: DebatePhase
  speaker: string
  content: string
  timestamp: number
  toolCalls?: Array<{ toolName: string; args: Record<string, unknown>; result: unknown }>
}

export interface PositionChange {
  participant: string
  from: string
  to: string
  reason: string
  phase: DebatePhase
}

export interface SkillsConfig {
  global?: string[]
  participants?: Record<string, string[]>
}

export interface DebateResult {
  topic: string
  mode: DebateMode
  rounds: DebateRound[]
  consensus: string
  positionChanges: PositionChange[]
  unresolvedDisagreements: string[]
  metadata: {
    startTime: number
    endTime: number
    totalDurationMs: number
    participantCount: number
  }
}

export type DebateEvent =
  | PatternEvent
  | { type: 'debate_phase_start'; phase: DebatePhase; timestamp: number }
  | { type: 'debate_phase_end'; phase: DebatePhase; timestamp: number }
  | { type: 'debate_round_start'; phase: DebatePhase; participant: string; timestamp: number }
  | { type: 'debate_round_end'; phase: DebatePhase; participant: string; content: string; timestamp: number }
  | { type: 'position_change'; change: PositionChange }

export interface DebateAgentConfig {
  id: string
  name: string
  model: ChatModel
  systemPrompt?: string
  skills?: string[]
}

export interface DebateConfig extends PatternConfig {
  participants: DebateAgentConfig[]
  orchestrator?: DebateAgentConfig
  mode?: DebateMode
  maxRounds?: number
  timeout?: number
  skills?: SkillsConfig
  skillsPath?: string
  toolPhases?: DebatePhase[]
  useNativeWebSearch?: boolean
}

export interface DebateInput {
  topic: string
  context?: string
}

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

async function runAgent(
  agent: DebateAgentConfig,
  prompt: string,
  ctx: RunContext,
  traceCtx: TraceContext,
  onEvent: (event: DebateEvent) => void,
): Promise<{ response: ChatResponse; durationMs: number }> {
  const startTime = Date.now()
  const agentTrace = traceCtx.createChild(agent.id)

  onEvent(withTrace({ type: 'agent_start', agentId: agent.id, agentName: agent.name }, agentTrace) as DebateEvent)

  const messages: ChatMessage[] = []
  if (agent.systemPrompt) {
    messages.push({ role: 'system', content: agent.systemPrompt })
  }
  messages.push({ role: 'user', content: prompt })

  const handle = agent.model.run({ messages }, ctx.abort)

  for await (const event of handle.events()) {
    onEvent(withTrace({ ...event, agentId: agent.id }, agentTrace) as DebateEvent)
  }

  const response = await handle.result()
  const durationMs = Date.now() - startTime

  onEvent(withTrace({ type: 'agent_end', agentId: agent.id, durationMs }, agentTrace) as DebateEvent)

  return { response, durationMs }
}

function extractPositions(rounds: DebateRound[], phase: DebatePhase): Map<string, string> {
  const positions = new Map<string, string>()
  for (const round of rounds) {
    if (round.phase === phase) {
      positions.set(round.speaker, round.content)
    }
  }
  return positions
}

function hasPositionChanged(_initial: string, revised: string): boolean {
  const normalizedRevised = revised.toLowerCase().trim()

  const changeIndicators = [
    'i have revised',
    'i now agree',
    'i changed my position',
    'reconsidering',
    'after reviewing',
    'i must acknowledge',
    'my position has evolved',
    'i revise my position',
  ]

  return changeIndicators.some((indicator) => normalizedRevised.includes(indicator))
}

function extractDisagreements(consensus: string): string[] {
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

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildSkillPrompt(skills: Skill[], phase: DebatePhase): string {
  if (skills.length === 0) return ''

  const phaseContext: Record<DebatePhase, string> = {
    initial: 'presenting your initial position',
    rebuttal: 'critiquing other positions',
    revised: 'revising your position',
    consensus: 'summarizing the debate',
  }

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

export class DebatePattern implements Pattern<DebateInput, DebateResult> {
  readonly name: string
  private readonly config: DebateConfig
  private readonly skillLoader: SkillLoader
  private readonly skillCache: Map<string, Skill> = new Map()

  constructor(config: DebateConfig) {
    this.name = config.name || 'debate'
    this.config = {
      mode: 'strong',
      maxRounds: 10,
      timeout: 300000,
      ...config,
    }
    this.skillLoader = new SkillLoader({
      customSkillsPath: config.skillsPath,
    })
  }

  run(ctx: RunContext, input: DebateInput): PatternRunHandle<DebateResult> {
    const eventQueue: DebateEvent[] = []
    let resolveEvents: (() => void) | null = null
    let done = false

    const pushEvent = (event: DebateEvent) => {
      eventQueue.push(event)
      resolveEvents?.()
    }

    const events = async function* (): AsyncIterable<DebateEvent> {
      while (!done || eventQueue.length > 0) {
        if (eventQueue.length > 0) {
          yield eventQueue.shift()!
        } else {
          await new Promise<void>((resolve) => {
            resolveEvents = resolve
          })
        }
      }
    }

    const resultPromise = this.execute(ctx, input, pushEvent).finally(() => {
      done = true
      resolveEvents?.()
    })

    return {
      events: events as () => AsyncIterable<PatternEvent>,
      result: () => resultPromise,
      cancel: () => ctx.abort,
    }
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

  private async execute(
    ctx: RunContext,
    input: DebateInput,
    onEvent: (event: DebateEvent) => void,
  ): Promise<DebateResult> {
    const { topic } = input
    const config = this.config
    const startTime = Date.now()
    const rounds: DebateRound[] = []
    const history: { role: string; content: string }[] = [{ role: 'user', content: topic }]
    const positionChanges: PositionChange[] = []

    const rootTrace: TraceContext = ctx.traceContext ?? createNoopTrace()

    if (config.mode === 'strong') {
      await this.runPhase('initial', topic, rounds, history, ctx, rootTrace.createChild('initial'), onEvent)
      await this.runRebuttalPhase(topic, rounds, history, ctx, rootTrace.createChild('rebuttal'), onEvent)

      const initialPositions = extractPositions(rounds, 'initial')
      await this.runRevisedPhase(topic, rounds, history, ctx, rootTrace.createChild('revised'), onEvent)
      const revisedPositions = extractPositions(rounds, 'revised')

      for (const participant of config.participants) {
        const initial = initialPositions.get(participant.name)
        const revised = revisedPositions.get(participant.name)
        if (initial && revised && hasPositionChanged(initial, revised)) {
          const change: PositionChange = {
            participant: participant.name,
            from: initial,
            to: revised,
            reason: 'Revised after rebuttal phase',
            phase: 'revised',
          }
          positionChanges.push(change)
          onEvent(withTrace({ type: 'position_change', change }, rootTrace) as DebateEvent)
        }
      }
    } else {
      await this.runPhase('initial', topic, rounds, history, ctx, rootTrace.createChild('initial'), onEvent)
    }

    let consensus = ''
    if (config.orchestrator) {
      const consensusTrace = rootTrace.createChild('consensus')
      onEvent(
        withTrace(
          { type: 'debate_phase_start', phase: 'consensus', timestamp: Date.now() },
          consensusTrace,
        ) as DebateEvent,
      )
      onEvent(withTrace({ type: 'phase_start', phase: 'consensus' }, consensusTrace) as DebateEvent)

      const historyStr = history.map((m) => `[${m.role}] ${m.content}`).join('\n\n---\n\n')
      const prompt = PROMPTS.consensus(historyStr)

      const { response } = await runAgent(config.orchestrator, prompt, ctx, consensusTrace, onEvent)
      consensus = response.message.content

      rounds.push({
        phase: 'consensus',
        speaker: config.orchestrator.name,
        content: consensus,
        timestamp: Date.now(),
      })

      const phaseDurationMs = Date.now() - startTime
      onEvent(
        withTrace(
          { type: 'phase_end', phase: 'consensus', durationMs: phaseDurationMs },
          consensusTrace,
        ) as DebateEvent,
      )
      onEvent(
        withTrace(
          { type: 'debate_phase_end', phase: 'consensus', timestamp: Date.now() },
          consensusTrace,
        ) as DebateEvent,
      )
    }

    const endTime = Date.now()
    onEvent(withTrace({ type: 'done' }, rootTrace) as DebateEvent)

    return {
      topic,
      mode: config.mode!,
      rounds,
      consensus,
      positionChanges,
      unresolvedDisagreements: extractDisagreements(consensus),
      metadata: {
        startTime,
        endTime,
        totalDurationMs: endTime - startTime,
        participantCount: config.participants.length,
      },
    }
  }

  private async runPhase(
    phase: DebatePhase,
    topic: string,
    rounds: DebateRound[],
    history: { role: string; content: string }[],
    ctx: RunContext,
    traceCtx: TraceContext,
    onEvent: (event: DebateEvent) => void,
  ): Promise<void> {
    const phaseStartTime = Date.now()
    onEvent(withTrace({ type: 'debate_phase_start', phase, timestamp: phaseStartTime }, traceCtx) as DebateEvent)
    onEvent(withTrace({ type: 'phase_start', phase }, traceCtx) as DebateEvent)

    for (const participant of this.config.participants) {
      const participantTrace = traceCtx.createChild(participant.id)
      onEvent(
        withTrace(
          { type: 'debate_round_start', phase, participant: participant.name, timestamp: Date.now() },
          participantTrace,
        ) as DebateEvent,
      )

      const skills = await this.loadSkillsForParticipant(participant.name, participant.skills)
      const skillInstructions = buildSkillPrompt(skills, phase) || undefined
      const prompt = PROMPTS.initial(topic, skillInstructions)
      const { response } = await runAgent(participant, prompt, ctx, participantTrace, onEvent)
      const content = response.message.content

      rounds.push({
        phase,
        speaker: participant.name,
        content,
        timestamp: Date.now(),
      })
      history.push({ role: participant.name, content })

      onEvent(
        withTrace(
          { type: 'debate_round_end', phase, participant: participant.name, content, timestamp: Date.now() },
          participantTrace,
        ) as DebateEvent,
      )
    }

    const phaseDurationMs = Date.now() - phaseStartTime
    onEvent(withTrace({ type: 'phase_end', phase, durationMs: phaseDurationMs }, traceCtx) as DebateEvent)
    onEvent(withTrace({ type: 'debate_phase_end', phase, timestamp: Date.now() }, traceCtx) as DebateEvent)
  }

  private async runRebuttalPhase(
    topic: string,
    rounds: DebateRound[],
    history: { role: string; content: string }[],
    ctx: RunContext,
    traceCtx: TraceContext,
    onEvent: (event: DebateEvent) => void,
  ): Promise<void> {
    const phase: DebatePhase = 'rebuttal'
    const phaseStartTime = Date.now()
    onEvent(withTrace({ type: 'debate_phase_start', phase, timestamp: phaseStartTime }, traceCtx) as DebateEvent)
    onEvent(withTrace({ type: 'phase_start', phase }, traceCtx) as DebateEvent)

    const hasWebSearch = this.config.toolPhases?.includes('rebuttal') && this.config.useNativeWebSearch

    for (const participant of this.config.participants) {
      const participantTrace = traceCtx.createChild(participant.id)
      onEvent(
        withTrace(
          { type: 'debate_round_start', phase, participant: participant.name, timestamp: Date.now() },
          participantTrace,
        ) as DebateEvent,
      )

      const othersOpinions = history
        .filter((h) => h.role !== 'user' && h.role !== participant.name)
        .map((h) => `[${h.role}] ${h.content}`)
        .join('\n\n---\n\n')

      const skills = await this.loadSkillsForParticipant(participant.name, participant.skills)
      const skillInstructions = buildSkillPrompt(skills, phase) || undefined
      const prompt = PROMPTS.rebuttal(topic, othersOpinions, !!hasWebSearch, skillInstructions)
      const { response } = await runAgent(participant, prompt, ctx, participantTrace, onEvent)
      const content = response.message.content

      rounds.push({
        phase,
        speaker: participant.name,
        content,
        timestamp: Date.now(),
      })
      history.push({
        role: `${participant.name}(rebuttal)`,
        content,
      })

      onEvent(
        withTrace(
          { type: 'debate_round_end', phase, participant: participant.name, content, timestamp: Date.now() },
          participantTrace,
        ) as DebateEvent,
      )
    }

    const phaseDurationMs = Date.now() - phaseStartTime
    onEvent(withTrace({ type: 'phase_end', phase, durationMs: phaseDurationMs }, traceCtx) as DebateEvent)
    onEvent(withTrace({ type: 'debate_phase_end', phase, timestamp: Date.now() }, traceCtx) as DebateEvent)
  }

  private async runRevisedPhase(
    topic: string,
    rounds: DebateRound[],
    history: { role: string; content: string }[],
    ctx: RunContext,
    traceCtx: TraceContext,
    onEvent: (event: DebateEvent) => void,
  ): Promise<void> {
    const phase: DebatePhase = 'revised'
    const phaseStartTime = Date.now()
    onEvent(withTrace({ type: 'debate_phase_start', phase, timestamp: phaseStartTime }, traceCtx) as DebateEvent)
    onEvent(withTrace({ type: 'phase_start', phase }, traceCtx) as DebateEvent)

    for (const participant of this.config.participants) {
      const participantTrace = traceCtx.createChild(participant.id)
      onEvent(
        withTrace(
          { type: 'debate_round_start', phase, participant: participant.name, timestamp: Date.now() },
          participantTrace,
        ) as DebateEvent,
      )

      const allHistory = history
        .filter((h) => h.role !== 'user')
        .map((h) => `[${h.role}] ${h.content}`)
        .join('\n\n---\n\n')

      const skills = await this.loadSkillsForParticipant(participant.name, participant.skills)
      const skillInstructions = buildSkillPrompt(skills, phase) || undefined
      const prompt = PROMPTS.revised(topic, allHistory, skillInstructions)
      const { response } = await runAgent(participant, prompt, ctx, participantTrace, onEvent)
      const content = response.message.content

      rounds.push({
        phase,
        speaker: participant.name,
        content,
        timestamp: Date.now(),
      })
      history.push({
        role: `${participant.name}(final)`,
        content,
      })

      onEvent(
        withTrace(
          { type: 'debate_round_end', phase, participant: participant.name, content, timestamp: Date.now() },
          participantTrace,
        ) as DebateEvent,
      )
    }

    const phaseDurationMs = Date.now() - phaseStartTime
    onEvent(withTrace({ type: 'phase_end', phase, durationMs: phaseDurationMs }, traceCtx) as DebateEvent)
    onEvent(withTrace({ type: 'debate_phase_end', phase, timestamp: Date.now() }, traceCtx) as DebateEvent)
  }
}

export function createDebatePattern(config: DebateConfig): DebatePattern {
  return new DebatePattern(config)
}
