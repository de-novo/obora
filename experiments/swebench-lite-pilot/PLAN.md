# SWE-bench Lite Pilot Plan

## Why SWE-bench Lite first

SWE-bench Lite is the best first real benchmark for Obora because it is public, widely recognized, patch-oriented, and small enough to pilot without building a full evaluation platform first. It also maps well to Obora's loop-centric value proposition: iterative execution, repair, validation, auditability, and convergence under constraints.

## Pilot objective

The first question is narrow: if we run the Obora loop on a small SWE-bench Lite slice, do we see promising signals relative to public benchmark references for the model family being tested? This phase is about signal detection, not a final benchmark claim.

## Rollout: 5-task then 10-task

1. Start with a fixed 5-task pilot manifest to confirm the run bookkeeping, result schema, and summary flow work end to end.
2. Expand to a fixed 10-task manifest only after the 5-task pass is operational and the recording process is stable.
3. Keep the 10-task slice additive or separately versioned so results remain auditable.

## Why public reference comparison is enough for phase 1

Published SWE-bench Lite leaderboard scores already provide a useful coarse reference point for whether Obora looks directionally competitive. For a first pilot, that is enough to answer whether Obora's loop execution is worth deeper investment without delaying on local baseline infrastructure.

## What phase 1 cannot conclude without a matched local baseline

- It cannot isolate how much lift comes from Obora versus the underlying model.
- It cannot support strict apples-to-apples claims against a locally reproduced direct baseline.
- It cannot control for differences in prompting, runtime budget, harness details, or benchmark snapshot choices outside the recorded pilot settings.
- It cannot justify leaderboard-style claims beyond directional comparison against published numbers.

## Metrics to track for Obora loop runs

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
- optional usage fields such as `prompt_tokens`, `completion_tokens`, `total_tokens`, `estimated_cost_usd`
- `public_reference_label`
- `public_reference_score`

These fields are enough to tell whether the loop completes tasks, how expensive it is, and whether the pattern looks plausible relative to public references.

## Fairness controls still worth enforcing

- Keep the task manifest fixed for all compared pilot runs.
- Keep the Obora loop settings fixed within a pilot: same max iterations, same stop conditions, same tool policy, same validation logic.
- Record exact model identifiers and any materially relevant runtime knobs.
- Preserve manifest order or explicitly record randomized order once and reuse it.
- Use a single benchmark snapshot definition for the whole pilot.
- Keep failure recording honest; unresolved, timeout, harness, and operator errors should not be collapsed together.

## First execution checklist

1. Choose the model family and exact model id.
2. Fill in a real 5-task SWE-bench Lite manifest.
3. Fill in the corresponding pilot config preset.
4. Record the public reference metadata that will be used for coarse comparison.
5. Validate config, manifest, and reference metadata.
6. Materialize task context into a prepared local workspace and run the reusable Obora workflow one task at a time.
7. Append one JSONL result row per task.
8. Run the summary script and inspect success rate, timing, and failure distribution.
9. If the 5-task slice looks operational, repeat with the 10-task slice.

## What success or failure means

Success means the pilot produces clean, auditable records and the observed success rate is directionally encouraging versus published references for the chosen model family. Failure means either the scaffold is too fragile to operate or the observed signals are weak enough that scaling the benchmark effort is not justified yet.

## If the pilot looks promising

1. Lock a better curated 10-task slice and rerun the same shared workflow with new task-context inputs.
2. Add a matched local baseline runner for the same slice.
3. Tighten result normalization and automate ingestion from Obora traces.
4. Expand to a larger Lite slice only after the matched baseline exists.
5. Decide whether full SWE-bench or a broader benchmark portfolio is worth the engineering cost.

## Phase 1 execution architecture

The pilot should now be thought of as a reusable workflow system, not a workflow generator:

- one shared Obora workflow for SWE-bench-style repair loops
- one task-context document per benchmark task
- one runner that selects a manifest task, mounts task context into a prepared workspace, and invokes the same workflow
- one separate result-recording path that stays honest about what was actually executed locally

This keeps the benchmark-facing UX simple while preserving auditability.
