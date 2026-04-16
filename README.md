# Obora

> **AI는 흔들려도 시스템은 흔들리지 않게**

**Obora** is an AI Control Runtime that makes AI-included systems controllable, auditable, and recoverable.

[![npm version](https://img.shields.io/npm/v/@obora/sdk)](https://www.npmjs.com/package/@obora/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## 🚩 Why Obora?

AI outputs are non-deterministic. Production systems are not allowed to be.

Most frameworks optimize for **"making AI easy."**
Obora is built for **"making AI operable."**

Obora provides an operational backbone for AI-included systems:

- **Deterministic orchestration backbone** for stable execution flow
- **Policy enforcement** to control tools, permissions, and boundaries
- **Audit trail** to explain what happened and why
- **Recovery engine** to recover from failures safely
- **Validation-repair loops** to validate outputs, feed failures back into repair steps, and converge safely

---

## ⚡ Quick Start

```bash
# Install CLI
npm install -g @obora/cli

# Create a quickstart project
obora init my-project --quickstart
cd my-project

# Check readiness and missing setup
obora doctor

# Validate the bundled judge workflow file
obora validate judge.yaml

# Preview execution without starting the judge run
obora judge --dry-run

# Run the bundled judge example
obora judge
```

Prerequisites:

- Node.js 20+
- At least one LLM provider API key (ZAI, OpenAI, Anthropic, etc.)

Useful discovery command:

- `obora models <provider> [query]` shows the model refs available from the installed `pi-ai` catalog
  - examples: `obora models openai`, `obora models openai gpt-5.4`, `obora --json models zai glm-4.7`

What this path gives you:

- `obora init --quickstart` creates a minimal judge-mode project
- `obora validate judge.yaml` checks the bundled one-file workflow before execution
- `obora doctor` shows ready/stub/missing-auth status and next actions
- `obora judge --dry-run` previews the input/output contract without starting execution
- `obora judge` writes the JSON result artifact

### Recommended Getting Started Path

If you are new to Obora, follow this order:

1. [3-Minute Quickstart](./docs/tutorials/01-3-minute-quickstart.md)
2. [Judge Quickstart](./docs/tutorials/02-judge-quickstart.md)
3. [Quick Troubleshooting](./docs/tutorials/03-quick-troubleshooting.md)
4. [LLM Config / Auth Quickstart](./docs/tutorials/06-llm-config-auth-quickstart.md)
5. [Contract-First Quickstart](./docs/tutorials/04-contract-first-quickstart.md)
6. [Contract-First Authoring Guide](./docs/tutorials/05-contract-first-authoring-guide.md)
7. [One-File Workflows](./docs/tutorials/one-file-workflows.md)

### Recommended default setup

Use this default rule unless you have a strong reason not to:

- **auth in env**
- **provider/model defaults in project `.obora/config.yaml`**
- **runtime `llm` overrides only for advanced or temporary cases**

### Runnable example

A ready-to-run contract-first example is here:

- [`examples/07-contract-first-evaluation`](./examples/07-contract-first-evaluation)

---

## 🧩 Core Concepts

| Concept                    | Description                                                                    |
| -------------------------- | ------------------------------------------------------------------------------ |
| **Workflow**               | YAML-defined multi-agent execution pipeline                                    |
| **Validation-Repair Loop** | Automated test → fix → re-test cycle with convergence control                  |
| **Conditional Routing**    | Route failures to different steps based on failure type                        |
| **Blackboard**             | Shared state across steps (facts, decisions, failure history)                  |
| **Reflector v2**           | Plugin analyzers + rule engine + action system + cross-execution learning      |
| **Observer**               | Real-time metrics, cost tracking, and execution reports                        |
| **Shell Hooks**            | Deterministic pre/post step commands (build, test, lint)                       |
| **Skills**                 | Domain knowledge injection per step (AgentSkills compatible)                   |
| **Parallel Execution**     | Run independent steps concurrently with merge strategies                       |
| **Peer Review**            | Multi-reviewer parallel scoring with quorum rules                              |
| **Policy Engine**          | Rule-based control for tools, actions, and access                              |
| **Audit Trail**            | Full trace of inputs, decisions, state transitions, outputs                    |
| **Knowledge Store**        | Persistent failure patterns and resolution history across executions           |
| **TKG Projection**         | Temporal Knowledge Graph — staging, promotion, confidence policy, review queue |
| **Dead Letter Queue**      | Isolate unrecoverable failures for manual review                               |
| **Circuit Breaker**        | LLM failure isolation (closed → open → half-open)                              |
| **Execution Lock**         | File-based mutex to prevent concurrent runs                                    |
| **Auto-Recovery**          | Checkpoint-based automatic resume on failure                                   |
| **Health Checker**         | Stuck execution detection with pluggable checks                                |
| **Alert Manager**          | Webhook/console alerting with severity filtering                               |
| **Metrics Export**         | Prometheus text + JSON metrics for observability                               |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         OboraRuntime                              │
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────────────┐   │
│  │  Workflow   │  │   Agent     │  │   Plugin Registry      │   │
│  │  Definition │  │  Registry   │  │  (tools, patterns,     │   │
│  │  (YAML)     │  │             │  │   skills)              │   │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬────────────┘   │
│         │                │                      │                │
│         ▼                ▼                      ▼                │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                    WorkflowRunner                          │   │
│  │  ┌─────────────────────────────────────────────────────┐  │   │
│  │  │ Step Execution  │ Parallel Scheduler │ Shell Hooks  │  │   │
│  │  └────────┬────────┴─────────┬──────────┴──────┬──────┘  │   │
│  │           │                  │                  │          │   │
│  │  ┌────────▼──────────────────▼──────────────────▼──────┐  │   │
│  │  │              Validation + Repair Loop               │  │   │
│  │  │  conditional routing · global ceiling · reflector   │  │   │
│  │  └────────────────────────┬────────────────────────────┘  │   │
│  └───────────────────────────┼───────────────────────────────┘   │
│                              │                                    │
│    ┌─────────────┬───────────┼───────────┬─────────────┐         │
│    ▼             ▼           ▼           ▼             ▼         │
│ ┌────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐   │
│ │Blackboard│ │Reflector│ │Observer│ │ Policy  │ │  Audit   │   │
│ │(shared  │ │  v2     │ │(metrics│ │ Engine  │ │  Trail   │   │
│ │ state)  │ │(analyze │ │ cost   │ │         │ │          │   │
│ │         │ │ actions │ │ report)│ │         │ │          │   │
│ │         │ │ learn)  │ │        │ │         │ │          │   │
│ └────────┘ └──────────┘ └────────┘ └─────────┘ └──────────┘   │
│                  │                                               │
│           ┌──────▼──────┐                                        │
│           │ Knowledge   │                                        │
│           │ Store       │  ← persistent across executions        │
│           └─────────────┘                                        │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📦 Packages

| Package                                    | Description                               |
| ------------------------------------------ | ----------------------------------------- |
| [`@obora/sdk`](./packages/sdk)             | Programmatic API for building workflows   |
| [`@obora/runtime`](./packages/runtime)     | Core execution engine, policies, audit    |
| [`@obora/cli`](./packages/cli)             | Command-line interface                    |
| [`@obora/adapters`](./packages/adapters)   | LLM provider adapters (ZAI, OpenAI, etc.) |
| [`@obora/dashboard`](./packages/dashboard) | Web UI for monitoring                     |

---

## 🔧 SDK Example

### Contract-First Workflow Example

```typescript
import { OboraRuntime } from "@obora/sdk";

const runtime = new OboraRuntime({
  llm: {
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY!,
    model: "gpt-4o-mini",
  },
});

runtime.define("contract-first-evaluation", {
  name: "contract-first-evaluation",
  version: "1.0",
  steps: [
    {
      name: "evaluate_submission",
      agent: "evaluator",
      input: {
        bindings: {
          submission: { path: "artifacts/submission.json", kind: "json" },
          rubric: { path: "artifacts/rubric.json", kind: "json" },
        },
        task: "Evaluate {{submission}} using {{rubric}}. Return JSON only.",
      },
      output: {
        path: "artifacts/result.json",
        schema: "artifacts/result.schema.json",
      },
    },
  ],
});

const handle = await runtime.run("contract-first-evaluation");
const result = await handle.wait();

console.log(result.outputs);
```

### Why this style is recommended

This authoring style makes workflows easier to operate because:

- inputs are declared explicitly with `input.bindings`
- outputs are declared explicitly with `output.path` / `output.schema`
- startup summary can preview both sides of the contract
- structured outputs can be persisted automatically

### One-File Judge Short Path

If you want the shortest JSON-in / JSON-out path for a single evaluation, use one-file judge mode. `obora run <file> --dry-run` now previews the same input/output paths from the expanded judge config in both text and JSON output:

```yaml
name: one-file-judge
mode: judge

provider: openai
model: gpt-4o-mini
prompt: |
  Evaluate the submission and return JSON only.

input:
  json: artifacts/submission.json
  schema: artifacts/submission.schema.json

output:
  path: artifacts/result.json
  schema: artifacts/result.schema.json
```

See also:

- [One-File Workflows](./docs/tutorials/one-file-workflows.md)
- [Contract-First Quickstart](./docs/tutorials/04-contract-first-quickstart.md)

### Harness Engineering Example

Obora is a **harness engineering platform** — it wraps AI agents in structured workflows with validation, repair loops, and self-reflection.

```yaml
name: overnight-builder
version: "4.0"

# Reflector v2 — automatic failure analysis with pluggable rules
reflector:
  knowledge_store: .obora/knowledge/
  rules:
    - name: worsening_trend
      when:
        trend: worsening
        min_failures: 3
      actions:
        - type: force_target
          target: design_and_write_tests
        - type: inject_context
          content: "Failures are getting worse. Redesign the approach."

    - name: same_error_repeating
      when:
        signature_repeated: 3
      actions:
        - type: inject_context
          content: "Same error 3 times. Try a completely different approach."

    - name: cost_limit
      when:
        min_attempt: 12
      actions:
        - type: abort
          reason: "Exceeded 12 repair attempts."

# Shell hooks — deterministic validation before LLM judgment
hooks:
  pre_step:
    shell: "mkdir -p artifacts workspace"

steps:
  - name: plan
    agent: planner
    skills: [cycle-planning]

  - name: design_tests
    agent: architect
    skills: [quality-guidelines, tdd-test-design]
    depends_on: [plan]

  - name: implement
    agent: implementer
    skills: [quality-guidelines]
    depends_on: [design_tests]
    config:
      repair_loop:
        enabled: true
        validation_step: validate
        max_no_progress_iterations: 6
        max_total_repair_attempts: 15

  - name: validate
    agent: validator
    skills: [structured-validation]
    hooks:
      pre_validation:
        shell: "cd workspace && npm run build && npm test"
    config:
      validation:
        enabled: true
        emit_structured_result: true
    on_fail:
      goto:
        # Conditional routing — route failures to the right step
        - when: 'failedChecks.some(c => c.name.includes("test_code_bug"))'
          target: design_tests
        - when: 'failedChecks.some(c => c.name.includes("design_issue"))'
          target: plan
        - target: implement

  - name: review
    agent: reviewer
    skills: [production-review]
    pattern: peer-review
    participants: [reviewer_a, reviewer_b]
    config:
      min_score: 70
      quorum: 2
```

### What Happens at Runtime

```
1. Plan → Design Tests → Implement → Validate
2. Validate FAILS → Shell hook runs real build/test
3. Conditional routing: test_code_bug → back to Design Tests
4. Repair loop: implement again → validate again
5. Reflector v2 analyzes failures:
   - "backup" keyword in 3/3 failures → inject specific hint
   - Worsening trend detected → force route to architect
   - Knowledge Store: "ESLint crash → skip lint" (learned from last run)
6. After max attempts → abort (cost control)
7. Validate PASSES → Peer Review (parallel, scored)
8. Knowledge Store saves patterns for next execution
```

### Reflector v2 — Self-Improving Repair

The Reflector is not just a hint generator. It's a pluggable analysis + action engine:

```
Analyzer Pipeline (pluggable)
  → KeywordAnalyzer: "backup" appears in 3/3 failures
  → TrendAnalyzer: failure count 5 → 9 → 13 (WORSENING)
  → SignatureAnalyzer: "implementation_bug:3" repeated
  → CategoryAnalyzer: implementation_bug (9x)
          ↓
Rule Engine (YAML-configurable)
  → when: keywords_include [backup] + trend: worsening
  → actions: force_target + inject_context
          ↓
Action Registry (pluggable)
  → force_target: move cursor to design_tests step
  → inject_context: add repair guidance to LLM prompt
          ↓
Knowledge Store (persistent)
  → save: "backup timing issue → redesign from scratch"
  → next run: auto-apply learned resolution
```

### Validation-Repair Loop

```yaml
steps:
  - name: build_or_repair
    agent: builder
    config:
      repair_loop:
        enabled: true
        validation_step: validate
        max_no_progress_iterations: 6
        repeated_critical_issue_ceiling: 6
        max_total_repair_attempts: 15

  - name: validate
    agent: validator
    config:
      validation:
        enabled: true
        emit_structured_result: true
    on_fail:
      goto: build_or_repair
```

Reference example: [`experiments/overnight-builder`](./experiments/overnight-builder)

Feature summary: [`docs/validation-repair-loop-update.md`](./docs/validation-repair-loop-update.md)

---

## 🧪 Testing

```bash
# Unit tests (no API key required)
pnpm test

# E2E tests with real LLM (requires ZAI_API_KEY)
ZAI_API_KEY=xxx pnpm test:e2e
```

---

## 📚 Documentation

- [Examples](./examples) - Sample workflows and use cases
- [API Reference](./docs/api/README.md) - Detailed API docs
- [CLI Reference](./docs/cli/README.md) - Command documentation
- [Enterprise Reliability](./docs/operations/enterprise-reliability.md) - DLQ, Circuit Breaker, Auto-Recovery, Metrics, etc.

---

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## 📄 License

MIT — see [LICENSE](./LICENSE).
