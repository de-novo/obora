import type { ChatModelCapabilities } from '../llm/types'
import type { ProviderResponse, StreamableProvider } from '../providers/types'

export const DEFAULT_MOCK_CAPABILITIES: ChatModelCapabilities = {
  structuredOutput: true,
  toolCalling: true,
  streaming: 'token',
  maxContextWindow: 128000,
  supportsSystemMessages: true,
  promptCaching: false,
  webSearch: false,
  vision: false,
}

/**
 * Mock provider that returns predefined responses
 */
export class MockProvider implements StreamableProvider {
  readonly name: string
  private responses: string[]
  private responseIndex = 0
  private _isAvailable: boolean

  constructor(name: string, responses: string[] = ['Mock response'], isAvailable = true) {
    this.name = name
    this.responses = responses
    this._isAvailable = isAvailable
  }

  async run(_prompt: string): Promise<ProviderResponse> {
    const content = this.responses[this.responseIndex % this.responses.length] ?? 'Mock response'
    this.responseIndex++
    return {
      content,
      metadata: {
        model: 'mock-model',
        backend: 'api',
      },
    }
  }

  async *stream(_prompt: string): AsyncGenerator<{ chunk: string; done: boolean }> {
    const content = this.responses[this.responseIndex % this.responses.length] ?? 'Mock response'
    this.responseIndex++

    // Simulate streaming by yielding word by word
    const words = content.split(' ')
    for (let i = 0; i < words.length; i++) {
      const word = words[i] ?? ''
      const chunk = i === 0 ? word : ` ${word}`
      yield { chunk, done: false }
    }
    yield { chunk: '', done: true }
  }

  async isAvailable(): Promise<boolean> {
    return this._isAvailable
  }

  /**
   * Reset the response index for reuse
   */
  reset(): void {
    this.responseIndex = 0
  }

  /**
   * Get the number of times run() was called
   */
  getCallCount(): number {
    return this.responseIndex
  }
}

/**
 * Create a mock provider with position change behavior
 */
export function createPositionChangeMock(name: string): MockProvider {
  return new MockProvider(name, [
    // Initial position
    'I recommend Option A because it provides better scalability.',
    // Rebuttal (criticizing others)
    'The other position fails to consider the cost implications.',
    // Revised position (showing change)
    'After reviewing the rebuttals, I have revised my position. I now agree that Option B with guardrails is the better approach.',
  ])
}

/**
 * Create a mock provider that maintains position
 */
export function createStablePositionMock(name: string): MockProvider {
  return new MockProvider(name, [
    // Initial position
    'I recommend Option B for its simplicity.',
    // Rebuttal
    'The other approach underestimates operational complexity.',
    // Revised position (maintaining)
    'I maintain my original position. Option B remains the best choice given the constraints.',
  ])
}

/**
 * Create a mock orchestrator for consensus
 */
export function createOrchestratorMock(): MockProvider {
  return new MockProvider('orchestrator', [
    `## Consensus Summary

### Points of Agreement
- Both participants agree on the need for proper planning
- Cost considerations are important

### Unresolved Disagreements
- Timing of migration remains contested
- Resource allocation approach differs

### Final Recommendation
Proceed with Option B but implement suggested guardrails.

### Cautions
- Monitor costs closely
- Plan for contingencies`,
  ])
}
