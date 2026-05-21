# Execution Input Principles

Obora treats command-injected execution input as the canonical operator request.

This applies consistently across `obora run` and `obora chat`:

- `obora run --input ...` provides the run request.
- `obora chat` plain messages and `/run <task>` provide the chat request.
- Workflow prompts define capability, policy, constraints, and reporting expectations.
- Workflow prompts should not hard-code task-specific directories, file lists, or framework choices unless the workflow is intentionally specialized for that domain.
- Agents should inspect the repository at execution time, infer the smallest coherent change, choose files from local context, preserve conventions, and report changed paths plus verification.

Specialized workflows may narrow the allowed domain, but they should still let the injected request supply the concrete task.
