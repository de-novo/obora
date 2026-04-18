# Obora Examples

Sample workflows and use cases for Obora AI Control Runtime.

## Examples

| Example                                                        | Description                                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`hello-obora.yaml`](./hello-obora.yaml)                       | Single-file hello world workflow                                     |
| [01-simple-pipeline](./01-simple-pipeline)                     | Basic linear workflow                                                |
| [02-multi-agent-consensus](./02-multi-agent-consensus)         | Multi-agent consensus gate                                           |
| [03-policy-gate](./03-policy-gate)                             | Human approval gate + policy enforcement                             |
| [04-plugin-custom](./04-plugin-custom)                         | Custom plugin integration                                            |
| [05-dashboard-monitoring](./05-dashboard-monitoring)           | Monitoring-oriented workflow example for the dashboard package       |
| [06-validation-repair-loop](./06-validation-repair-loop)       | Runtime-native validation / repair / re-validation loop              |
| [07-contract-first-evaluation](./07-contract-first-evaluation) | Contract-first structured evaluation with bindings and output schema |
| [todo-app](./todo-app)                                         | Compact end-to-end todo app generator workflow                       |
| [todo-app-glm47](./todo-app-glm47)                             | Step-by-step single-model todo app workflow suite                    |

## Quick Start

```bash
# Run the hello world example
obora run hello-obora.yaml

# Run a specific example
cd examples/01-simple-pipeline
obora run workflow.yaml

# Run the validation-repair loop example (runtime + custom step tools)
node examples/06-validation-repair-loop/run.mjs

# Run the contract-first evaluation example
obora run examples/07-contract-first-evaluation/workflow.yaml
```

## Workflow Basics

### Simple Pipeline

```yaml
name: simple-pipeline
version: "1.0"

steps:
  - name: plan
    agent: architect
    input:
      task: "Design a REST API"

  - name: implement
    agent: coder
    depends_on: [plan]
    input:
      task: "Implement the API from the plan"

  - name: review
    agent: reviewer
    depends_on: [implement]
    pattern: peer-review
```

### With Consensus

```yaml
name: consensus-workflow
version: "1.0"

steps:
  - name: design
    agent: architect
    input: { task: "Design the system" }

  - name: approve
    pattern: consensus
    depends_on: [design]
    participants: [reviewer1, reviewer2, reviewer3]
    rule: majority
```

### With Policy Gate

```yaml
name: gated-workflow
version: "1.0"

steps:
  - name: plan
    agent: architect

  - name: gate
    pattern: policy-gate
    depends_on: [plan]
    policy:
      rules:
        - condition: "output.contains('security')"
          effect: require_approval
```

## Agent Configuration

Define agents in `agents.yaml`:

```yaml
agents:
  architect:
    role: Software Architect
    description: Designs system architecture
    provider: zai
    model: glm-4.7
    temperature: 0.7

  coder:
    role: Software Developer
    description: Implements code
    provider: zai
    model: glm-4.7
    temperature: 0.3

  reviewer:
    role: Code Reviewer
    description: Reviews code quality
    provider: zai
    model: glm-4.7
```

## Patterns

| Pattern          | Description               |
| ---------------- | ------------------------- |
| `pipeline`       | Sequential execution      |
| `consensus`      | Multi-agent voting        |
| `peer-review`    | Code review pattern       |
| `supervisor`     | Supervisor/worker pattern |
| `fan-out-fan-in` | Parallel execution        |
| `red-blue`       | A/B testing pattern       |
| `brainstorm`     | Idea generation           |

## License

MIT
