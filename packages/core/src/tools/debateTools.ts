/**
 * Debate Tools Configuration
 *
 * Creates a set of tools for use during AI debates.
 */

import type { Tool } from 'ai'
import { createWebSearchTool, type WebSearchConfig } from './webSearch'

export interface DebateToolsConfig {
  webSearch?: WebSearchConfig | boolean
}

/**
 * Create tools for debate phases
 *
 * @example
 * ```typescript
 * const tools = createDebateTools({
 *   webSearch: {
 *     provider: 'tavily',
 *     apiKey: process.env.TAVILY_API_KEY,
 *   },
 * })
 * ```
 */
export function createDebateTools(config: DebateToolsConfig = {}): Record<string, Tool> {
  const tools: Record<string, Tool> = {}

  // Web Search Tool
  if (config.webSearch !== false) {
    const webSearchConfig = typeof config.webSearch === 'object' ? config.webSearch : {}
    tools.webSearch = createWebSearchTool(webSearchConfig)
  }

  return tools
}
