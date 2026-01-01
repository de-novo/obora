/**
 * Tools for AI-enhanced debate
 *
 * Tools allow AIs to verify facts during debate phases.
 */

export { createDebateTools, type DebateToolsConfig } from './debateTools'
export {
  createWebSearchTool,
  getWebSearchProviderInfo,
  webSearch,
  type WebSearchConfig,
  type WebSearchResult,
  webSearchTool,
} from './webSearch'
