# Obora

> **AI는 흔들려도 시스템은 흔들리지 않게**

**Obora** is an AI Control Runtime that makes AI-included systems controllable, auditable, and recoverable.

[![npm version](https://img.shields.io/npm/v/@obora/sdk)](https://www.npmjs.com/package/@obora/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![CI](https://github.com/obora-labs/obora-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/obora-labs/obora-kit/actions/workflows/ci.yml)

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

---

## ⚡ Quick Start (5 minutes)

```bash
npm install -g @obora/cli
obora init my-project
cd my-project
obora run workflow.yaml
```

Run an additional sample workflow from this repository:

```bash
# from repository root
obora run examples/hello-obora.yaml
```

Expected outcome:

- A workflow starts inside controlled execution boundaries
- Policies are evaluated per step
- Execution events are recorded for auditing and replay

---

## 🧩 Core Concepts

- **Execution Cell** — Isolated runtime boundary where AI executes
- **Policy Engine** — Rule-based control for tools, actions, and access
- **Audit Trail** — Full trace of inputs, decisions, state transitions, and outputs
- **Recovery Engine** — Retry / rollback / escalate strategies for failures
- **Consensus** — Multi-agent agreement gates for critical decisions

---

## 🏗️ Architecture Overview

```text
[Workflow Spec]
      |
      v
[Orchestrator] ---> [Policy Engine]
      |                    |
      v                    v
[Execution Cells] ---> [Audit Trail]
      |
      v
[Recovery Engine] ---> [Consensus Gate] ---> [Final Outcome]
```

Obora keeps the control plane deterministic while containing AI variability inside isolated execution cells.

---

## 📦 Packages

- `@obora/runtime` — Core runtime
- `@obora/sdk` — Programmatic API
- `@obora/cli` — Command-line interface

---

## 📚 Documentation

- [Getting Started](./docs/getting-started.md)
- [API Reference](./docs/api/README.md)
- [CLI Reference](./docs/cli/README.md)
- [Tutorials](./docs/tutorials/README.md)
- [Examples](./examples)

---

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## 📄 License

MIT — see [LICENSE](./LICENSE).
