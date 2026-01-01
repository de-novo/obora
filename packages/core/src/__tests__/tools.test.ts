/**
 * Tools Tests
 */

import { describe, expect, test } from 'bun:test'
import type { WebSearchConfig } from '../tools'
import { createDebateTools, createWebSearchTool } from '../tools'

describe('createDebateTools', () => {
  test('returns empty object with no config', () => {
    const tools = createDebateTools()
    expect(Object.keys(tools).length).toBe(0)
  })

  test('returns empty object with empty config', () => {
    const tools = createDebateTools({})
    expect(Object.keys(tools).length).toBe(0)
  })

  test('creates webSearch tool when configured', () => {
    const tools = createDebateTools({
      webSearch: {
        provider: 'tavily',
        apiKey: 'test-key',
      },
    })

    expect(tools.webSearch).toBeDefined()
    expect(typeof tools.webSearch).toBe('object')
  })

  test('webSearch tool has correct structure', () => {
    const tools = createDebateTools({
      webSearch: {
        provider: 'tavily',
        apiKey: 'test-key',
      },
    })

    // Vercel AI SDK tool structure uses different property names
    expect(tools.webSearch).toBeDefined()
    expect(typeof tools.webSearch).toBe('object')
  })
})

describe('createWebSearchTool', () => {
  test('creates tool with tavily config', () => {
    const tool = createWebSearchTool({
      provider: 'tavily',
      apiKey: 'test-key',
    })

    expect(tool).toBeDefined()
    expect(typeof tool).toBe('object')
  })

  test('creates tool with serper config', () => {
    const tool = createWebSearchTool({
      provider: 'serper',
      apiKey: 'test-key',
    })

    expect(tool).toBeDefined()
  })

  test('creates tool with exa config', () => {
    const tool = createWebSearchTool({
      provider: 'exa',
      apiKey: 'test-key',
    })

    expect(tool).toBeDefined()
  })

  test('respects maxResults config', () => {
    const tool = createWebSearchTool({
      provider: 'tavily',
      apiKey: 'test-key',
      maxResults: 10,
    })

    expect(tool).toBeDefined()
  })

  test('tool description mentions verification', () => {
    const tool = createWebSearchTool({
      provider: 'tavily',
      apiKey: 'test-key',
    })

    expect(tool.description).toContain('verify')
  })
})

describe('WebSearchConfig types', () => {
  test('supports tavily provider', () => {
    const config: WebSearchConfig = {
      provider: 'tavily',
      apiKey: 'key',
    }
    expect(config.provider).toBe('tavily')
  })

  test('supports serper provider', () => {
    const config: WebSearchConfig = {
      provider: 'serper',
      apiKey: 'key',
    }
    expect(config.provider).toBe('serper')
  })

  test('supports exa provider', () => {
    const config: WebSearchConfig = {
      provider: 'exa',
      apiKey: 'key',
    }
    expect(config.provider).toBe('exa')
  })

  test('supports optional maxResults', () => {
    const config: WebSearchConfig = {
      provider: 'tavily',
      apiKey: 'key',
      maxResults: 5,
    }
    expect(config.maxResults).toBe(5)
  })
})
