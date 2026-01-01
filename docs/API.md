# Obora API Reference

Complete API documentation for the Obora Multi-AI Debate System.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [DebateEngine](#debateengine)
- [Providers](#providers)
- [Types](#types)
- [Tools](#tools)
- [CLI](#cli)

---

## Installation

```bash
bun install @obora/core
```

---

## Quick Start

```typescript
import { DebateEngine, ClaudeProvider, OpenAIProvider } from '@obora/core'

const engine = new DebateEngine({ mode: 'strong' })

const result = await engine.run({
  topic: 'Should we migrate to microservices?',
  participants: [
    { name: 'claude', provider: new ClaudeProvider() },
    { name: 'openai', provider: new OpenAIProvider() }
  ],
  orchestrator: new ClaudeProvider()
})

console.log(result.consensus)
```

---

## DebateEngine

The core class that orchestrates multi-AI debates.

### Constructor

```typescript
new DebateEngine(config?: Partial<DebateEngineConfig>)
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `config.mode` | `'strong' \| 'weak'` | `'strong'` | Debate mode |
| `config.maxRounds` | `number` | `10` | Maximum rounds per phase |
| `config.timeout` | `number` | `300000` | Timeout in milliseconds |
| `config.tools` | `Record<string, Tool>` | `undefined` | Custom tools for fact-checking |
| `config.toolPhases` | `DebatePhase[]` | `['rebuttal']` | Phases with tools enabled |

#### Example

```typescript
// Strong mode with custom timeout
const engine = new DebateEngine({
  mode: 'strong',
  timeout: 600000 // 10 minutes
})

// Weak mode for quick discussions
const weakEngine = new DebateEngine({ mode: 'weak' })
```

### Methods

#### `run(options: DebateOptions): Promise<DebateResult>`

Run a complete debate session.

```typescript
const result = await engine.run({
  topic: 'AWS vs managed platforms for a startup?',
  participants: [
    { name: 'claude', provider: new ClaudeProvider() },
    { name: 'openai', provider: new OpenAIProvider() }
  ],
  orchestrator: new ClaudeProvider()
})
```

**Returns:** `DebateResult` with consensus, position changes, and full transcript.

#### `runStreaming(options: StreamingDebateOptions): AsyncGenerator<DebateStreamEvent>`

Run a debate with real-time streaming output.

```typescript
for await (const event of engine.runStreaming(options)) {
  switch (event.type) {
    case 'phase_start':
      console.log(`\n=== ${event.phase?.toUpperCase()} ===\n`)
      break
    case 'chunk':
      process.stdout.write(event.chunk || '')
      break
    case 'round_end':
      console.log('\n')
      break
  }
}
```

**Yields:** `DebateStreamEvent` objects with event type and content.

#### `getConfig(): DebateEngineConfig`

Get the current engine configuration.

#### `setConfig(config: Partial<DebateEngineConfig>): void`

Update the engine configuration.

---

## Providers

AI provider implementations for different services.

### ClaudeProvider

Anthropic Claude provider (CLI or API).

```typescript
import { ClaudeProvider } from '@obora/core'

// Auto-detect: uses API if ANTHROPIC_API_KEY set, otherwise CLI
const claude = new ClaudeProvider()

// Force API mode
const claudeApi = new ClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-20250514'
})

// Force CLI mode
const claudeCli = new ClaudeProvider({ forceCLI: true })
```

#### Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | `env.ANTHROPIC_API_KEY` | Anthropic API key |
| `model` | `string` | `'claude-sonnet-4-20250514'` | Model to use |
| `forceCLI` | `boolean` | `false` | Force CLI mode |
| `timeout` | `number` | `120000` | Request timeout (ms) |

### OpenAIProvider

OpenAI provider (Codex CLI or API).

```typescript
import { OpenAIProvider } from '@obora/core'

// Auto-detect
const openai = new OpenAIProvider()

// Force API mode
const openaiApi = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o'
})
```

#### Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | `env.OPENAI_API_KEY` | OpenAI API key |
| `model` | `string` | `'gpt-4o'` | Model to use |
| `forceCLI` | `boolean` | `false` | Force CLI (Codex) mode |

### GeminiProvider

Google Gemini provider (CLI or API).

```typescript
import { GeminiProvider } from '@obora/core'

const gemini = new GeminiProvider()

// With API key
const geminiApi = new GeminiProvider({
  apiKey: process.env.GOOGLE_API_KEY,
  model: 'gemini-2.0-flash'
})
```

#### Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | `env.GOOGLE_API_KEY` | Google API key |
| `model` | `string` | `'gemini-2.0-flash'` | Model to use |
| `forceCLI` | `boolean` | `false` | Force CLI mode |

### Provider Interface

All providers implement the `Provider` interface:

```typescript
interface Provider {
  readonly name: string
  run(prompt: string): Promise<ProviderResponse>
  isAvailable(): Promise<boolean>
}
```

For streaming support, providers implement `StreamableProvider`:

```typescript
interface StreamableProvider extends Provider {
  stream(prompt: string): AsyncGenerator<{ chunk: string; done: boolean }>
}
```

### Custom Provider Example

```typescript
import { Provider, ProviderResponse } from '@obora/core'

class MyCustomProvider implements Provider {
  readonly name = 'my-custom-ai'

  async run(prompt: string): Promise<ProviderResponse> {
    const response = await fetch('https://my-ai-api.com/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt })
    })
    const data = await response.json()
    return { content: data.text }
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.MY_AI_API_KEY
  }
}
```

---

## Types

### DebateOptions

Options for running a debate.

```typescript
interface DebateOptions {
  topic: string                              // The topic to debate
  participants: DebateParticipant[]          // AI participants (min 2)
  orchestrator?: Provider                    // For consensus generation
  config?: Partial<DebateEngineConfig>       // Override config
}
```

### DebateResult

Complete result from a debate session.

```typescript
interface DebateResult {
  topic: string                              // Original topic
  mode: DebateMode                           // 'strong' or 'weak'
  rounds: DebateRound[]                      // All debate rounds
  consensus: string                          // Final consensus
  positionChanges: PositionChange[]          // Detected changes
  unresolvedDisagreements: string[]          // Open disagreements
  metadata: {
    startTime: number                        // Unix timestamp
    endTime: number                          // Unix timestamp
    totalDurationMs: number                  // Total duration
    participantCount: number                 // Number of participants
  }
}
```

### DebateRound

A single round in the debate.

```typescript
interface DebateRound {
  phase: DebatePhase       // 'initial' | 'rebuttal' | 'revised' | 'consensus'
  speaker: string          // Participant name
  content: string          // Response content
  timestamp: number        // Unix timestamp
  toolCalls?: ToolCall[]   // Tools used (if any)
}
```

### PositionChange

Record of a position change during debate.

```typescript
interface PositionChange {
  participant: string      // Who changed
  from: string             // Original position
  to: string               // New position
  reason: string           // Why they changed
  phase: DebatePhase       // When it happened
}
```

### DebateStreamEvent

Events emitted during streaming.

```typescript
interface DebateStreamEvent {
  type: 'chunk' | 'round_start' | 'round_end' | 'phase_start' | 'phase_end'
  phase?: DebatePhase
  participant?: string
  chunk?: string           // For 'chunk' events
  content?: string         // For 'round_end' events
  timestamp: number
}
```

### DebatePhase

```typescript
type DebatePhase = 'initial' | 'rebuttal' | 'revised' | 'consensus'
```

### DebateMode

```typescript
type DebateMode = 'strong' | 'weak'
```

---

## Tools

Optional tools for enhanced fact-checking during debates.

### Built-in Provider Tools (Recommended)

For basic fact-checking, use each provider's built-in tools:

```typescript
// Claude with web search
const claude = new ClaudeProvider({ enabledTools: ['WebSearch'] })

// OpenAI with web search
const openai = new OpenAIProvider({ enableWebSearch: true })

// Gemini with Google search
const gemini = new GeminiProvider({ enabledTools: ['google_web_search'] })
```

### Custom Web Search Tool

For more control, use custom search providers:

```typescript
import { createWebSearchTool, createDebateTools } from '@obora/core'

// Create a Tavily search tool
const tavilySearch = createWebSearchTool({
  provider: 'tavily',
  apiKey: process.env.TAVILY_API_KEY!,
  maxResults: 5
})

// Or use createDebateTools for all tools
const tools = createDebateTools({
  webSearch: {
    provider: 'tavily',
    apiKey: process.env.TAVILY_API_KEY!
  }
})

// Use with debate engine
const engine = new DebateEngine({
  mode: 'strong',
  tools,
  toolPhases: ['rebuttal']
})
```

### Supported Search Providers

| Provider | API Key Env | Description |
|----------|-------------|-------------|
| `tavily` | `TAVILY_API_KEY` | Optimized for AI (recommended) |
| `serper` | `SERPER_API_KEY` | Google search results |
| `exa` | `EXA_API_KEY` | Semantic search |

### Direct Web Search

```typescript
import { webSearch } from '@obora/core'

const results = await webSearch('Railway SOC2 certification', {
  provider: 'tavily',
  apiKey: process.env.TAVILY_API_KEY!
})

console.log(results)
// [{ title: '...', url: '...', snippet: '...' }, ...]
```

---

## CLI

Command-line interface for running debates.

### Installation

```bash
bun install
```

### Usage

```bash
# Basic debate
bun run obora debate "Should we use microservices?"

# With options
bun run obora debate "Topic" --mode strong --providers claude,openai

# Streaming output
bun run obora debate "Topic" --streaming

# Save results
bun run obora debate "Topic" --output result.json

# Read topic from file
bun run obora debate --file topic.txt
```

### CLI Options

| Option | Short | Description |
|--------|-------|-------------|
| `--mode <mode>` | `-m` | `strong` (default) or `weak` |
| `--providers <list>` | `-p` | Comma-separated providers (default: `claude,openai`) |
| `--streaming` | `-s` | Enable real-time streaming output |
| `--output <path>` | `-o` | Save results to JSON file |
| `--file <path>` | `-f` | Read topic from file |
| `--help` | `-h` | Show help message |

### Available Providers

- `claude` - Anthropic Claude (requires claude CLI or ANTHROPIC_API_KEY)
- `openai` - OpenAI GPT (requires codex CLI or OPENAI_API_KEY)
- `gemini` - Google Gemini (requires gemini CLI or GOOGLE_API_KEY)

---

## Debate Modes

### Strong Mode (Default)

Full 4-phase debate with critical review:

1. **Initial**: Each AI presents their position
2. **Rebuttal**: AIs critique each other's positions
3. **Revised**: AIs update positions based on critiques
4. **Consensus**: Orchestrator summarizes agreements/disagreements

Best for: High-stakes decisions, complex trade-offs, uncovering blind spots.

### Weak Mode

Simple 2-phase debate:

1. **Initial**: Each AI presents their position
2. **Consensus**: Orchestrator summarizes

Best for: Quick discussions, exploring options, time-sensitive decisions.

---

## Error Handling

```typescript
try {
  const result = await engine.run(options)
} catch (error) {
  if (error.message.includes('not available')) {
    console.error('Provider not available. Check API keys or CLI installation.')
  } else if (error.message.includes('timeout')) {
    console.error('Debate timed out. Increase timeout in config.')
  } else {
    throw error
  }
}
```

---

## Best Practices

1. **Use Strong Mode for important decisions** - The rebuttal phase catches blind spots

2. **Include at least 2 different providers** - Diverse AI perspectives lead to better debates

3. **Always provide an orchestrator** - Without one, no consensus is generated

4. **Use streaming for CLI applications** - Better UX with real-time output

5. **Enable tools during rebuttal** - Fact-checking during critique improves accuracy

---

## License

MIT
