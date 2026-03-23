# SDK API Reference (`@obora/sdk`)

## Table of Contents

- [Overview](#overview)
- [OboraRuntime](#oboraruntime)
  - [create (constructor)](#create-constructor)
  - [run](#run)
  - [cancel (via RunHandle)](#cancel-via-runhandle)
  - [events](#events)
  - [registerPlugin](#registerplugin)
  - [define](#define)
  - [registerPattern](#registerpattern)
- [Workflow Builder](#workflow-builder)
- [Policy Builder](#policy-builder)
- [Agent Builder](#agent-builder)
- [RunHandle](#runhandle)
- [Plugin System](#plugin-system)
- [Testing API](#testing-api)
- [Re-execution API](#re-execution-api)
- [Error Codes](#error-codes)
- [Key Types](#key-types)

---

## Overview

This document covers the current public SDK surface exported from `packages/sdk/src/index.ts`.

```ts
import {
  Agent,
  Policy,
  Workflow,
  OboraRuntime,
  PluginLoader,
  PluginRegistry,
  PluginManager,
  MockAgent,
  MockTool,
  runWorkflowTest,
  validateFixture,
  loadFixture,
} from "@obora/sdk";
```

---

## OboraRuntime

### create (constructor)

```ts
new OboraRuntime(config?: OboraRuntimeConfig)
```

Creates an SDK runtime facade.

- `policyPath?: string` — optional path to YAML policy loaded at startup.
- `audit?: { enabled?: boolean; sink?: (event) => void | Promise<void> }` — audit event sink.
- `llm?: LLMConfig` — explicit provider/model/api key configuration.
- `agentsPath?: string` — optional YAML file for agent role/description definitions.
- `stepTools?: ToolHandler[]` — custom step tools injected into `StepExecutor` for runtime workflows.

```ts
const runtime = new OboraRuntime({
  policyPath: "./policies/default.yaml",
  audit: {
    enabled: true,
    sink: async (event) => {
      console.log(event.type, event.executionId);
    },
  },
});
```

### run

```ts
run(name: string, options?: RunOptions): Promise<RunHandle>
```

Runs a defined workflow and returns a `RunHandle`.

```ts
runtime.define("example", {
  name: "example",
  steps: [{ name: "step1" }],
});

const handle = await runtime.run("example", {
  input: { message: "hello" },
  variables: { env: "dev" },
});

const execution = await handle.wait();
console.log(execution.status); // "completed"
```

### persisted run queries

`OboraRuntime` also exposes persisted run query helpers when persistence is enabled.

```ts
const run = await runtime.getRunRecord(runId);
const steps = await runtime.getRunSteps(runId);
const artifacts = await runtime.getRunArtifacts(runId);
const auditTimeline = await runtime.getRunAuditTimeline(runId);
```

The richer namespace aliases are also available:

```ts
const run = await runtime.runs.get(runId);
const steps = await runtime.runs.steps(runId);
const cost = await runtime.runs.cost(runId);
const audit = await runtime.runs.auditReplay(runId);
```

#### `run.metadata.repairLoop`

For validation-repair workflows, persisted runs may include a precomputed summary at:

```ts
const run = await runtime.getRunRecord(runId);
const repairLoop = run?.metadata?.repairLoop;
```

This summary is intended for cheap inspection surfaces such as:
- CLI inspect views
- dashboards
- post-run analysis scripts
- automated reporting

A representative shape is:

```ts
interface PersistedRepairLoopSummary {
  validationFailed: number;
  validationPassed: number;
  repairStarted: number;
  repairCompleted: number;
  repairNoProgress: number;
  backEdgeTriggered: number;
  backEdgeExhausted: number;
  lastValidationSummary?: string;
  lastValidationStep?: string;
  lastRepairStep?: string;
  lastAttempt?: number;
  lastNoProgressReason?: string;
  lastExhaustReason?: string;
  recentValidationFailures: Array<{
    stepName?: string;
    summary?: string;
    errorCode?: string;
    logPath?: string;
    failedChecks: Array<{
      name?: string;
      message?: string;
      severity?: string;
      file?: string;
    }>;
  }>;
}
```

If `metadata.repairLoop` is absent, consumers can fall back to `runtime.getRunAuditTimeline(runId)` / `runtime.runs.auditReplay(runId)` and reconstruct the summary from raw events.

### TKG manual operation helpers

When `sharedMemory` + `tkgProjection` are enabled for a workflow, `OboraRuntime` also exposes manual operation helpers for the review/rollback loop.

#### list open review queue items

```ts
const items = await runtime.listOpenTKGReviewQueueItems("my-workflow");
```

Returns open `TKGReviewQueueItem[]` for the workflow's resolved TKG projection scope.

#### resolve a review queue item

```ts
await runtime.resolveTKGReviewQueueItem("my-workflow", itemId, {
  status: "approved",
  actor: "cto",
  note: "latest validated state is safe to promote",
});
```

Or reject:

```ts
await runtime.resolveTKGReviewQueueItem("my-workflow", itemId, {
  status: "rejected",
  actor: "cto",
  note: "stale contradiction from older run",
});
```

Returns a `TKGReviewQueueResolutionSummary`.

#### re-apply approved review queue items

```ts
const summary = await runtime.reapplyApprovedTKGReviewQueueItems("my-workflow", {
  sourceExecutionId: "manual-review-2026-03-23",
});
```

Returns a `TKGApprovedReviewQueueApplySummary`.
Current behavior:
- dedupes by fact / decision id on re-apply
- records approved resolution audit into `sharedMemory.decisions.history`

#### restore latest or specific rollback snapshot

```ts
await runtime.restoreLatestTKGRollback("my-workflow");
```

```ts
await runtime.restoreLatestTKGRollback("my-workflow", {
  rollbackId: "rollback-123",
});
```

Returns a `TKGRollbackRestoreSummary`.
Current behavior:
- restores by overwriting the target shared-memory scope with the stored snapshot
- if `rollbackId` is omitted, the latest rollback entry is used

### Artifact diagnosis endpoints

When using the dashboard history surface, related artifact access is available through:

- preview: `GET /api/history/runs/:runId/artifacts/:artifactId/preview`
- raw: `GET /api/history/runs/:runId/artifacts/:artifactId/raw`
- download: `GET /api/history/runs/:runId/artifacts/:artifactId/raw?download=1`

See:
- [`./history-api.md`](./history-api.md) for the formal endpoint reference
- [`../artifact-api-update.md`](../artifact-api-update.md) for the higher-level feature summary

### cancel (via RunHandle)

```ts
handle.cancel(reason?: string): Promise<void>
```

Cancels an in-flight execution.

```ts
const handle = await runtime.run("example");
await handle.cancel("User requested cancellation");
```

### events

```ts
events(filter?: {
  executionId?: string;
  type?: AuditEventType | AuditEventType[];
}): AsyncIterableIterator<AuditEvent>
```

Streams runtime audit events.

```ts
const stream = runtime.events({ type: ["execution_start", "execution_end"] });

for await (const event of stream) {
  console.log(event.type, event.timestamp);
  if (event.type === "execution_end") break;
}
```

### registerPlugin

```ts
registerPlugin(plugin: LoadedPlugin, options?: RegisterOptions): this
```

Registers a loaded plugin into the runtime plugin registry.

```ts
const manager = new PluginManager({ cwd: process.cwd() });
const loaded = await manager.discoverAndRegister();

for (const plugin of loaded) {
  runtime.registerPlugin(plugin);
}
```

### define

```ts
define(name: string, workflow: WorkflowDef): void
```

Registers a workflow definition that can later be executed by `run(name, options)`.

### registerPattern

```ts
registerPattern(name: string, handler: PatternHandler): void
```

Registers a reusable step pattern handler referenced by workflow `pattern` fields.

---

## Workflow Builder

> Current SDK exposes `Workflow.create()`/`Workflow.fromYaml()` (not a dedicated `WorkflowBuilder` class).

### Signature

```ts
Workflow.create(input: unknown): WorkflowDef
Workflow.fromYaml(path: string): Promise<WorkflowDef>
```

### Validation / Repair Config

`WorkflowStep.config` now supports runtime-oriented repair-loop controls:

```yaml
steps:
  - name: build_or_repair
    agent: builder
    config:
      repair_loop:
        enabled: true
        validation_step: validate
        max_no_progress_iterations: 2
      toolLimits:
        run_validation: 3
        fetch_url: 10

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

#### Supported config keys

- `config.validation.enabled` — mark the step output as a validation result candidate.
- `config.validation.emit_structured_result` — require the step to return valid `ValidationResult` JSON.
- `config.repair_loop.enabled` — mark a step as repair-aware; Obora injects repair context on re-entry.
- `config.repair_loop.validation_step` — logical validator step paired with the repair step.
- `config.repair_loop.max_no_progress_iterations` — stop when the same validation signature repeats too many times.
- `config.toolLimits` — per-tool call limits for expensive tools; tools not listed are unlimited.
- `config.maxToolRounds` — optional total LLM↔tool exchange ceiling for the step.

### Example

```ts
const workflow = Workflow.create({
  name: "pipeline",
  version: "1.0",
  steps: [
    { name: "draft", agent: "writer" },
    { name: "review", agent: "reviewer", depends_on: ["draft"] },
  ],
});

runtime.define(workflow.name, workflow);
```

---

## Policy Builder

> Current SDK exposes `Policy.create()`/`Policy.fromYaml()` (not a dedicated `PolicyBuilder` class).

### Signature

```ts
Policy.create(input: unknown): PolicyDefinition
Policy.fromYaml(path: string): Promise<PolicyDefinition>
```

### Example

```ts
const policy = Policy.create({
  version: "1",
  rules: [{ name: "deny-dangerous", condition: "tool == 'shell'", action: "deny" }],
  tools: {
    web_search: { allowed: true },
    shell: { allowed: false },
  },
});
```

---

## Agent Builder

> Current SDK provides `Agent` base class (not a dedicated `AgentBuilder` class).

### Signature

```ts
abstract class Agent {
  abstract readonly name: string;
  abstract execute(ctx: AgentContext): Promise<AgentResult>;
}
```

### Example

```ts
class SummarizerAgent extends Agent {
  readonly name = "summarizer";

  async execute(ctx: AgentContext): Promise<AgentResult> {
    return {
      output: { summary: `Input: ${JSON.stringify(ctx.input)}` },
      metadata: { model: "gpt-4o-mini" },
    };
  }
}
```

---

## RunHandle

### Signature

```ts
interface RunHandle {
  executionId: string;
  readonly status: RunStatus;
  wait(): Promise<RuntimeExecution>;
  cancel(reason?: string): Promise<void>;
}
```

- `status` — `queued | running | waiting | completed | failed | aborted`
- `events()` — provided on `OboraRuntime`, not on `RunHandle`
- `result` — obtained through `await handle.wait()`

```ts
const handle = await runtime.run("example");
console.log(handle.status);

const result = await handle.wait();
console.log(result.workflowName, result.status);
```

---

## Plugin System

### PluginLoader

```ts
new PluginLoader(options?: PluginLoaderOptions)
scan(): Promise<PluginDescriptor[]>
load(descriptor: PluginDescriptor): Promise<LoadedPlugin>
scanAndLoad(): Promise<LoadedPlugin[]>
```

### PluginRegistry

```ts
new PluginRegistry(options?: PluginRegistryOptions)
register(plugin: LoadedPlugin, options?: RegisterOptions): void
unregister(type: PluginType, name: string): boolean
get(type: PluginType, name: string): LoadedPlugin | undefined
getAll(type?: PluginType): LoadedPlugin[]
has(type: PluginType, name: string): boolean
clear(): void
```

### PluginManager

```ts
new PluginManager(options?: PluginManagerOptions)
discoverAndRegister(registerOptions?: RegisterOptions): Promise<LoadedPlugin[]>
loadAndRegister(descriptor: PluginDescriptor, registerOptions?: RegisterOptions): Promise<LoadedPlugin>
getByType(typeOrAlias: string): LoadedPlugin[]
getPlugin(typeOrAlias: string, name: string): LoadedPlugin | undefined
unregister(typeOrAlias: string, name: string): boolean
```

### `OboraPlugin` Interface (SDK-level minimal shape)

```ts
interface OboraPlugin {
  name: string;
  version: string;
  type: string;
}
```

---

## Testing API

### MockAgent

```ts
new MockAgent(name: string, defaultHandler?: StepHandler)
onStep(stepName: string, handler: StepHandler): this
execute(ctx: AgentContext): Promise<AgentResult>
get calls(): ReadonlyArray<{ stepName: string; ctx: AgentContext }>
calledWith(stepName: string): boolean
callCount(stepName?: string): number
reset(): void
```

### MockTool

```ts
new MockTool(name: string, executor: ToolExecutor)
execute(params: unknown, ctx: ToolContext): Promise<unknown>
get calls(): ReadonlyArray<{ params: unknown; ctx: ToolContext }>
calledWith(params: unknown): boolean
callCount(): number
reset(): void
```

### runWorkflowTest

```ts
runWorkflowTest(caseDef: WorkflowTestCase): Promise<TestResult>
```

### Fixtures

```ts
loadFixture(path: string): Promise<YamlFixture>
loadFixtures(dirPath: string): Promise<YamlFixture[]>
validateFixture(data: unknown): YamlFixture
fixtureToTestCase(fixture: YamlFixture): WorkflowTestCase
```

### Example

```ts
const fixture = await loadFixture("./tests/happy-path.yaml");
const testCase = fixtureToTestCase(fixture);
const result = await runWorkflowTest(testCase);

if (!result.passed) {
  console.error(result.failures);
}
```

---

## Re-execution API

### Signatures

```ts
replay(executionId: string, options?: Partial<ReExecutionOptions>): Promise<ReExecutionResult>
```

Key types:

- `ReExecutionPlan`
- `ReExecutionResult`
- `ReExecutionDiffReport`
- `NonDeterminismWarning`

### Example

```ts
const replay = await runtime.replay("exec-123", {
  mode: "from_checkpoint",
  startFromStep: "review",
  detectNonDeterminism: true,
  dryRun: true,
});

console.log(replay.plan.stepsToRerun);
console.log(replay.diffReport.summary);
```

### Structured Audit Replay (M6)

```ts
const run = await runtime.getRun("run-123");
const timeline = await run?.auditReplay();
const reviewOnly = await run?.auditReplay("review");
```

For low-level access you can also call:

```ts
await runtime.getRunAuditTimeline("run-123", "review");
await runtime.runs.auditReplay("run-123", "review");
```

---

## Error Codes

### SDK_8001 ~ SDK_8007

- `SDK_8001` `SDK_WORKFLOW_NOT_FOUND`
- `SDK_8002` `SDK_EXECUTION_CANCELLED`
- `SDK_8003` `SDK_NOT_IMPLEMENTED`
- `SDK_8004` `SDK_INVALID_POLICY`
- `SDK_8005` `SDK_INVALID_WORKFLOW`
- `SDK_8006` `SDK_UNKNOWN_ERROR`
- `SDK_8007` `SDK_EXECUTION_NOT_FOUND`

### SDK_9001 ~ SDK_9004

- `SDK_9001` `SDK_INVALID_PLUGIN`
- `SDK_9002` `SDK_PLUGIN_LOAD_FAILED`
- `SDK_9003` `SDK_PLUGIN_CONFLICT`
- `SDK_9004` `SDK_FIXTURE_INVALID`

---

## Key Types

- `OboraRuntimeConfig` — runtime configuration (policy, audit, llm, agentsPath, stepTools).
- `RunOptions` — runtime run input/variables/abort signal.
- `RuntimeExecution` — normalized execution summary.
- `AuditEvent`, `AuditEventType` — runtime event stream objects.
- `WorkflowDef`, `WorkflowStep` — workflow schema.
- `ValidationResult`, `RepairContext`, `ValidationStepConfig`, `RepairLoopConfig` — validation/repair loop contracts.
- `PolicyDefinition` — policy schema.
- `PluginMetadata`, `PluginDescriptor`, `LoadedPlugin`, `PluginType` — plugin system.
- `WorkflowTestCase`, `TestResult`, `TestFailure`, `YamlFixture` — testing contract.
- `ReExecutionOptions`, `ReExecutionPlan`, `ReExecutionResult`, `ReExecutionDiffReport`, `StepDiff`, `NonDeterminismWarning` — replay/re-execution contract.
