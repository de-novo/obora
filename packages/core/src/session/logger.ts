import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { estimateCost } from './pricing'
import type {
  BaseEvent,
  EventType,
  EventUsage,
  FeatureType,
  SessionConfig,
  SessionEvent,
  SessionMetadata,
  SessionStatus,
  SessionUsageSummary,
} from './types'
import { ulid } from './ulid'

const PROVIDER_NAME_MAP: Record<string, string> = {
  claude: 'anthropic',
  openai: 'openai',
  gemini: 'google',
}

const DEFAULT_SESSIONS_DIR = join(process.env.HOME || '~', '.config', 'obora', 'sessions')

export interface SessionLoggerOptions {
  config?: Partial<SessionConfig>
  sessionId?: string
  feature?: FeatureType
}

export class SessionLogger {
  private sessionId: string
  private sessionDir: string
  private eventsFile: ReturnType<Bun.BunFile['writer']> | null = null
  private seq = 0
  private startTime: number
  private metadata: SessionMetadata
  private config: SessionConfig
  private usageSummary: SessionUsageSummary = {}
  private closed = false

  private constructor(sessionId: string, sessionDir: string, config: SessionConfig, feature?: FeatureType) {
    this.sessionId = sessionId
    this.sessionDir = sessionDir
    this.config = config
    this.startTime = Date.now()
    this.metadata = {
      id: sessionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'running',
      features: feature ? [feature] : [],
      summary: {},
      cwd: process.cwd(),
    }
  }

  static async create(options: SessionLoggerOptions = {}): Promise<SessionLogger> {
    const config: SessionConfig = {
      enabled: true,
      logPrompts: options.config?.logPrompts ?? false,
      logResponses: options.config?.logResponses ?? true,
      logToolResults: options.config?.logToolResults ?? true,
      dir: options.config?.dir,
    }

    const sessionsDir = config.dir || process.env.OBORA_SESSION_DIR || DEFAULT_SESSIONS_DIR
    const sessionId = options.sessionId || ulid()
    const sessionDir = join(sessionsDir, `session-${sessionId}`)

    await mkdir(sessionDir, { recursive: true })
    await mkdir(join(sessionDir, 'artifacts'), { recursive: true })

    const logger = new SessionLogger(sessionId, sessionDir, config, options.feature)
    await logger.openEventsFile()
    await logger.writeSessionJson()

    return logger
  }

  private async openEventsFile(): Promise<void> {
    const eventsPath = join(this.sessionDir, 'events.jsonl')
    const file = Bun.file(eventsPath)
    this.eventsFile = file.writer()
  }

  private async writeSessionJson(): Promise<void> {
    const sessionPath = join(this.sessionDir, 'session.json')
    await Bun.write(sessionPath, JSON.stringify(this.metadata, null, 2))
  }

  get id(): string {
    return this.sessionId
  }

  get dir(): string {
    return this.sessionDir
  }

  async log<T extends SessionEvent>(
    type: EventType,
    data?: T['data'],
    options?: {
      feature?: FeatureType
      usage?: EventUsage
      spanId?: string
      parentSpanId?: string
    },
  ): Promise<void> {
    if (this.closed || !this.eventsFile) return

    const event: BaseEvent = {
      v: 1,
      ts: new Date().toISOString(),
      sessionId: this.sessionId,
      type,
      seq: this.seq++,
      ...(options?.spanId && { spanId: options.spanId }),
      ...(options?.parentSpanId && { parentSpanId: options.parentSpanId }),
      ...(options?.feature && { feature: options.feature }),
      ...(options?.usage && { usage: options.usage }),
      ...(data && { data }),
    }

    if (options?.usage) {
      this.aggregateUsage(options.usage)
    }

    if (options?.feature && !this.metadata.features.includes(options.feature)) {
      this.metadata.features.push(options.feature)
    }

    const line = `${JSON.stringify(event)}\n`
    this.eventsFile.write(line)
  }

  private aggregateUsage(usage: EventUsage): void {
    if (usage.inputTokens) {
      this.usageSummary.inputTokens = (this.usageSummary.inputTokens || 0) + usage.inputTokens
    }
    if (usage.outputTokens) {
      this.usageSummary.outputTokens = (this.usageSummary.outputTokens || 0) + usage.outputTokens
    }
    if (usage.totalTokens) {
      this.usageSummary.totalTokens = (this.usageSummary.totalTokens || 0) + usage.totalTokens
    }
    if (usage.costUsd) {
      this.usageSummary.costUsd = (this.usageSummary.costUsd || 0) + usage.costUsd
    } else if (usage.model && usage.provider && usage.inputTokens && usage.outputTokens) {
      const pricingProvider = PROVIDER_NAME_MAP[usage.provider] || usage.provider
      const cost = estimateCost(pricingProvider, usage.model, usage.inputTokens, usage.outputTokens)
      if (cost !== null) {
        this.usageSummary.costUsd = (this.usageSummary.costUsd || 0) + cost
      }
    }
    if (usage.provider) {
      if (!this.usageSummary.providers) {
        this.usageSummary.providers = []
      }
      if (!this.usageSummary.providers.includes(usage.provider)) {
        this.usageSummary.providers.push(usage.provider)
      }
    }
    if (usage.model) {
      if (!this.usageSummary.models) {
        this.usageSummary.models = []
      }
      if (!this.usageSummary.models.includes(usage.model)) {
        this.usageSummary.models.push(usage.model)
      }
    }
  }

  async saveArtifact(name: string, content: string | object): Promise<string> {
    const artifactPath = join(this.sessionDir, 'artifacts', name)
    const data = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
    await Bun.write(artifactPath, data)
    return artifactPath
  }

  async close(status: SessionStatus = 'completed'): Promise<void> {
    if (this.closed) return
    this.closed = true

    const durationMs = Date.now() - this.startTime

    await this.log('session.ended', {
      status,
      durationMs,
      summary: this.usageSummary,
    })

    if (this.eventsFile) {
      await this.eventsFile.flush()
      await this.eventsFile.end()
    }

    this.metadata.status = status
    this.metadata.updatedAt = new Date().toISOString()
    this.metadata.summary = this.usageSummary
    await this.writeSessionJson()

    await this.saveCostSummary()
  }

  private async saveCostSummary(): Promise<void> {
    const summary = {
      sessionId: this.sessionId,
      status: this.metadata.status,
      createdAt: this.metadata.createdAt,
      updatedAt: this.metadata.updatedAt,
      durationMs: Date.now() - this.startTime,
      features: this.metadata.features,
      usage: this.usageSummary,
    }
    await this.saveArtifact('cost.summary.json', summary)
  }
}

export class NoopSessionLogger {
  get id(): string {
    return 'noop'
  }
  get dir(): string {
    return ''
  }
  async log(): Promise<void> {}
  async saveArtifact(_name: string, _content: string | object): Promise<string> {
    return ''
  }
  async close(): Promise<void> {}
}

export type SessionLoggerInstance = SessionLogger | NoopSessionLogger

export function createNoopLogger(): NoopSessionLogger {
  return new NoopSessionLogger()
}
