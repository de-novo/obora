# SWE-bench Lite Pilot Scaffold

This pilot is for one job: run a small SWE-bench Lite slice through the Obora loop, record per-task outcomes, and compare the aggregate signal against public reference scores or leaderboard notes.

## Directory layout

```text
experiments/swebench-lite-pilot/
  PLAN.md
  README.md
  config/
  manifests/
  references/
  results/
  scripts/
```

- `config/`: minimal 5-task and 10-task pilot presets.
- `manifests/`: sample manifest formats for fixed task slices.
- `references/`: public benchmark reference metadata to cite during comparison.
- `results/`: JSONL result rows, schema docs, and sample outputs.
- `scripts/`: small validators and result summarizer.

## Prepare a 5-task or 10-task run

1. Copy or edit `config/pilot-5.json` or `config/pilot-10.json`.
2. Replace the sample model id with the exact model you plan to test.
3. Replace the sample task ids in the matching manifest with a real SWE-bench Lite slice.
4. Fill in `references/public-reference.sample.json` with the public score or leaderboard snapshot you want to compare against.
5. Validate the scaffold inputs:

```bash
node experiments/swebench-lite-pilot/scripts/validate-config.mjs experiments/swebench-lite-pilot/config/pilot-5.json
node experiments/swebench-lite-pilot/scripts/validate-manifest.mjs experiments/swebench-lite-pilot/manifests/pilot-5.sample.json
node experiments/swebench-lite-pilot/scripts/validate-reference-metadata.mjs experiments/swebench-lite-pilot/references/public-reference.sample.json
node experiments/swebench-lite-pilot/scripts/check-pilot-manifest.mjs experiments/swebench-lite-pilot/config/pilot-5.json
```

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
- executing the real benchmark harness
- a local direct baseline runner
- automatic ingestion from Obora traces
- leaderboard scraping or publication workflows

That is intentional. This scaffold is pilot-ready, not benchmark-complete.
