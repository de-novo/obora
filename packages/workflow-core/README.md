# @obora/workflow-core

Provider-agnostic workflow engine for multi-agent orchestration.

## Overview

This package contains the core workflow execution logic without being tied to any specific AI provider (Claude, OpenAI, etc.). It provides:

- Agent loading from `.claude/agents/obora/` directory
- Workflow planning and execution
- Project identification and management
- Database tracking and persistence

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Your Application                      │
│  (CLI, Web UI, API, etc.)                               │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              @obora/workflow-core                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Agent Loader │  │    Engine    │  │   Tracker    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │ AgentProvider interface
                     ▼
┌─────────────────────────────────────────────────────────┐
│          Provider Implementation                        │
│  ClaudeAgentProvider | OpenAIAgentProvider | ...        │
└─────────────────────────────────────────────────────────┘
```

## Key Concepts

### AgentProvider Interface

The `AgentProvider` interface allows you to plug in any AI provider:

```typescript
interface AgentProvider {
  readonly name: string;
  runAgent(
    agent: AgentDefinition,
    task: string,
    cwd: string,
    options?: AgentRunOptions
  ): AsyncIterable<AgentMessage>;
}
```

### Workflow Execution

```typescript
import { executeWorkflow } from "@obora/workflow-core";

const { plan, results } = await executeWorkflow(
  "Implement user authentication",
  process.cwd(),
  myAgentProvider,
  {
    onPlanComplete: (plan) => console.log("Plan:", plan),
    onStepComplete: (step, result) => console.log("Completed:", step.agent),
    tracker: myTracker,
  }
);
```

## Package Contents

### Agent Loading (`agent-loader.ts`)

- `loadAgents(cwd)` - Load all agents from `.claude/agents/obora/`
- `getAgentByName(agents, name)` - Get specific agent
- `formatAgentsForPlanner(agents)` - Format for planner prompt
- `findProjectRoot(cwd)` - Find project root directory

### Workflow Engine (`engine.ts`)

- `executeWorkflow(task, cwd, provider, options)` - Execute complete workflow
- Provider-agnostic execution
- Step-by-step orchestration
- Error handling and tracking

### Tracking (`tracker.ts`)

- `WorkflowTracker` - DB tracking class
- Session management
- Workflow/step tracking
- Real-time agent run tracking

### Project Service (`project-service.ts`)

- `ProjectService` - Project identification and management
- Multi-strategy resolution (config → git → path)
- `.obora/project.yaml` management
- SaaS-ready architecture

### Database (`db-init.ts`)

- `initializeDb()` - Initialize SQLite database
- Schema creation
- Migration support

## Dependencies

- `@obora/database` - Database schema and connection
- `zod` - Schema validation
- `yaml` - YAML parsing (future)

## Provider-Agnostic Design

This package is designed to work with any AI provider. You need to implement the `AgentProvider` interface:

```typescript
class MyAgentProvider implements AgentProvider {
  readonly name = "my-provider";

  async *runAgent(agent, task, cwd, options) {
    // Your implementation
    yield { type: "text", content: "Starting..." };
    yield { type: "result", content: "Done!" };
  }
}
```

## Migration from CLI

Existing `packages/cli/src/orchestrator/` code can use this package by:

1. Implementing `ClaudeAgentProvider` (wraps `@anthropic-ai/claude-agent-sdk`)
2. Replacing direct imports with `@obora/workflow-core`
3. Passing provider instance to `executeWorkflow()`

## Future Extensions

- OpenAI provider implementation
- Custom provider examples
- Parallel step execution
- Advanced error recovery
- Workflow templates
