#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="$ROOT/sandbox/todoapp-poc/.obora/data.db"
OUT="$ROOT/projects/todoapp/generated"
mkdir -p "$OUT"

if [[ ! -f "$DB" ]]; then
  echo "DB not found: $DB" >&2
  exit 1
fi

planning_run=$(sqlite3 "$DB" "SELECT id FROM runs WHERE workflow_name='todo-planning-10' ORDER BY started_at DESC LIMIT 1;")
dev_run=$(sqlite3 "$DB" "SELECT id FROM runs WHERE workflow_name='todo-dev-10' ORDER BY started_at DESC LIMIT 1;")

if [[ -z "$planning_run" || -z "$dev_run" ]]; then
  echo "Missing planning/dev runs. Execute workflows first." >&2
  exit 1
fi

get_step_output() {
  local run_id="$1"
  local step_name="$2"
  sqlite3 "$DB" "SELECT COALESCE(output,'') FROM steps WHERE run_id='${run_id}' AND step_name='${step_name}' ORDER BY completed_at DESC LIMIT 1;"
}

p1=$(get_step_output "$planning_run" "p1-problem")
p2=$(get_step_output "$planning_run" "p2-users")
p3=$(get_step_output "$planning_run" "p3-jtbd")
p4=$(get_step_output "$planning_run" "p4-mvp-scope")
p5=$(get_step_output "$planning_run" "p5-domain-model")
p6=$(get_step_output "$planning_run" "p6-user-flow")
p7=$(get_step_output "$planning_run" "p7-kpi")
p8=$(get_step_output "$planning_run" "p8-nfr")
p9=$(get_step_output "$planning_run" "p9-release-strategy")
p10=$(get_step_output "$planning_run" "p10-prd-finalize")

d2=$(get_step_output "$dev_run" "d2-schema")
d3=$(get_step_output "$dev_run" "d3-api-crud")
d4=$(get_step_output "$dev_run" "d4-domain-rules")
d9=$(get_step_output "$dev_run" "d9-test-gate")

cat > "$OUT/TODOAPP-PRD-AUTO-v1.md" <<EOF
# TodoApp PRD v1 (Auto-generated)

- source planning run: $planning_run

## Problem
$p1

## Users
$p2

## JTBD
$p3

## MVP Scope
$p4

## User Flow
$p6

## KPI
$p7

## NFR
$p8

## Release Strategy
$p9

## PRD Finalization
$p10
EOF

cat > "$OUT/TODOAPP-ERD-AUTO-v1.md" <<EOF
# TodoApp ERD v1 (Auto-generated)

- planning run: $planning_run
- dev run: $dev_run

## Domain Model (Planning)
$p5

## Schema Implementation (Dev)
$d2
EOF

cat > "$OUT/TODOAPP-API-AUTO-v1.md" <<EOF
# TodoApp API Spec v1 (Auto-generated)

- dev run: $dev_run

## CRUD/API
$d3

## Domain Rules
$d4

## Test Gate
$d9
EOF

echo "Auto-saved docs:"
echo "- projects/todoapp/generated/TODOAPP-PRD-AUTO-v1.md"
echo "- projects/todoapp/generated/TODOAPP-ERD-AUTO-v1.md"
echo "- projects/todoapp/generated/TODOAPP-API-AUTO-v1.md"
