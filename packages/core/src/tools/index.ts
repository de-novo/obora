/**
 * Tools for AI-enhanced debate
 *
 * For basic fact-checking, use Provider's built-in tools:
 * - ClaudeProvider: enabledTools: ['WebSearch']
 * - OpenAIProvider: enableWebSearch: true
 * - GeminiProvider: enabledTools: ['google_web_search']
 *
 * For custom search (Tavily, Serper, Exa), use createWebSearchTool().
 */

export { createDebateTools, type DebateToolsConfig } from './debateTools'
export { createWebSearchTool, webSearch, type WebSearchConfig, type WebSearchResult } from './webSearch'
