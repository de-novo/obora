/**
 * Web Search Tool
 *
 * Allows AI to search the web during debate to verify factual claims.
 *
 * Supported providers:
 * - Tavily: Set TAVILY_API_KEY environment variable
 * - Serper: Set SERPER_API_KEY environment variable
 * - Exa: Set EXA_API_KEY environment variable
 *
 * The provider is auto-detected based on available API keys.
 */

import { tool } from 'ai'
import { z } from 'zod'

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

export interface WebSearchConfig {
  provider?: 'tavily' | 'exa' | 'serper' | 'mock'
  apiKey?: string
  maxResults?: number
}

/**
 * Auto-detect provider based on available environment variables
 */
function detectProvider(): { provider: WebSearchConfig['provider']; apiKey: string | undefined } {
  if (process.env.TAVILY_API_KEY) {
    return { provider: 'tavily', apiKey: process.env.TAVILY_API_KEY }
  }
  if (process.env.SERPER_API_KEY) {
    return { provider: 'serper', apiKey: process.env.SERPER_API_KEY }
  }
  if (process.env.EXA_API_KEY) {
    return { provider: 'exa', apiKey: process.env.EXA_API_KEY }
  }
  return { provider: 'mock', apiKey: undefined }
}

/**
 * Search the web using configured provider
 */
async function searchWeb(query: string, config: WebSearchConfig = {}): Promise<WebSearchResult[]> {
  // Auto-detect provider if not specified
  const detected = detectProvider()
  const provider = config.provider ?? detected.provider
  const apiKey = config.apiKey ?? detected.apiKey
  const maxResults = config.maxResults ?? 5

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

    case 'mock':
    default:
      // Mock response for testing
      return [
        {
          title: `Search results for: ${query}`,
          url: 'https://example.com',
          snippet: `Mock search result for "${query}". In production, configure a real search provider.`,
        },
      ]
  }
}

const webSearchInputSchema = z.object({
  query: z.string().describe('Search query to verify a factual claim'),
  reason: z.string().describe('Why this search is needed for the debate'),
})

/**
 * Create a web search tool with configuration
 */
export function createWebSearchTool(config: WebSearchConfig = {}) {
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
 * Default web search tool (auto-detects provider from environment)
 */
export const webSearchTool = createWebSearchTool()

/**
 * Get current provider info for debugging
 */
export function getWebSearchProviderInfo(): {
  provider: string
  configured: boolean
  envVar?: string
} {
  const detected = detectProvider()
  const envVarMap = {
    tavily: 'TAVILY_API_KEY',
    serper: 'SERPER_API_KEY',
    exa: 'EXA_API_KEY',
    mock: undefined,
  }

  return {
    provider: detected.provider ?? 'mock',
    configured: detected.provider !== 'mock',
    envVar: envVarMap[detected.provider ?? 'mock'],
  }
}

/**
 * Standalone search function for direct use
 */
export async function webSearch(query: string, config?: WebSearchConfig): Promise<WebSearchResult[]> {
  return searchWeb(query, config)
}
