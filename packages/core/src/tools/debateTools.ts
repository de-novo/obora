/**
 * Debate Tools Configuration
 *
 * Creates custom tools for use during AI debates.
 *
 * NOTE: For basic fact-checking, prefer using Provider's built-in tools:
 * - ClaudeProvider: enabledTools: ['WebSearch']
 * - OpenAIProvider: enableWebSearch: true
 * - GeminiProvider: enabledTools: ['google_web_search']
 */

import type { Tool } from 'ai'
import { createWebSearchTool, type WebSearchConfig } from './webSearch'

export interface DebateToolsConfig {
  /** Custom web search configuration (requires API key) */
  webSearch?: WebSearchConfig
}

/**
 * Create custom tools for debate phases
 *
 * @example
 * ```typescript
 * // Using custom Tavily search
 * const tools = createDebateTools({
 *   webSearch: {
 *     provider: 'tavily',
 *     apiKey: process.env.TAVILY_API_KEY!,
 *   },
 * })
 *
 * // For basic fact-checking, use provider built-in tools instead:
 * const claude = new ClaudeProvider({ enabledTools: ['WebSearch'] })
 * ```
 */
export function createDebateTools(config: DebateToolsConfig = {}): Record<string, Tool> {
  const tools: Record<string, Tool> = {}

  // Web Search Tool (only if configured with provider and apiKey)
  if (config.webSearch) {
    tools.webSearch = createWebSearchTool(config.webSearch)
  }

  return tools
}
