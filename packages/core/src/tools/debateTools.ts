import type { Tool } from 'ai'

export interface DebateToolsConfig {
  customTools?: Record<string, Tool>
}

export function createDebateTools(config: DebateToolsConfig = {}): Record<string, Tool> {
  return config.customTools || {}
}
