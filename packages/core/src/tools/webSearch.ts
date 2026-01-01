/**
 * Custom Web Search Tool
 *
 * For custom search providers (Tavily, Serper, Exa).
 * Use this when you need more control over search or want to use a specific provider.
 *
 * NOTE: For basic fact-checking, prefer using Provider's built-in tools:
 * - ClaudeProvider: enabledTools: ['WebSearch']
 * - OpenAIProvider: enableWebSearch: true
 * - GeminiProvider: enabledTools: ['google_web_search']
 *
 * Custom providers require API keys:
 * - Tavily: TAVILY_API_KEY (recommended for AI)
 * - Serper: SERPER_API_KEY (Google search)
 * - Exa: EXA_API_KEY (semantic search)
 */

import { tool } from 'ai'
import { z } from 'zod'

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

export interface WebSearchConfig {
  provider: 'tavily' | 'exa' | 'serper'
  apiKey: string
  maxResults?: number
}

/**
 * Search the web using configured provider
 */
async function searchWeb(query: string, config: WebSearchConfig): Promise<WebSearchResult[]> {
  const { provider, apiKey, maxResults = 5 } = config

  switch (provider) {
    case 'tavily': {
      if (!apiKey) throw new Error('Tavily API key required. Set TAVILY_API_KEY environment variable.')
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: maxResults,
        }),
      })
      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.status} ${response.statusText}`)
      }
      const data = (await response.json()) as { results: Array<{ title: string; url: string; content: string }> }
      return data.results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
      }))
    }

    case 'serper': {
      if (!apiKey) throw new Error('Serper API key required. Set SERPER_API_KEY environment variable.')
      const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query, num: maxResults }),
      })
      if (!response.ok) {
        throw new Error(`Serper API error: ${response.status} ${response.statusText}`)
      }
      const data = (await response.json()) as { organic: Array<{ title: string; link: string; snippet: string }> }
      return data.organic.map((r) => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet,
      }))
    }

    case 'exa': {
      if (!apiKey) throw new Error('Exa API key required. Set EXA_API_KEY environment variable.')
      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          numResults: maxResults,
          contents: { text: { maxCharacters: 500 } },
        }),
      })
      if (!response.ok) {
        throw new Error(`Exa API error: ${response.status} ${response.statusText}`)
      }
      const data = (await response.json()) as { results: Array<{ title: string; url: string; text: string }> }
      return data.results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.text,
      }))
    }

    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

const webSearchInputSchema = z.object({
  query: z.string().describe('Search query to verify a factual claim'),
  reason: z.string().describe('Why this search is needed for the debate'),
})

/**
 * Create a custom web search tool
 *
 * @example
 * ```typescript
 * const tavilySearch = createWebSearchTool({
 *   provider: 'tavily',
 *   apiKey: process.env.TAVILY_API_KEY!,
 * })
 * ```
 */
export function createWebSearchTool(config: WebSearchConfig) {
  return tool({
    description: `Search the web to verify factual claims. Use this when you need to:
- Verify if a service has specific certifications (e.g., SOC2, HIPAA)
- Check current pricing or feature availability
- Confirm recent announcements or changes
- Validate technical specifications`,
    inputSchema: webSearchInputSchema,
    execute: async ({ query, reason }: z.infer<typeof webSearchInputSchema>) => {
      const results = await searchWeb(query, config)
      return {
        query,
        reason,
        results,
        searchedAt: new Date().toISOString(),
      }
    },
  })
}

/**
 * Standalone search function for direct use
 *
 * @example
 * ```typescript
 * const results = await webSearch('Railway SOC2 certification', {
 *   provider: 'tavily',
 *   apiKey: process.env.TAVILY_API_KEY!,
 * })
 * ```
 */
export async function webSearch(query: string, config: WebSearchConfig): Promise<WebSearchResult[]> {
  return searchWeb(query, config)
}
