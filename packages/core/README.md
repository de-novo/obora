# @obora/core

[![npm version](https://img.shields.io/npm/v/@obora/core.svg)](https://www.npmjs.com/package/@obora/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

> Multi-AI Debate Engine - Core Library

Make multiple AIs challenge, critique, and revise each other's positions to reach better conclusions.

## Installation

```bash
npm install @obora/core
# or
bun add @obora/core
```

## Quick Start

```typescript
import { DebateEngine, ClaudeProvider, OpenAIProvider } from '@obora/core'

const claude = new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
const openai = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })

const engine = new DebateEngine({ mode: 'strong' })

const result = await engine.run({
  topic: 'Should we migrate to microservices?',
  participants: [
    { name: 'claude', provider: claude },
    { name: 'openai', provider: openai },
  ],
  orchestrator: claude,
})

console.log(result.consensus)
```

## Debate Modes

| Mode | Description |
|------|-------------|
| `strong` | Full debate with rebuttal and revision phases |
| `weak` | Quick consensus without deep critique |

## Features

- **Multi-Provider Support**: Claude, OpenAI, Gemini
- **OAuth Authentication**: Use existing subscriptions
- **Streaming**: Real-time output
- **WebSearch**: Fact-checking during rebuttals
- **TypeScript**: Full type safety

## Documentation

See the [main repository](https://github.com/de-novo/obora) for full documentation.

## License

MIT
