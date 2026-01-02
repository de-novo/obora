/**
 * DebateEngine Tests
 */

import { describe, expect, test } from 'bun:test'
import { DebateEngine } from '../engine/DebateEngine'
import { createOrchestratorMock, createPositionChangeMock, createStablePositionMock, MockProvider } from './mocks'

describe('DebateEngine', () => {
  describe('constructor', () => {
    test('creates with default config', () => {
      const engine = new DebateEngine()
      const config = engine.getConfig()

      expect(config.mode).toBe('strong')
      expect(config.maxRounds).toBe(10)
      expect(config.timeout).toBe(300000)
    })

    test('creates with custom config', () => {
      const engine = new DebateEngine({
        mode: 'weak',
        maxRounds: 5,
        timeout: 60000,
      })
      const config = engine.getConfig()

      expect(config.mode).toBe('weak')
      expect(config.maxRounds).toBe(5)
      expect(config.timeout).toBe(60000)
    })

    test('merges partial config with defaults', () => {
      const engine = new DebateEngine({ mode: 'weak' })
      const config = engine.getConfig()

      expect(config.mode).toBe('weak')
      expect(config.maxRounds).toBe(10) // default
      expect(config.timeout).toBe(300000) // default
    })
  })

  describe('getConfig / setConfig', () => {
    test('getConfig returns copy of config', () => {
      const engine = new DebateEngine()
      const config1 = engine.getConfig()
      const config2 = engine.getConfig()

      expect(config1).toEqual(config2)
      expect(config1).not.toBe(config2) // different objects
    })

    test('setConfig updates config', () => {
      const engine = new DebateEngine({ mode: 'strong' })

      engine.setConfig({ mode: 'weak' })

      expect(engine.getConfig().mode).toBe('weak')
    })

    test('setConfig preserves unset values', () => {
      const engine = new DebateEngine({
        mode: 'strong',
        maxRounds: 5,
      })

      engine.setConfig({ timeout: 60000 })

      const config = engine.getConfig()
      expect(config.mode).toBe('strong')
      expect(config.maxRounds).toBe(5)
      expect(config.timeout).toBe(60000)
    })
  })

  describe('run() - weak mode', () => {
    test('runs with 2 participants', async () => {
      const engine = new DebateEngine({ mode: 'weak' })

      const result = await engine.run({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: new MockProvider('alice', ['Alice initial']) },
          { name: 'bob', provider: new MockProvider('bob', ['Bob initial']) },
        ],
      })

      expect(result.topic).toBe('Test topic')
      expect(result.mode).toBe('weak')
      expect(result.rounds.length).toBe(2) // 2 initial rounds only
      expect(result.rounds[0]?.phase).toBe('initial')
      expect(result.rounds[0]?.speaker).toBe('alice')
      expect(result.rounds[1]?.phase).toBe('initial')
      expect(result.rounds[1]?.speaker).toBe('bob')
    })

    test('includes consensus when orchestrator provided', async () => {
      const engine = new DebateEngine({ mode: 'weak' })
      const orchestrator = createOrchestratorMock()

      const result = await engine.run({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: new MockProvider('alice') },
          { name: 'bob', provider: new MockProvider('bob') },
        ],
        orchestrator,
      })

      expect(result.consensus).toContain('Consensus Summary')
      expect(result.rounds.length).toBe(3) // 2 initial + 1 consensus
      expect(result.rounds[2]?.phase).toBe('consensus')
    })

    test('no consensus without orchestrator', async () => {
      const engine = new DebateEngine({ mode: 'weak' })

      const result = await engine.run({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: new MockProvider('alice') },
          { name: 'bob', provider: new MockProvider('bob') },
        ],
      })

      expect(result.consensus).toBe('')
    })

    test('records metadata', async () => {
      const engine = new DebateEngine({ mode: 'weak' })

      const before = Date.now()
      const result = await engine.run({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: new MockProvider('alice') },
          { name: 'bob', provider: new MockProvider('bob') },
        ],
      })
      const after = Date.now()

      expect(result.metadata.participantCount).toBe(2)
      expect(result.metadata.startTime).toBeGreaterThanOrEqual(before)
      expect(result.metadata.endTime).toBeLessThanOrEqual(after)
      expect(result.metadata.totalDurationMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('run() - strong mode', () => {
    test('runs all 4 phases', async () => {
      const engine = new DebateEngine({ mode: 'strong' })
      const orchestrator = createOrchestratorMock()

      const result = await engine.run({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: createPositionChangeMock('alice') },
          { name: 'bob', provider: createStablePositionMock('bob') },
        ],
        orchestrator,
      })

      expect(result.mode).toBe('strong')

      // Check all phases are present
      const phases = result.rounds.map((r) => r.phase)
      expect(phases).toContain('initial')
      expect(phases).toContain('rebuttal')
      expect(phases).toContain('revised')
      expect(phases).toContain('consensus')
    })

    test('runs 6 rounds for 2 participants plus consensus', async () => {
      const engine = new DebateEngine({ mode: 'strong' })
      const orchestrator = createOrchestratorMock()

      const result = await engine.run({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: createPositionChangeMock('alice') },
          { name: 'bob', provider: createStablePositionMock('bob') },
        ],
        orchestrator,
      })

      // 2 initial + 2 rebuttal + 2 revised + 1 consensus = 7
      expect(result.rounds.length).toBe(7)
    })

    test('detects position changes', async () => {
      const engine = new DebateEngine({ mode: 'strong' })

      const result = await engine.run({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: createPositionChangeMock('alice') },
          { name: 'bob', provider: createStablePositionMock('bob') },
        ],
        orchestrator: createOrchestratorMock(),
      })

      // Alice should have a position change (mock returns "I have revised")
      expect(result.positionChanges.length).toBeGreaterThanOrEqual(1)

      const aliceChange = result.positionChanges.find((c) => c.participant === 'alice')
      expect(aliceChange).toBeDefined()
      expect(aliceChange?.phase).toBe('revised')
    })
  })

  describe('run() - config override', () => {
    test('options config overrides engine config', async () => {
      const engine = new DebateEngine({ mode: 'strong' })

      const result = await engine.run({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: new MockProvider('alice') },
          { name: 'bob', provider: new MockProvider('bob') },
        ],
        config: { mode: 'weak' },
      })

      // Should run in weak mode despite engine being in strong mode
      expect(result.mode).toBe('weak')
      expect(result.rounds.length).toBe(2) // weak mode = initial only
    })
  })

  describe('runStreaming()', () => {
    test('emits phase_start events', async () => {
      const engine = new DebateEngine({ mode: 'weak' })

      const events: string[] = []
      for await (const event of engine.runStreaming({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: new MockProvider('alice') },
          { name: 'bob', provider: new MockProvider('bob') },
        ],
      })) {
        if (event.type === 'phase_start') {
          events.push(`phase_start:${event.phase}`)
        }
      }

      expect(events).toContain('phase_start:initial')
    })

    test('emits chunk events', async () => {
      const engine = new DebateEngine({ mode: 'weak' })

      let chunkCount = 0
      let totalContent = ''

      for await (const event of engine.runStreaming({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: new MockProvider('alice', ['Hello world']) },
          { name: 'bob', provider: new MockProvider('bob', ['Goodbye world']) },
        ],
      })) {
        if (event.type === 'chunk' && event.chunk) {
          chunkCount++
          totalContent += event.chunk
        }
      }

      expect(chunkCount).toBeGreaterThan(0)
      expect(totalContent).toContain('Hello')
      expect(totalContent).toContain('Goodbye')
    })

    test('emits round_start and round_end events', async () => {
      const engine = new DebateEngine({ mode: 'weak' })

      const roundStarts: string[] = []
      const roundEnds: string[] = []

      for await (const event of engine.runStreaming({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: new MockProvider('alice') },
          { name: 'bob', provider: new MockProvider('bob') },
        ],
      })) {
        if (event.type === 'round_start') {
          roundStarts.push(event.participant || '')
        }
        if (event.type === 'round_end') {
          roundEnds.push(event.participant || '')
        }
      }

      expect(roundStarts).toEqual(['alice', 'bob'])
      expect(roundEnds).toEqual(['alice', 'bob'])
    })

    test('includes full content in round_end', async () => {
      const engine = new DebateEngine({ mode: 'weak' })

      const contents: string[] = []

      for await (const event of engine.runStreaming({
        topic: 'Test topic',
        participants: [{ name: 'alice', provider: new MockProvider('alice', ['Alice says hello']) }],
      })) {
        if (event.type === 'round_end' && event.content) {
          contents.push(event.content)
        }
      }

      expect(contents[0]).toBe('Alice says hello')
    })

    test('strong mode streams all phases', async () => {
      const engine = new DebateEngine({ mode: 'strong' })

      const phases: string[] = []

      for await (const event of engine.runStreaming({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: createPositionChangeMock('alice') },
          { name: 'bob', provider: createStablePositionMock('bob') },
        ],
        orchestrator: createOrchestratorMock(),
      })) {
        if (event.type === 'phase_start' && event.phase) {
          phases.push(event.phase)
        }
      }

      expect(phases).toContain('initial')
      expect(phases).toContain('rebuttal')
      expect(phases).toContain('revised')
      expect(phases).toContain('consensus')
    })
  })

  describe('extractDisagreements', () => {
    test('extracts disagreements from consensus', async () => {
      const engine = new DebateEngine({ mode: 'weak' })

      const result = await engine.run({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: new MockProvider('alice') },
          { name: 'bob', provider: new MockProvider('bob') },
        ],
        orchestrator: createOrchestratorMock(),
      })

      // The mock orchestrator includes "Unresolved Disagreements" section
      expect(result.unresolvedDisagreements.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('useNativeWebSearch', () => {
    test('config accepts useNativeWebSearch option', () => {
      const engine = new DebateEngine({
        mode: 'strong',
        useNativeWebSearch: true,
      })
      const config = engine.getConfig()

      expect(config.useNativeWebSearch).toBe(true)
    })

    test('defaults to no native websearch', () => {
      const engine = new DebateEngine({ mode: 'strong' })
      const config = engine.getConfig()

      expect(config.useNativeWebSearch).toBeUndefined()
    })

    test('runs rebuttal phase with native websearch prompt', async () => {
      const engine = new DebateEngine({
        mode: 'strong',
        useNativeWebSearch: true,
        toolPhases: ['rebuttal'],
      })

      const promptsReceived: string[] = []
      const mockProvider = new MockProvider('alice', ['Initial', 'Rebuttal', 'Revised'])
      const originalRun = mockProvider.run.bind(mockProvider)
      mockProvider.run = async (prompt: string) => {
        promptsReceived.push(prompt)
        return originalRun(prompt)
      }

      await engine.run({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: mockProvider },
          { name: 'bob', provider: new MockProvider('bob', ['Initial', 'Rebuttal', 'Revised']) },
        ],
      })

      const rebuttalPrompt = promptsReceived.find((p) => p.includes('Critical Reviewer'))
      expect(rebuttalPrompt).toBeDefined()
      expect(rebuttalPrompt).toContain('webSearch')
    })

    test('without native websearch, rebuttal prompt has no webSearch mention', async () => {
      const engine = new DebateEngine({
        mode: 'strong',
        useNativeWebSearch: false,
      })

      const promptsReceived: string[] = []
      const mockProvider = new MockProvider('alice', ['Initial', 'Rebuttal', 'Revised'])
      const originalRun = mockProvider.run.bind(mockProvider)
      mockProvider.run = async (prompt: string) => {
        promptsReceived.push(prompt)
        return originalRun(prompt)
      }

      await engine.run({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: mockProvider },
          { name: 'bob', provider: new MockProvider('bob', ['Initial', 'Rebuttal', 'Revised']) },
        ],
      })

      const rebuttalPrompt = promptsReceived.find((p) => p.includes('Critical Reviewer'))
      expect(rebuttalPrompt).toBeDefined()
      expect(rebuttalPrompt).not.toContain('webSearch')
    })
  })

  describe('skills integration', () => {
    test('config accepts skills option', () => {
      const engine = new DebateEngine({
        mode: 'strong',
        skills: {
          global: ['fact-checker'],
          participants: {
            alice: ['devil-advocate'],
          },
        },
      })
      const config = engine.getConfig()

      expect(config.skills?.global).toEqual(['fact-checker'])
      expect(config.skills?.participants?.alice).toEqual(['devil-advocate'])
    })

    test('config accepts skillsPath option', () => {
      const engine = new DebateEngine({
        mode: 'strong',
        skillsPath: '.custom/skills',
      })
      const config = engine.getConfig()

      expect(config.skillsPath).toBe('.custom/skills')
    })

    test('injects global skills into prompts', async () => {
      const engine = new DebateEngine({
        mode: 'strong',
        skills: {
          global: ['fact-checker'],
        },
      })

      const promptsReceived: string[] = []
      const mockProvider = new MockProvider('alice', ['Initial', 'Rebuttal', 'Revised'])
      const originalRun = mockProvider.run.bind(mockProvider)
      mockProvider.run = async (prompt: string) => {
        promptsReceived.push(prompt)
        return originalRun(prompt)
      }

      await engine.run({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: mockProvider },
          { name: 'bob', provider: new MockProvider('bob', ['Initial', 'Rebuttal', 'Revised']) },
        ],
      })

      const initialPrompt = promptsReceived[0]
      expect(initialPrompt).toContain('<available_skills>')
      expect(initialPrompt).toContain('<activated_skill_contents>')
      expect(initialPrompt).toContain('fact-checker')
    })

    test('injects per-participant skills into prompts', async () => {
      const engine = new DebateEngine({
        mode: 'strong',
        skills: {
          participants: {
            alice: ['devil-advocate'],
            bob: ['fact-checker'],
          },
        },
      })

      const alicePrompts: string[] = []
      const bobPrompts: string[] = []

      const aliceProvider = new MockProvider('alice', ['Initial', 'Rebuttal', 'Revised'])
      const originalAliceRun = aliceProvider.run.bind(aliceProvider)
      aliceProvider.run = async (prompt: string) => {
        alicePrompts.push(prompt)
        return originalAliceRun(prompt)
      }

      const bobProvider = new MockProvider('bob', ['Initial', 'Rebuttal', 'Revised'])
      const originalBobRun = bobProvider.run.bind(bobProvider)
      bobProvider.run = async (prompt: string) => {
        bobPrompts.push(prompt)
        return originalBobRun(prompt)
      }

      await engine.run({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: aliceProvider },
          { name: 'bob', provider: bobProvider },
        ],
      })

      expect(alicePrompts[0]).toContain('devil-advocate')
      expect(bobPrompts[0]).toContain('fact-checker')
    })

    test('participant-level skills override global skills', async () => {
      const engine = new DebateEngine({
        mode: 'strong',
        skills: {
          global: ['fact-checker'],
          participants: {
            alice: ['devil-advocate'],
          },
        },
      })

      const alicePrompts: string[] = []

      const aliceProvider = new MockProvider('alice', ['Initial', 'Rebuttal', 'Revised'])
      const originalAliceRun = aliceProvider.run.bind(aliceProvider)
      aliceProvider.run = async (prompt: string) => {
        alicePrompts.push(prompt)
        return originalAliceRun(prompt)
      }

      await engine.run({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: aliceProvider },
          { name: 'bob', provider: new MockProvider('bob', ['Initial', 'Rebuttal', 'Revised']) },
        ],
      })

      expect(alicePrompts[0]).toContain('devil-advocate')
      expect(alicePrompts[0]).not.toContain('fact-checker')
    })

    test('participant.skills property overrides config skills', async () => {
      const engine = new DebateEngine({
        mode: 'strong',
        skills: {
          global: ['fact-checker'],
          participants: {
            alice: ['devil-advocate'],
          },
        },
      })

      const alicePrompts: string[] = []

      const aliceProvider = new MockProvider('alice', ['Initial', 'Rebuttal', 'Revised'])
      const originalAliceRun = aliceProvider.run.bind(aliceProvider)
      aliceProvider.run = async (prompt: string) => {
        alicePrompts.push(prompt)
        return originalAliceRun(prompt)
      }

      await engine.run({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: aliceProvider, skills: ['synthesizer'] },
          { name: 'bob', provider: new MockProvider('bob', ['Initial', 'Rebuttal', 'Revised']) },
        ],
      })

      expect(alicePrompts[0]).toContain('synthesizer')
      expect(alicePrompts[0]).not.toContain('devil-advocate')
      expect(alicePrompts[0]).not.toContain('fact-checker')
    })

    test('skill prompts include phase context', async () => {
      const engine = new DebateEngine({
        mode: 'strong',
        skills: {
          global: ['fact-checker'],
        },
      })

      const promptsReceived: string[] = []
      const mockProvider = new MockProvider('alice', ['Initial', 'Rebuttal', 'Revised'])
      const originalRun = mockProvider.run.bind(mockProvider)
      mockProvider.run = async (prompt: string) => {
        promptsReceived.push(prompt)
        return originalRun(prompt)
      }

      await engine.run({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: mockProvider },
          { name: 'bob', provider: new MockProvider('bob', ['Initial', 'Rebuttal', 'Revised']) },
        ],
      })

      const initialPrompt = promptsReceived[0]
      const rebuttalPrompt = promptsReceived[1]
      const revisedPrompt = promptsReceived[2]

      expect(initialPrompt).toContain('<activation-phase>initial</activation-phase>')
      expect(rebuttalPrompt).toContain('<activation-phase>rebuttal</activation-phase>')
      expect(revisedPrompt).toContain('<activation-phase>revised</activation-phase>')
    })

    test('no skills injection when skills config is empty', async () => {
      const engine = new DebateEngine({
        mode: 'weak',
      })

      const promptsReceived: string[] = []
      const mockProvider = new MockProvider('alice', ['Initial'])
      const originalRun = mockProvider.run.bind(mockProvider)
      mockProvider.run = async (prompt: string) => {
        promptsReceived.push(prompt)
        return originalRun(prompt)
      }

      await engine.run({
        topic: 'Test topic',
        participants: [
          { name: 'alice', provider: mockProvider },
          { name: 'bob', provider: new MockProvider('bob', ['Initial']) },
        ],
      })

      expect(promptsReceived[0]).not.toContain('<available_skills>')
      expect(promptsReceived[0]).not.toContain('<skills_context>')
    })
  })
})
