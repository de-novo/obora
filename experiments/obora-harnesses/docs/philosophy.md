# Philosophy

## Obora as an Agent OS
This repository assumes a specific use model for Obora:

- Obora is not a hardcoded solver
- Obora is not a library of handwritten answers
- Obora is an operating system for agents

In practical terms, this means:
- agents are responsible for reading, searching, deciding, editing, and repairing
- harnesses are responsible for orchestration, validation, runtime control, and reporting

## What This Repository Optimizes For
1. Reproducibility
2. Honest evaluation
3. Generality across tasks
4. Runtime stability
5. Artifact quality

## What Should Be Avoided
The following patterns should be treated as anti-patterns:
- injecting task-specific answers into prompts
- pre-solving the problem in helper scripts
- relying on external deterministic logic to perform the core reasoning task
- mixing runtime failures with solution-quality failures in reports

## Acceptable Guidance
General-purpose constraints are acceptable and encouraged, for example:
- exact-match validation
- structured output contracts
- smallest-sufficient edit spans
- wrong-target rejection
- retry and timeout controls

These are system-level controls, not task-specific answers.

## Generated Artifacts
Generated artifacts are first-class citizens in this repository.
They should be treated as reproducible outputs of harnesses and retained when they have evaluation value, showcase value, or pattern value.

## Evaluation Principle
The repository should always distinguish between:
- a model or agent failing to solve a task
- the harness or runtime failing to complete execution

This distinction is central to fair evaluation.
