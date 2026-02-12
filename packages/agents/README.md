# @obora-kit/agents

AI agents for obora-kit - Blackboard + Actor architecture

## Installation

```bash
pnpm add @obora-kit/agents
```

## Features

- **LLM Adapters**: Pi Mono adapter with streaming support
- **Agent Roles**: Analyst, Executor, Verifier, Director
- **Prompt Templates**: Variable substitution, conditionals, inheritance
- **Tools**: Function calling, tool registry, built-in tools

## Quick Start

### Create an LLM Adapter

```typescript
import { createLLMAdapter } from "@obora-kit/agents/llm";

const llm = createLLMAdapter("pi-mono", {
  apiKey: process.env.PIMONO_API_KEY,
});

const result = await llm.chatCompletion({
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Create an Agent

```typescript
import { createAgent } from "@obora-kit/agents/roles";

const analyst = createAgent({
  id: "analyst-1",
  role: "analyst",
  llm,
});

const result = await analyst.execute(task, context);
```

### Use Prompt Templates

```typescript
import { PromptTemplate } from "@obora-kit/agents/prompts";

const template = new PromptTemplate(`
Hello {{name}},
{{#if task}}Your task: {{task}}{{/if}}
`);

const result = template.render({
  name: "Alice",
  task: "Analyze the data",
});
```

### Register Tools

```typescript
import { ToolRegistry, registerBuiltinTools } from "@obora-kit/agents/tools";

const registry = new ToolRegistry();
registerBuiltinTools(registry);

const result = await registry.execute(
  "calculator",
  {
    expression: "2 + 2",
  },
  context
);
```

## API Documentation

See [API Documentation](./docs/api.md) for detailed information.

## License

MIT
