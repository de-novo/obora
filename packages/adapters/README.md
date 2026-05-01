# @obora/adapters

Obora adapters — LLM, tool, and auth integration layer.

## Installation

```bash
npm install @obora/adapters
```

## Supported Providers

| Provider | Model Examples | API Key Env |
|----------|---------------|-------------|
| ZAI | glm-4.7, glm-5 | `ZAI_API_KEY` |
| OpenAI | gpt-4o, gpt-4-turbo | `OPENAI_API_KEY` |
| Anthropic | claude-opus-4, claude-sonnet-4 | `ANTHROPIC_API_KEY` |
| Google | gemini-2.0-flash | `GOOGLE_API_KEY` |
| DeepSeek | deepseek-chat | `DEEPSEEK_API_KEY` |
| Groq | llama-3.3-70b | `GROQ_API_KEY` |
| Mistral | mistral-large | `MISTRAL_API_KEY` |
| XAI | grok-beta | `XAI_API_KEY` |

## Usage

### Create Adapter

```typescript
import { createAdapter, createAdapterFromEnv } from "@obora/adapters";

// From environment
const envAdapter = createAdapterFromEnv("zai", { model: "glm-4.7" });

// Explicit provider
const zaiAdapter = await createAdapter("zai", { model: "glm-4.7" });
```

### Chat Completion

```typescript
const result = await adapter.chatCompletion({
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello!" }
  ],
  model: "glm-4.7",
  temperature: 0.7,
  maxTokens: 1000
});

console.log(result.message.content);
console.log(result.usage.totalTokens);
```

### Streaming

```typescript
await adapter.streamChatCompletion(
  {
    messages: [{ role: "user", content: "Tell me a story" }],
    model: "glm-4.7"
  },
  (chunk) => {
    process.stdout.write(chunk.delta?.content ?? "");
  }
);
```

### Tool Calling

```typescript
const result = await adapter.chatCompletion({
  messages: [{ role: "user", content: "What's the weather in Seoul?" }],
  model: "glm-4.7",
  tools: [
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "Get current weather",
        parameters: {
          type: "object",
          properties: {
            location: { type: "string" }
          },
          required: ["location"]
        }
      }
    }
  ]
});

if (result.message.toolCalls) {
  const call = result.message.toolCalls[0];
  if (call) {
    console.log(call.function.name);     // "get_weather"
    console.log(call.function.arguments); // '{"location":"Seoul"}'
  }
}
```

## Agent Config Resolver

```typescript
import { AgentConfigResolver } from "@obora/adapters";

const resolver = await AgentConfigResolver.create(process.cwd());

// Resolve config for a specific agent
const config = resolver.resolveForStep("architect", { model: "glm-4.7" });
// { provider: "zai", model: "glm-4.7", temperature: 0.7 }
```

## Mock Adapter (Testing)

```typescript
import { MockLLMAdapter } from "@obora/adapters/testing";

const mock = new MockLLMAdapter({
  "Hello!": "Hi there!",
  "Goodbye!": "See you later!"
});

const result = await mock.chatCompletion({
  messages: [{ role: "user", content: "Hello!" }]
});
console.log(result.message.content); // "Hi there!"
```

## Types

```typescript
import type {
  LLMAdapter,
  ChatCompletionParams,
  ChatCompletionResult,
  ChatMessage,
  ToolDefinition,
  ToolCall
} from "@obora/adapters";
```

## License

MIT
