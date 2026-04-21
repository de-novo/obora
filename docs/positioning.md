# Obora — AI Control Runtime

AI is powerful, but raw AI output is unpredictable.
Obora turns that unpredictability into production-grade workflows you can trust.

## The Problem

AI outputs are non-deterministic.
That is great for creativity—but dangerous for production systems that require repeatability, policy compliance, and operational reliability.

Without control, teams face:
- Inconsistent results across runs
- Policy and governance drift
- Limited auditability
- Fragile recovery when steps fail

## The Solution

Obora provides a control layer for AI execution:
- **Deterministic orchestration** for structured, repeatable flow execution
- **Policy enforcement** at runtime to guard tools, actions, and decisions
- **Audit trail** for full decision and execution visibility
- **Recovery mechanisms** to retry, repair, and resume safely

In short: **creative AI, controlled by runtime guarantees.**

## How It Works

1. **Define** workflow steps, roles, and constraints.
2. **Orchestrate** execution through Obora’s deterministic runtime.
3. **Enforce** policy and approval gates at critical moments.
4. **Record** every action and decision for auditability.
5. **Recover** from failures with built-in retry and re-execution strategies.

## Why Obora vs Alternatives

| Platform | Core Strength | Limitation in Production Control | Obora Difference |
|---|---|---|---|
| LangChain | Fast LLM app composition | Execution can become ad-hoc at scale | Deterministic orchestration + policy gates |
| CrewAI | Multi-agent collaboration patterns | Governance and recovery often app-defined | Runtime-level enforcement + audit + recovery |
| AutoGen | Flexible agent conversations | Less opinionated about operational guarantees | Control-first architecture for production reliability |
| Temporal | Durable workflow orchestration | Not AI-native by default | AI-native control runtime with policy/audit semantics |
| **Obora** | **AI control runtime** | **Built for governed AI operations** | **Deterministic + enforceable + auditable + recoverable** |

## Use Cases

- **Automated code review operations** with policy gates before merge
- **Consensus-driven document generation** from multiple AI agents
- **Multi-agent production operations** with traceability and rollback safety

## Get Started

- Repository: https://github.com/de-novo/obora
- Quick Start: https://github.com/de-novo/obora#quick-start
- SDK package: https://www.npmjs.com/package/@obora/sdk
