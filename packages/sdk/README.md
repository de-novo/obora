# @obora/sdk

Obora SDK — programmatic API for AI Control Runtime.

## Installation

```bash
npm install @obora/sdk
```

## Quick Start

```typescript
import { OboraRuntime, Workflow } from "@obora/sdk";

const runtime = new OboraRuntime({
  llm: {
    provider: "zai",
    model: "glm-4.7",
    apiKey: process.env.ZAI_API_KEY ?? "local-dev-key",
  },
});

// Define and run a workflow
runtime.define("hello", {
  name: "hello",
  version: "1.0",
  steps: [{ name: "greet", agent: "assistant", input: { task: "Say hello" } }],
});

runtime.registerAgent("assistant", () => ({ role: "Assistant" }));

const handle = await runtime.run("hello");
const result = await handle.wait();
```

## Architecture

The SDK is organized into focused modules:

```
@obora/sdk
├── OboraRuntime      # Main entry point (facade)
├── execution/
│   ├── WorkflowRunner   # run() + resume() engine
│   └── AdapterResolver  # LLM adapter caching
├── events/
│   └── EventBus         # Audit event publishing
├── persistence/
│   └── PersistenceManager  # Storage + Artifacts
├── query/
│   └── RunQuery         # runs/steps/costs queries
└── runtime-types.ts     # Type definitions
```

## Key Exports

### Runtime

```typescript
import { OboraRuntime, OboraError, OboraErrorCode } from "@obora/sdk";

const runtime = new OboraRuntime();
const workflow = {
  name: "example",
  version: "1.0",
  steps: [{ name: "greet", agent: "assistant", input: { task: "Say hello" } }],
};

runtime.define("example", workflow);
runtime.registerAgent("assistant", () => ({ role: "Assistant" }));
const handle = await runtime.run("example");
```

### Workflow

```typescript
import { Workflow } from "@obora/sdk";

const workflow = new Workflow("my-workflow", "1.0")
  .addStep({ id: "plan", agent: "architect", input: { task: "Plan the change" } })
  .toDefinition();
```

### Step Execution

```typescript
import { StepExecutor, type ToolHandler } from "@obora/sdk";

const llmAdapter = {
  async chatCompletion() {
    return { message: { role: "assistant" as const, content: "done" } };
  },
};
const agentFactories = new Map();
const executor = new StepExecutor(llmAdapter, agentFactories, {
  tools: [] satisfies ToolHandler[], // Custom tool handlers
  disableBuiltinTools: false, // Keep file_write, file_read, file_list
});

const result = await executor.executeStep(
  { name: "plan", agent: "assistant", input: { task: "Plan" } },
  { previousOutputs: {} }
);
```

### Testing Utilities

```typescript
import { MockAgent, runWorkflowTest, loadFixture } from "@obora/sdk/testing";

const mockAgent = new MockAgent("architect")
  .onStep("plan", async () => ({ output: "Plan created" }))
  .onStep("implement", async () => ({ output: "Code written" }));

const result = await runWorkflowTest({
  name: "happy path",
  workflow: {
    name: "example",
    steps: [{ name: "plan", agent: "architect" }]
  },
  mocks: { agents: [mockAgent] },
  expect: { status: "completed" }
});
```

### Knowledge

```typescript
import { queryKnowledge, validateKnowledgeSchema } from "@obora/sdk";

const results = await queryKnowledge({
  textQuery: "authentication patterns",
  tags: ["security", "auth"],
  limit: 10,
});
```

## Configuration

### LLM Config

```typescript
import { resolveLLMConfig, detectLLMConfigFromEnv } from "@obora/sdk";

// From environment
const envConfig = detectLLMConfigFromEnv();

// Explicit
const explicitConfig = resolveLLMConfig({
  provider: "zai",
  model: "glm-4.7",
  apiKey: process.env.ZAI_API_KEY ?? "local-dev-key",
});
```

### Cost Tracking

```typescript
import { CostTracker, BudgetExceededError } from "@obora/sdk";
import type { StorageAdapter } from "@obora/runtime";

declare const storage: StorageAdapter;

const tracker = new CostTracker(storage, "run-1", {
  resources: { maxCostPerRun: 1.0 }, // $1 budget
});
```

## Error Handling

```typescript
import { OboraRuntime, OboraError, OboraErrorCode } from "@obora/sdk";

try {
  const runtime = new OboraRuntime();
  await runtime.run("workflow");
} catch (e) {
  if (e instanceof OboraError) {
    console.log(e.code); // OboraErrorCode.CELL_TIMEOUT
    console.log(e.message); // Human-readable message
  }
}
```

## Validation-Repair Loop

The SDK supports validator → repair back-edge loops for iterative generation and correction.

```yaml
name: validation-repair-loop
version: "1.0"
steps:
  - name: build_or_repair
    agent: builder
    config:
      repair_loop:
        enabled: true
        validation_step: validate
        max_no_progress_iterations: 2
        repeated_critical_issue_ceiling: 2
    input:
      task: Build or repair the app.

  - name: validate
    agent: validator
    depends_on: [build_or_repair]
    config:
      validation:
        enabled: true
        emit_structured_result: true
    on_fail:
      goto: build_or_repair
      max_iterations: 3
    input:
      task: Validate the app and return structured JSON.
```

When the validator emits a structured `ValidationResult`, the repair step receives a `RepairContext` including:

- latest validation result
- previous validation history
- current repair attempt
- repeated signature count
- no-progress ceiling
- repeated critical issue ceiling

See https://github.com/de-novo/obora/blob/main/docs/tutorials/validation-repair-loop.md for a fuller walkthrough.

Related files:

- https://github.com/de-novo/obora/blob/main/packages/sdk/examples/validation-repair-loop.yaml
- https://github.com/de-novo/obora/blob/main/docs/tutorials/validation-repair-loop-migration.md
- https://github.com/de-novo/obora/blob/main/docs/tutorials/validation-repair-loop-troubleshooting.md

## One-File Workflows

The SDK also supports one-file declarative workflow authoring for selected high-level modes.
Currently available modes:

- `validation-repair`
- `research-loop`
- `proof-loop`

Example:

```yaml
name: fix-app
mode: validation-repair
agents:
  repair: builder
  validator: validator
prompts:
  repair: Repair the artifact.
  validate: Validate and emit structured result.
loop:
  max_iterations: 4
  no_progress_ceiling: 2
  repeated_critical_issue_ceiling: 2
```

Start by validating the one-file YAML itself:

```bash
obora validate my-workflow.yaml
obora validate my-workflow.yaml --json
obora --json validate my-workflow.yaml
```

If you need the internal structure, inspect how a one-file YAML expands internally:

```bash
obora expand my-workflow.yaml --json
obora --json expand my-workflow.yaml
```

For dry-run validation with the same information, prefer the root-global JSON form for advanced preview flags:

```bash
obora --json run my-workflow.yaml --dry-run --dump-expanded-workflow --show-stop-semantics
```

See https://github.com/de-novo/obora/blob/main/docs/tutorials/one-file-workflows.md for mode examples, validation contract, and current limitations.

Current validation includes:

- required field checks
- unknown key detection
- nested key validation
- type mismatch detection
- allowed-key hints in error messages

## License

MIT
