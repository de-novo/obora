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
import { DefaultPolicyEngine } from "@obora/runtime";

const engine = new DefaultPolicyEngine();
engine.loadInline({
  tools: [
    { name: "delete_file", effect: "deny" }
  ]
});

const result = engine.enforce({ type: "tool_call", name: "delete_file", params: {} }, {});
// { type: "deny", reason: "Destructive operations not allowed" }
```

### Audit Trail

```typescript
import { Audit } from "@obora/runtime";

const store = new Audit.InMemoryAuditStore();
await store.record({
  id: "event-1",
  type: "step_start",
  executionId: "exec-1",
  timestamp: new Date(),
  data: { stepName: "plan" }
});

const events = await store.query({ executionId: "exec-1" });
```

### Recovery Engine

```typescript
import { RecoveryEngine } from "@obora/runtime";

const engine = new RecoveryEngine();

const result = await engine.handle(failure, {
  type: "retry",
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 1_000,
  mode: "exponential"
});
```

### Consensus

```typescript
import { evaluateConsensus } from "@obora/runtime";

const result = evaluateConsensus(snapshot, {
  method: "majority",
  summary: "release readiness vote"
});
console.log(result.approved, result.status);
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
import { Plugins } from "@obora/runtime";

const registry = new Plugins.PluginRegistry();
await Plugins.registerBuiltinPlugins(registry);

// Register custom plugin
registry.register({
  name: "my-tool",
  version: "1.0.0",
  type: "tool",
  schema: { type: "object", properties: {} },
  execute: async (params: unknown) => params
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
const runs = await storage.listRuns({ limit: 10 });
```

## License

MIT
