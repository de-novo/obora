import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { BaseEvent, SessionIndexEntry, SessionMetadata, SessionUsageSummary } from './types'
import { decodeTime, isValidUlid } from './ulid'

const DEFAULT_SESSIONS_DIR = join(process.env.HOME || '~', '.config', 'obora', 'sessions')

export interface SessionListOptions {
  limit?: number
  offset?: number
  feature?: string
  status?: string
}

export interface SessionDetails extends SessionMetadata {
  events: BaseEvent[]
  artifacts: string[]
}

export class SessionManager {
  private sessionsDir: string

  constructor(sessionsDir?: string) {
    this.sessionsDir = sessionsDir || process.env.OBORA_SESSION_DIR || DEFAULT_SESSIONS_DIR
  }

  async list(options: SessionListOptions = {}): Promise<SessionIndexEntry[]> {
    const { limit = 50, offset = 0, feature, status } = options

    try {
      const entries = await readdir(this.sessionsDir, { withFileTypes: true })
      const sessionDirs = entries
        .filter((e) => e.isDirectory() && e.name.startsWith('session-'))
        .map((e) => e.name)
        .sort()
        .reverse()

      const sessions: SessionIndexEntry[] = []

      for (const dir of sessionDirs) {
        if (sessions.length >= offset + limit) break

        const sessionId = dir.replace('session-', '')
        const metadata = await this.getMetadata(sessionId)

        if (!metadata) continue
        if (feature && !metadata.features.includes(feature as 'debate' | 'query' | 'skill' | 'agent')) continue
        if (status && metadata.status !== status) continue

        if (sessions.length >= offset) {
          sessions.push({
            id: metadata.id,
            createdAt: metadata.createdAt,
            updatedAt: metadata.updatedAt,
            status: metadata.status,
            features: metadata.features,
            totalTokens: metadata.summary.totalTokens,
            costUsd: metadata.summary.costUsd,
            providers: metadata.summary.providers,
          })
        }
      }

      return sessions.slice(offset, offset + limit)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      throw error
    }
  }

  async get(sessionId: string): Promise<SessionDetails | null> {
    const metadata = await this.getMetadata(sessionId)
    if (!metadata) return null

    const events = await this.getEvents(sessionId)
    const artifacts = await this.getArtifacts(sessionId)

    return {
      ...metadata,
      events,
      artifacts,
    }
  }

  async getMetadata(sessionId: string): Promise<SessionMetadata | null> {
    const sessionPath = join(this.sessionsDir, `session-${sessionId}`, 'session.json')

    try {
      const file = Bun.file(sessionPath)
      if (!(await file.exists())) return null
      return (await file.json()) as SessionMetadata
    } catch {
      return null
    }
  }

  async getEvents(sessionId: string): Promise<BaseEvent[]> {
    const eventsPath = join(this.sessionsDir, `session-${sessionId}`, 'events.jsonl')

    try {
      const file = Bun.file(eventsPath)
      if (!(await file.exists())) return []

      const content = await file.text()
      const lines = content.trim().split('\n').filter(Boolean)

      return lines.map((line) => JSON.parse(line) as BaseEvent)
    } catch {
      return []
    }
  }

  async getArtifacts(sessionId: string): Promise<string[]> {
    const artifactsDir = join(this.sessionsDir, `session-${sessionId}`, 'artifacts')

    try {
      const entries = await readdir(artifactsDir)
      return entries
    } catch {
      return []
    }
  }

  async getArtifact(sessionId: string, name: string): Promise<string | null> {
    const artifactPath = join(this.sessionsDir, `session-${sessionId}`, 'artifacts', name)

    try {
      const file = Bun.file(artifactPath)
      if (!(await file.exists())) return null
      return await file.text()
    } catch {
      return null
    }
  }

  async getCostSummary(sessionId: string): Promise<SessionUsageSummary | null> {
    const costPath = join(this.sessionsDir, `session-${sessionId}`, 'artifacts', 'cost.summary.json')

    try {
      const file = Bun.file(costPath)
      if (!(await file.exists())) {
        const metadata = await this.getMetadata(sessionId)
        return metadata?.summary || null
      }

      const data = (await file.json()) as { usage: SessionUsageSummary }
      return data.usage
    } catch {
      return null
    }
  }

  async delete(sessionId: string): Promise<boolean> {
    const sessionDir = join(this.sessionsDir, `session-${sessionId}`)

    try {
      const { rm } = await import('node:fs/promises')
      await rm(sessionDir, { recursive: true, force: true })
      return true
    } catch {
      return false
    }
  }

  async cleanup(retentionDays: number): Promise<number> {
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    let deletedCount = 0

    const sessions = await this.list({ limit: 1000 })

    for (const session of sessions) {
      const sessionId = session.id
      if (!isValidUlid(sessionId)) continue

      const sessionTime = decodeTime(sessionId)
      if (sessionTime < cutoffTime) {
        const deleted = await this.delete(sessionId)
        if (deleted) deletedCount++
      }
    }

    return deletedCount
  }

  async getTotalCost(): Promise<SessionUsageSummary> {
    const sessions = await this.list({ limit: 1000 })
    const summary: SessionUsageSummary = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      providers: [],
      models: [],
    }

    for (const session of sessions) {
      if (session.totalTokens) {
        summary.totalTokens = (summary.totalTokens || 0) + session.totalTokens
      }
      if (session.costUsd) {
        summary.costUsd = (summary.costUsd || 0) + session.costUsd
      }
      if (session.providers) {
        for (const provider of session.providers) {
          if (!summary.providers!.includes(provider)) {
            summary.providers!.push(provider)
          }
        }
      }
    }

    return summary
  }
}

export const sessionManager = new SessionManager()
