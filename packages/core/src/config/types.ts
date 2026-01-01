/**
 * Configuration Types
 */

export type AIName = 'claude' | 'gemini' | 'openai' | 'codex' | string

export interface OboraConfig {
  orchestrator: {
    ai: AIName
  }
  participants: AIName[]
  settings: {
    maxRounds: number
    timeout: number
  }
  providers?: Record<AIName, ProviderSettings>
}

export interface ProviderSettings {
  apiKey?: string
  model?: string
  baseUrl?: string
  forceCLI?: boolean
}

export interface ConfigLoaderOptions {
  path?: string
  env?: Record<string, string>
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: OboraConfig = {
  orchestrator: {
    ai: 'claude',
  },
  participants: ['claude', 'gemini', 'openai'],
  settings: {
    maxRounds: 10,
    timeout: 300,
  },
}
