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

# Initialize a new project
obora init my-project
cd my-project

# Run a workflow
obora run workflow.yaml
```

Prerequisites:
- Node.js 18+
- At least one LLM provider API key (ZAI, OpenAI, Anthropic, etc.)

---

## 🧩 Core Concepts

| Concept | Description |
|---------|-------------|
| **Execution Cell** | Isolated runtime boundary where AI executes |
| **Policy Engine** | Rule-based control for tools, actions, and access |
| **Audit Trail** | Full trace of inputs, decisions, state transitions, outputs |
| **Recovery Engine** | Retry / rollback / escalate strategies for failures |
| **Consensus** | Multi-agent agreement gates for critical decisions |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        OboraRuntime                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Workflow   │  │   Agent     │  │   Plugin Registry   │  │
│  │  Definition │  │  Registry   │  │  (tools, patterns)  │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │            │
│         ▼                ▼                     ▼            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  WorkflowRunner                       │   │
│  │   (run / resume / step execution / knowledge inject) │   │
│  └──────────────────────────┬───────────────────────────┘   │
│                             │                               │
│         ┌───────────────────┼───────────────────┐           │
│         ▼                   ▼                   ▼           │
│  ┌────────────┐      ┌────────────┐      ┌────────────┐    │
│  │   Policy   │      │   Audit    │      │  Recovery  │    │
│  │   Engine   │      │   Trail    │      │   Engine   │    │
│  └────────────┘      └────────────┘      └────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Packages

| Package | Description |
|---------|-------------|
| [`@obora/sdk`](./packages/sdk) | Programmatic API for building workflows |
| [`@obora/runtime`](./packages/runtime) | Core execution engine, policies, audit |
| [`@obora/cli`](./packages/cli) | Command-line interface |
| [`@obora/adapters`](./packages/adapters) | LLM provider adapters (ZAI, OpenAI, etc.) |
| [`@obora/dashboard`](./packages/dashboard) | Web UI for monitoring |

---

## 🔧 SDK Example

```typescript
import { OboraRuntime, Workflow } from "@obora/sdk";

const runtime = new OboraRuntime({
  llm: { provider: "zai", model: "glm-4.7" }
});

// Define a workflow
runtime.define("my-workflow", {
  name: "my-workflow",
  version: "1.0",
  steps: [
    { name: "plan", agent: "architect", input: { task: "Design the API" } },
    { name: "implement", agent: "coder", depends_on: ["plan"] },
    { name: "review", agent: "reviewer", depends_on: ["implement"], pattern: "peer-review" }
  ]
});

// Register agents
runtime.registerAgent("architect", () => ({ role: "Software Architect" }));
runtime.registerAgent("coder", () => ({ role: "Software Developer" }));
runtime.registerAgent("reviewer", () => ({ role: "Code Reviewer" }));

// Execute
const handle = await runtime.run("my-workflow");
const result = await handle.wait();

console.log(result.outputs);
```

### Validation-Repair Loop Example

Obora can also run a structured validation → repair → re-validation loop inside the runtime.

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

Use `toolLimits` for expensive or external tools (API calls, validators, network fetches). Built-in file tools (`file_read`, `file_write`, `file_list`) can remain effectively unlimited for large generation steps.

Reference example: [`.sandbox/12-reddit-clone-modern-repair-loop`](./.sandbox/12-reddit-clone-modern-repair-loop)

Persisted runs may also include a precomputed `run.metadata.repairLoop` summary for cheap post-run inspection surfaces such as `obora inspect`, dashboards, and analysis scripts.

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

---

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## 📄 License

MIT — see [LICENSE](./LICENSE).
