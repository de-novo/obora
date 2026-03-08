# Runtime API Reference (`@obora/runtime`) 

## Table of Contents

- [Execution Cell](#execution-cell)
- [Policy Engine](#policy-engine)
- [Audit Trail](#audit-trail)
- [Recovery Engine](#recovery-engine)
- [Consensus](#consensus)
- [Patterns](#patterns)
- [State Binder](#state-binder)
- [Runtime Orchestrator](#runtime-orchestrator)

---

## Execution Cell

An **Execution Cell** is an isolated unit where an agent/tool step executes with bounded context and lifecycle.

Related runtime modules:
- `cell/ExecutionCell.ts`
- `cell/CellManager.ts`
- `cell/ActorPool.ts`

### YAML Example

```yaml
name: cell-demo
steps:
  - name: classify
    agent: classifier
    config:
      model: gpt-4o-mini
  - name: enrich
    tool: web_search
    depends_on: [classify]
```

### Related SDK API

- [`OboraRuntime.run`](./sdk.md#run)
- [`Workflow.create`](./sdk.md#workflow-builder)

---

## Policy Engine

The **Policy Engine** evaluates declarative rules, applies enforcement, and emits deny/violation events.

Related runtime modules:
- `policy/PolicyEngine.ts`
- `policy/DefaultPolicyEngine.ts`
- `policy/DynamicPolicyContext.ts`

### YAML Example

```yaml
version: "1.0"
rules:
  - name: deny-shell
    condition: "tool == 'shell'"
    action: deny
tools:
  web_search:
    allowed: true
  shell:
    allowed: false
```

### Related SDK API

- [`Policy.create`](./sdk.md#policy-builder)
- [`Policy.fromYaml`](./sdk.md#policy-builder)
- [`OboraRuntime` constructor with `policyPath`](./sdk.md#create-constructor)

---

## Audit Trail

The **Audit Trail** records execution events (start/end, tool calls, policy checks, errors), supports filtering, and replay planning.

Related runtime modules:
- `audit/AuditTrail.ts`
- `audit/AuditStore.ts`
- `audit/ReExecutionPlanner.ts`
- `audit/ReExecutionRuntime.ts`

### YAML Example

```yaml
version: "1.0"
audit:
  enabled: true
  sink: file://./audit/events.jsonl
```

### Related SDK API

- [`OboraRuntime.events`](./sdk.md#events)
- [`OboraRuntime.replay`](./sdk.md#re-execution-api)
- [`ReExecutionPlan`](./sdk.md#re-execution-api)

---

## Recovery Engine

The **Recovery Engine** detects failures and applies strategies such as retry, rollback, escalation, and validation-driven repair loops.

Related runtime modules:
- `recovery/RecoveryEngine.ts`
- `recovery/RetryStrategy.ts`
- `recovery/SupervisionTree.ts`

### YAML Example

```yaml
name: recovery-flow
steps:
  - name: fetch
    tool: http_get
  - name: transform
    agent: transformer
    depends_on: [fetch]
    config:
      retry:
        maxAttempts: 3
        backoffMs: 500
```

### Related SDK API

- [`OboraErrorCode.RECOVERY_*`](./sdk.md#error-codes)
- [`runWorkflowTest`](./sdk.md#testing-api) for failure simulation
- [`ValidationResult` / `RepairLoopConfig`](./sdk.md#workflow-builder)

### Validation-Repair Loop Pattern

Runtime back-edge control can be used to implement an engineering repair loop:

```yaml
steps:
  - name: build_or_repair
    agent: builder
    config:
      repair_loop:
        enabled: true
        validation_step: validate
        max_no_progress_iterations: 2

  - name: validate
    agent: validator
    depends_on: [build_or_repair]
    config:
      validation:
        enabled: true
        emit_structured_result: true
      toolLimits:
        run_validation: 1
    on_fail:
      goto: build_or_repair
      max_iterations: 3
      escalate_on_exhaust: fail
```

The validator should emit a structured `ValidationResult` payload. On failure, Obora re-enters the paired repair step with injected repair context and emits audit events such as:

- `workflow.validation_failed`
- `workflow.validation_passed`
- `workflow.repair_started`
- `workflow.repair_completed`
- `workflow.repair_no_progress`

---

## Consensus

**Consensus** coordinates multi-agent decision making with voting rules, thresholds, and escalation policies.

Related runtime modules:
- `consensus/ConsensusGate.ts`
- `consensus/ConsensusRuleEngine.ts`

### YAML Example

```yaml
name: consensus-flow
steps:
  - name: proposal
    agent: proposer
  - name: vote
    pattern: Consensus
    depends_on: [proposal]
    config:
      quorum: 3
      threshold: 0.67
```

### Related SDK API

- [`OboraRuntime.registerPattern`](./sdk.md#oboraruntime)
- [`WorkflowStep.pattern`](./sdk.md#workflow-builder)

---

## Patterns

Built-in high-level orchestration patterns:

1. `Discussion` — turn-based multi-agent discussion.
2. `Consensus` — voting-based outcome selection.
3. `Brainstorm` — divergent idea generation and ranking.
4. `PeerReview` — critique/feedback pass before finalize.
5. `RedBlue` — adversarial challenge-response for robustness.
6. `Pipeline` — strict sequential stage execution.
7. `FanOutFanIn` — parallel branches then aggregation.
8. `Supervisor` — supervisory agent validates/substitutes outputs.

Related runtime modules:
- `patterns/PatternRegistry.ts`
- `patterns/CustomPatternAPI.ts`

### YAML Example

```yaml
name: pattern-demo
steps:
  - name: ideation
    pattern: Brainstorm
    config:
      agents: [researcher, critic, synthesizer]
  - name: review
    pattern: PeerReview
    depends_on: [ideation]
```

### Related SDK API

- [`OboraRuntime.registerPattern`](./sdk.md#oboraruntime)
- [`PatternRegistration`](./sdk.md#key-types)

---

## State Binder

The **State Binder** (blackboard-style state layer) coordinates shared state updates, versioning, and immutable snapshots across steps.

Related runtime modules:
- `state/StateBinder.ts`
- `state/StateManager.ts`
- `state/versioning.ts`

### YAML Example

```yaml
name: stateful-flow
variables:
  topic: "AI governance"
steps:
  - name: collect
    tool: web_search
  - name: summarize
    agent: summarizer
    depends_on: [collect]
```

### Related SDK API

- [`RunOptions.variables`](./sdk.md#run)
- [`RuntimeExecution.outputs`](./sdk.md#key-types)

---

## Runtime Orchestrator

The **Runtime Orchestrator** drives end-to-end workflow execution: scheduling, dependency checks, event emission, and status transitions.

Related runtime modules:
- `orchestrator/RuntimeOrchestrator.ts`
- `orchestrator/StepScheduler.ts`
- `orchestrator/ExecutionContextBuilder.ts`

### YAML Example

```yaml
name: orchestrator-demo
steps:
  - name: first
    tool: fetch_data
  - name: second
    agent: analyzer
    depends_on: [first]
  - name: third
    tool: publish
    depends_on: [second]
```

### Related SDK API

- [`OboraRuntime.define`](./sdk.md#oboraruntime)
- [`OboraRuntime.run`](./sdk.md#run)
- [`RunHandle`](./sdk.md#runhandle)
