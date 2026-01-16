# @obora/agent-claude

Claude SDK implementation of the AgentProvider interface.

## Overview

This package provides `ClaudeAgentProvider`, which implements the `AgentProvider` interface from `@obora/workflow-core` using the `@anthropic-ai/claude-agent-sdk`.

## Installation

```bash
npm install @obora/agent-claude
```

## Usage

### Basic Usage

```typescript
import { ClaudeAgentProvider } from "@obora/agent-claude";
import { executeWorkflow } from "@obora/workflow-core";

const provider = new ClaudeAgentProvider({
  maxTurns: 10,
  settingSources: ["project"],
});

const { plan, results } = await executeWorkflow(
  "Implement user authentication",
  process.cwd(),
  provider,
  {
    onPlanComplete: (plan) => console.log("Plan:", plan),
    onStepComplete: (step, result) => console.log("Completed:", step.agent),
  }
);
```

### Simple Query (without workflow)

```typescript
import { simpleQuery } from "@obora/agent-claude";

const output = await simpleQuery(
  "Analyze the codebase structure",
  process.cwd(),
  ["Read", "Glob", "Grep"],
  (message) => console.log("Message:", message)
);

console.log("Result:", output);
```

## API

### `ClaudeAgentProvider`

Implements the `AgentProvider` interface using Claude SDK.

#### Constructor Options

```typescript
interface ClaudeProviderOptions {
  /** Maximum number of turns (default: 10) */
  maxTurns?: number;
  /** Setting sources (default: ["project"]) */
  settingSources?: string[];
}
```

#### Methods

##### `runAgent(agent, task, cwd, options)`

Executes an agent with the given task.

- **Parameters:**
  - `agent: AgentDefinition` - Agent definition
  - `task: string` - Task to execute
  - `cwd: string` - Working directory
  - `options?: AgentRunOptions` - Additional options
- **Returns:** `AsyncIterable<AgentMessage>` - Stream of agent messages

### `simpleQuery(prompt, cwd, allowedTools?, onMessage?)`

Simple query without workflow orchestration.

- **Parameters:**
  - `prompt: string` - Prompt to execute
  - `cwd: string` - Working directory
  - `allowedTools?: string[]` - Allowed tools (default: `["Read", "Glob", "Grep", "Bash"]`)
  - `onMessage?: (message: unknown) => void` - Message callback
- **Returns:** `Promise<string>` - Final output

## Message Types

The provider yields the following message types:

- `text` - Text content from assistant
- `tool_use` - Tool invocation
- `tool_result` - Tool execution result
- `result` - Final result with token usage
- `error` - Error message

## Token Tracking

Token usage is automatically tracked and included in the final `result` message:

```typescript
{
  type: "result",
  content: "...",
  metadata: {
    tokens: {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500
    }
  }
}
```

Token counts include:
- `input_tokens`
- `output_tokens`
- `cache_creation_input_tokens`
- `cache_read_input_tokens`

## Dependencies

- `@anthropic-ai/claude-agent-sdk` - Claude SDK
- `@obora/workflow-core` - Core workflow types and interfaces
