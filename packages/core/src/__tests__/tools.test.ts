import { describe, expect, test } from 'bun:test'
import { tool } from 'ai'
import { z } from 'zod'
import { createDebateTools } from '../tools'

describe('createDebateTools', () => {
  test('returns empty object with no config', () => {
    const tools = createDebateTools()
    expect(Object.keys(tools).length).toBe(0)
  })

  test('returns empty object with empty config', () => {
    const tools = createDebateTools({})
    expect(Object.keys(tools).length).toBe(0)
  })

  test('returns custom tools when provided', () => {
    const customTool = tool({
      description: 'A test tool',
      inputSchema: z.object({ input: z.string() }),
      execute: async ({ input }) => `Result: ${input}`,
    })

    const tools = createDebateTools({
      customTools: { testTool: customTool },
    })

    expect(tools.testTool).toBeDefined()
    expect(tools.testTool!.description).toBe('A test tool')
  })
})
