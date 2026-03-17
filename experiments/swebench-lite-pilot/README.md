# SWE-bench Lite Pilot Scaffold

This pilot is for one job: run a small SWE-bench Lite slice through a reusable Obora loop, inject task-specific context one task at a time, record per-task outcomes, and compare the aggregate signal against public reference scores or leaderboard notes.

## Directory layout

```text
experiments/swebench-lite-pilot/
  PLAN.md
  README.md
  config/
  fixtures/
  manifests/
  references/
  results/
  scripts/
  templates/
  workflows/
```

- `config/`: minimal 5-task and 10-task pilot presets.
- `fixtures/`: local dry-run fixture workspace only.
- `manifests/`: sample manifest formats for fixed task slices.
- `references/`: public benchmark reference metadata to cite during comparison.
- `results/`: JSONL result rows, schema docs, and sample outputs.
- `scripts/`: validators, context renderer, one-task runner, result helpers.
- `templates/`: task-context schema and sample input.
- `workflows/`: reusable Obora workflow definition shared by every pilot task.

## Reusable architecture

The pilot execution path is intentionally split into four honest layers:

1. `manifests/` selects which benchmark task ids belong to the pilot slice.
2. `templates/task-context*.json` defines the richer per-task context consumed by the workflow.
3. `scripts/run-one-task.mjs` materializes that context into a prepared local workspace under `.obora-swebench/current/` and runs the same reusable workflow for every task.
4. `results/` records outcome rows separately from public reference metadata.

The key correction is that the workflow is shared. The runner changes the injected task context, not the workflow file.

## Shared workflow and task context

- Shared workflow: `experiments/swebench-lite-pilot/workflows/obora-swebench-loop.yaml`
- Task context schema: `experiments/swebench-lite-pilot/templates/task-context.schema.json`
- Sample task context: `experiments/swebench-lite-pilot/templates/task-context.sample.json`

The workflow does not hard-code a task id, repo, issue text, test command, or patch target. It always reads task-specific data from files that the runner mounts into the prepared workspace.

## What the runner actually does

`scripts/run-one-task.mjs` supports a one-task execution path with these inputs:

- pilot config path
- manifest path (optional if inferred from config)
- task id
- prepared local workspace path
- task-context JSON path, or `task_context_path` in the manifest entry

For each selected task it:

1. validates the pilot config, manifest, and task-context input
2. creates a run directory under `<prepared-workspace>/.obora-swebench/runs/...`
3. mounts that run as `<prepared-workspace>/.obora-swebench/current`
4. writes `task-context.json`, `task-brief.md`, snapshots, and a draft result record
5. invokes the reusable workflow against the prepared workspace

The runner includes a dry-run mode that renders the run workspace and validates workflow wiring without claiming a real benchmark solve.

## Prepare a 5-task or 10-task run

1. Copy or edit `config/pilot-5.json` or `config/pilot-10.json`.
2. Replace the sample model id with the exact model you plan to test.
3. Replace the sample task ids in the matching manifest with a real SWE-bench Lite slice.
4. Fill in `references/public-reference.sample.json` with the public score or leaderboard snapshot you want to compare against.
5. Prepare a task-context JSON per selected task using `templates/task-context.sample.json`.
6. Validate the scaffold inputs:

```bash
node experiments/swebench-lite-pilot/scripts/validate-config.mjs experiments/swebench-lite-pilot/config/pilot-5.json
node experiments/swebench-lite-pilot/scripts/validate-manifest.mjs experiments/swebench-lite-pilot/manifests/pilot-5.sample.json
node experiments/swebench-lite-pilot/scripts/validate-reference-metadata.mjs experiments/swebench-lite-pilot/references/public-reference.sample.json
node experiments/swebench-lite-pilot/scripts/validate-task-context.mjs experiments/swebench-lite-pilot/templates/task-context.sample.json
node experiments/swebench-lite-pilot/scripts/check-pilot-manifest.mjs experiments/swebench-lite-pilot/config/pilot-5.json
```

## Render task context into a prepared workspace

This is the lightweight no-execution path:

```bash
node experiments/swebench-lite-pilot/scripts/render-task-context.mjs \
  --config experiments/swebench-lite-pilot/config/pilot-5.gpt54.json \
  --task-id astropy__astropy-14995 \
  --task-context experiments/swebench-lite-pilot/templates/task-context.sample.json \
  --workspace-path experiments/swebench-lite-pilot/fixtures/prepared-workspace
```

That command creates a run directory and mounts it at `experiments/swebench-lite-pilot/fixtures/prepared-workspace/.obora-swebench/current`.

## Dry-run the reusable workflow path

Build the runtime packages once, then dry-run the one-task runner:

```bash
pnpm --filter @obora/runtime build && pnpm --filter @obora/sdk build
node experiments/swebench-lite-pilot/scripts/run-one-task.mjs \
  --config experiments/swebench-lite-pilot/config/pilot-5.gpt54.json \
  --task-id astropy__astropy-14995 \
  --task-context experiments/swebench-lite-pilot/templates/task-context.sample.json \
  --workspace-path experiments/swebench-lite-pilot/fixtures/prepared-workspace \
  --dry-run
```

## Execute one prepared task for real

If you have:

- a real prepared local workspace for the selected SWE-bench task
- a real task-context JSON with true issue text, base commit, and test command
- Obora model credentials available via `~/.obora/config.yaml`, project config, or provider env vars

then run:

```bash
node experiments/swebench-lite-pilot/scripts/run-one-task.mjs \
  --config experiments/swebench-lite-pilot/config/pilot-5.gpt54.json \
  --task-id astropy__astropy-14995 \
  --task-context path/to/real-task-context.json \
  --workspace-path /absolute/path/to/prepared/task/workspace
```

The runner executes the reusable workflow through Obora runtime and writes run artifacts plus a draft result record into the mounted run directory.

## Record per-task Obora results

Append one JSON object per completed task to a JSONL file in `results/`. Each row should at minimum include:

- `task_id`
- `benchmark`
- `model`
- `success`
- `wall_time_sec`
- `iterations`
- `repair_count`
- `tool_calls`
- `final_verdict`
- `failure_reason`

Optional fields are supported for token usage, estimated cost, run ids, notes, and coarse public reference context.

Use `results/sample-results.jsonl` as the template for the row shape.

`scripts/render-task-context.mjs` writes `result-record.draft.json` into each run directory, and `scripts/append-result.mjs` can append a completed draft to a JSONL results file.

## Attach public reference scores or leaderboard notes

Store coarse comparison context in `references/` using the sample metadata format. This scaffold intentionally records public references separately from run outputs so the pilot stays honest about what was observed locally versus what came from published sources.

Recommended fields:

- `snapshot_label`
- `model_family`
- `references[].label`
- `references[].source_url`
- `references[].score_percent`
- `references[].notes`

## Summarize pilot results

Run the summary script on a JSONL result file:

```bash
node experiments/swebench-lite-pilot/scripts/summarize-results.mjs \
  experiments/swebench-lite-pilot/results/sample-results.jsonl \
  --reference experiments/swebench-lite-pilot/references/public-reference.sample.json
```

The summary prints aggregate counts, success rate, average runtime metrics, failure breakdown, and any coarse delta versus the first public reference score available.

## What is intentionally not automated yet

- fetching SWE-bench Lite tasks or benchmark artifacts
- preparing benchmark workspaces automatically
- reproducing the official SWE-bench harness end to end
- a local direct baseline runner
- automatic ingestion from Obora traces
- leaderboard scraping or publication workflows

That is intentional. This scaffold is pilot-ready, not benchmark-complete.
