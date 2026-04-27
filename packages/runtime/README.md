# @obora/runtime

AI Control Runtime — deterministic orchestration for non-deterministic AI.

## Installation

```bash
npm install @obora/runtime
```

## Overview

The runtime package provides:

- **Execution Cells** — Isolated AI execution boundaries
- **Policy Engine** — Rule-based control for tools and actions
- **Audit Trail** — Full event trace for compliance
- **Recovery Engine** — Failure handling strategies
- **Consensus System** — Multi-agent agreement gates
- **Plugin System** — Extensible architecture

## Architecture

```
@obora/runtime
├── cell/              # Execution cells (actor-based)
│   ├── ExecutionCell
│   ├── CellManager
│   └── AgentPool
├── policy/            # Policy engine
│   ├── PolicyEngine
│   ├── PolicyEvaluator
│   └── expressions/
├── audit/             # Audit trail
│   ├── InMemoryAuditStore
│   ├── AuditTrail
│   └── events/
├── recovery/          # Recovery engine
│   ├── RecoveryEngine
│   ├── RetryStrategy
│   └── SupervisionTree
├── consensus/         # Consensus system
│   ├── ConsensusRuleEngine
│   ├── VotingSessionStore
│   └── AgendaStore
├── patterns/          # Built-in patterns
│   ├── PipelinePattern
│   ├── ConsensusPattern
│   ├── PeerReviewPattern
│   ├── SupervisorPattern
│   └── ...
├── state/             # State management
│   ├── snapshot/
│   └── types/
└── plugins/           # Plugin system
    ├── PluginRegistry
    ├── PluginLoader
    └── builtins
```

## Key Exports

### Policy Engine

```typescript
import { PolicyEngine, PolicyEvaluator } from "@obora/runtime";

const engine = new PolicyEngine();
engine.register({
  name: "no-destructive-ops",
  condition: "tool.name matches 'delete*'",
  effect: "deny",
  message: "Destructive operations not allowed"
});

const result = engine.evaluate({ tool: { name: "delete_file" } });
// { allowed: false, reason: "Destructive operations not allowed" }
```

### Audit Trail

```typescript
import { InMemoryAuditStore } from "@obora/runtime";

const store = new InMemoryAuditStore();
await store.record({
  type: "step_start",
  executionId: "exec-1",
  stepName: "plan",
  timestamp: new Date()
});

const events = await store.query({ executionId: "exec-1" });
```

### Recovery Engine

```typescript
import { RecoveryEngine, RetryStrategy } from "@obora/runtime";

const engine = new RecoveryEngine({
  strategies: [
    new RetryStrategy({ maxRetries: 3, backoff: "exponential" })
  ]
});

const result = await engine.executeWithRecovery(async () => {
  // risky operation
});
```

### Consensus

```typescript
import { ConsensusRuleEngine, VotingSessionStore } from "@obora/runtime";

const engine = new ConsensusRuleEngine();
const result = await engine.evaluate({
  votes: [
    { participant: "r1", vote: "APPROVE" },
    { participant: "r2", vote: "APPROVE" },
    { participant: "r3", vote: "REJECT" }
  ],
  rule: "majority"
});
// { approved: true, ratio: 0.67 }
```

### Patterns

```typescript
import {
  PipelinePattern,
  ConsensusPattern,
  PeerReviewPattern,
  SupervisorPattern,
  FanOutFanInPattern
} from "@obora/runtime";
```

### Plugin System

```typescript
import { PluginRegistry, registerBuiltinPlugins } from "@obora/runtime";

const registry = new PluginRegistry();
await registerBuiltinPlugins(registry);

// Register custom plugin
registry.register({
  name: "my-tool",
  version: "1.0.0",
  type: "tool",
  schema: { ... },
  execute: async (params) => { ... }
});
```

## Plugin Types

| Type | Interface | Description |
|------|-----------|-------------|
| `agent` | `AgentPlugin` | Custom agent implementations |
| `tool` | `ToolPlugin` | External tool integrations |
| `pattern` | `PatternPlugin` | Workflow patterns |
| `policy-rule` | `PolicyRulePlugin` | Custom policy rules |
| `recovery-strategy` | `RecoveryStrategyPlugin` | Failure recovery |
| `consensus-rule` | `ConsensusRulePlugin` | Consensus rules |
| `audit-store` | `AuditStorePlugin` | Audit persistence |
| `state-transform` | `StateTransformPlugin` | State transformations |

## Storage

```typescript
import { SQLiteStorageAdapter } from "@obora/runtime/storage";

const storage = new SQLiteStorageAdapter({ path: "./data.db" });
await storage.initialize();
```

## License

MIT
