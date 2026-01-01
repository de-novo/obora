/**
 * Provider Tests
 */

import { describe, expect, test } from 'bun:test'
import { providerFactory } from '../providers'
import { ClaudeProvider } from '../providers/claude'
import { GeminiProvider } from '../providers/gemini'
import { OpenAIProvider } from '../providers/openai'

describe('ClaudeProvider', () => {
  describe('constructor', () => {
    test('creates with default config', () => {
      const provider = new ClaudeProvider()
      expect(provider.name).toBe('claude')
    })

    test('creates with custom config', () => {
      const provider = new ClaudeProvider({
        model: 'claude-opus-4-20250514',
        timeout: 60000,
      })
      expect(provider.name).toBe('claude')
    })
  })

  describe('isAvailable', () => {
    test('returns boolean', async () => {
      const provider = new ClaudeProvider()
      const available = await provider.isAvailable()
      expect(typeof available).toBe('boolean')
    })
  })
})

describe('OpenAIProvider', () => {
  describe('constructor', () => {
    test('creates with default config', () => {
      const provider = new OpenAIProvider()
      expect(provider.name).toBe('openai')
    })

    test('creates with custom config', () => {
      const provider = new OpenAIProvider({
        model: 'gpt-4-turbo',
        timeout: 60000,
      })
      expect(provider.name).toBe('openai')
    })
  })

  describe('isAvailable', () => {
    test('returns boolean', async () => {
      const provider = new OpenAIProvider()
      const available = await provider.isAvailable()
      expect(typeof available).toBe('boolean')
    })
  })
})

describe('GeminiProvider', () => {
  describe('constructor', () => {
    test('creates with default config', () => {
      const provider = new GeminiProvider()
      expect(provider.name).toBe('gemini')
    })

    test('creates with custom config', () => {
      const provider = new GeminiProvider({
        model: 'gemini-1.5-pro',
        timeout: 60000,
      })
      expect(provider.name).toBe('gemini')
    })
  })

  describe('isAvailable', () => {
    test('returns boolean', async () => {
      const provider = new GeminiProvider()
      const available = await provider.isAvailable()
      expect(typeof available).toBe('boolean')
    })
  })
})

describe('providerFactory', () => {
  describe('list', () => {
    test('returns array of provider names', () => {
      const providers = providerFactory.list()

      expect(Array.isArray(providers)).toBe(true)
      expect(providers).toContain('claude')
      expect(providers).toContain('openai')
      expect(providers).toContain('gemini')
    })
  })

  describe('create', () => {
    test('creates claude provider', () => {
      const provider = providerFactory.create('claude')
      expect(provider.name).toBe('claude')
    })

    test('creates openai provider', () => {
      const provider = providerFactory.create('openai')
      expect(provider.name).toBe('openai')
    })

    test('creates gemini provider', () => {
      const provider = providerFactory.create('gemini')
      expect(provider.name).toBe('gemini')
    })

    test('throws for unknown provider', () => {
      expect(() => providerFactory.create('unknown')).toThrow()
    })

    test('passes config to provider', () => {
      const provider = providerFactory.create('claude', {
        model: 'claude-opus-4-20250514',
      })
      expect(provider.name).toBe('claude')
    })
  })

  describe('register', () => {
    test('registers custom provider', () => {
      class CustomProvider {
        readonly name = 'custom'
        async run() {
          return { content: 'test' }
        }
        async isAvailable() {
          return true
        }
      }

      providerFactory.register('custom', CustomProvider as any)

      expect(providerFactory.list()).toContain('custom')

      const provider = providerFactory.create('custom')
      expect(provider.name).toBe('custom')
    })
  })
})

describe('Provider interface compliance', () => {
  const providers = [
    { name: 'claude', Provider: ClaudeProvider },
    { name: 'openai', Provider: OpenAIProvider },
    { name: 'gemini', Provider: GeminiProvider },
  ]

  for (const { name, Provider } of providers) {
    describe(name, () => {
      test('has name property', () => {
        const provider = new Provider()
        expect(typeof provider.name).toBe('string')
        expect(provider.name.length).toBeGreaterThan(0)
      })

      test('has run method', () => {
        const provider = new Provider()
        expect(typeof provider.run).toBe('function')
      })

      test('has isAvailable method', () => {
        const provider = new Provider()
        expect(typeof provider.isAvailable).toBe('function')
      })

      test('has stream method (StreamableProvider)', () => {
        const provider = new Provider()
        expect(typeof provider.stream).toBe('function')
      })
    })
  }
})
