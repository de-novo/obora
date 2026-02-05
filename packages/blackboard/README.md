# @obora-kit/blackboard

> Blackboard pattern implementation for AI agent coordination

## Installation

```bash
pnpm add @obora-kit/blackboard
```

## Quick Start

```typescript
import {
  Blackboard,
  createSessionId,
  createAgentId,
  AgentStatusEnum
} from '@obora-kit/blackboard';

// Create a new blackboard
const board = new Blackboard({
  sessionId: createSessionId('session-001'),
});

// Register an agent
board.state.registerAgent({
  id: createAgentId('analyst-1'),
  role: 'analyst',
  status: AgentStatusEnum.ACTIVE,
  // ...
});

// Submit an agenda
const agenda = board.decisions.submitAgenda({
  title: 'New Service Launch',
  description: 'Review Q2 service launch plan',
  // ...
});

// Subscribe to events
board.events.subscribe('decision.consensus.reached', (event) => {
  console.log('Decision made:', event.payload.resolution);
});
```

## Features

- **State Management**: Centralized state with version control (optimistic locking)
- **Event Bus**: Pub/Sub with wildcards, filtering, and history
- **Snapshots**: Create, validate, and restore state snapshots
- **Type Safety**: Full TypeScript support with branded types

## Modules

### Types
```typescript
import type { AgentId, BlackboardState } from '@obora-kit/blackboard/types';
```

### Core
```typescript
import { Blackboard, VersionConflictError } from '@obora-kit/blackboard/core';
```

### Events
```typescript
import { EventBus, EventFactory } from '@obora-kit/blackboard/events';
```

### Snapshot
```typescript
import { SnapshotManager } from '@obora-kit/blackboard/snapshot';
```

## Documentation

See [full documentation](../../docs/architecture/blackboard-actor-design.md).

## License

MIT
