#!/usr/bin/env bash
set -euo pipefail

REPO="/Users/denovo/workspace/github/obora-kit"
BASE="$REPO/.automation/review-rerun-workspace-only"
OPENCODE="/Users/denovo/.asdf/installs/nodejs/lts/bin/opencode"

mkdir -p "$BASE/prompts" "$BASE/results" "$BASE/logs"
shopt -s nullglob

TASKS=(
  "TASK-040|docs/tasks/P1/TASK-040-board-package.md"
  "TASK-042b|docs/tasks/P1/TASK-042b-observer-reflector-mvp.md"
  "TASK-042c|docs/tasks/P1/TASK-042c-conflict-guardrail-advanced.md"
  "TASK-042|docs/tasks/P1/TASK-042-tkg-observer-reflector.md"
)

MODELS=(
  "opus|anthropic/claude-opus-4-6|900|0"
  "glm|zai-coding-plan/glm-5|3600|1"
  "codex|openai/gpt-5.3-codex|900|0"
)

make_prompt() {
  local task_id="$1" task_file="$2" prompt_file="$3"
  {
    echo "You are a strict reviewer. IMPORTANT: Do not use tools or request additional file reads."
    echo "Use ONLY the provided context blocks to produce the final review output immediately."
    echo
    echo "Required output lines (exact):"
    echo "SCORE: <0.0-10.0>/10"
    echo "P0: <count>"
    echo "P1: <count>"
    echo "Completion decision: PASS_FOR_DONE | KEEP_CONDITIONAL"
    echo
    echo "Then include bullets for summary, P0 issues, P1 issues, and reason."
    echo
    echo "=== CONTEXT: $task_file ==="
    cat "$REPO/$task_file"
    echo
    echo "=== CONTEXT: docs/tasks/P1/TASK-STATUS-RESYNC-2026-02-13.md ==="
    cat "$REPO/docs/tasks/P1/TASK-STATUS-RESYNC-2026-02-13.md"
    echo
    for q in "$REPO"/queue/${task_id}*.md; do
      [[ -f "$q" ]] || continue
      echo "=== CONTEXT: ${q#$REPO/} ==="
      cat "$q"
      echo
    done
  } > "$prompt_file"
}

run_one() {
  local task_id="$1" task_file="$2" model_key="$3" model_id="$4" timeout_sec="$5" retry="$6"
  local prompt="$BASE/prompts/prompt-${task_id}-${model_key}.md"
  local result="$BASE/results/result-${task_id}-${model_key}.md"
  local raw="$BASE/results/result-${task_id}-${model_key}.jsonl"
  local log="$BASE/logs/log-${task_id}-${model_key}.txt"

  make_prompt "$task_id" "$task_file" "$prompt"

  local attempt=0
  local max_attempt=$((retry + 1))
  : > "$log"
  while (( attempt < max_attempt )); do
    attempt=$((attempt + 1))
    echo "[$(date '+%F %T')] RUN $task_id $model_key attempt=$attempt" | tee -a "$log"

    if timeout "$timeout_sec" "$OPENCODE" run --format json -m "$model_id" < "$prompt" > "$raw" 2>> "$log"; then
      if jq -r 'select(.type=="text") | (.part.text // empty)' "$raw" > "$result"; then
        :
      else
        cp "$raw" "$result"
      fi

      if grep -qE '^SCORE:[[:space:]]*[0-9]+(\.[0-9]+)?/10' "$result" \
         && grep -qE '^P0:[[:space:]]*[0-9]+' "$result" \
         && grep -qE '^P1:[[:space:]]*[0-9]+' "$result"; then
        echo "[$(date '+%F %T')] OK $task_id $model_key attempt=$attempt" | tee -a "$log"
        return 0
      else
        echo "[$(date '+%F %T')] INCOMPLETE_FORMAT $task_id $model_key attempt=$attempt" | tee -a "$log"
      fi
    else
      echo "[$(date '+%F %T')] FAILED_EXIT $task_id $model_key attempt=$attempt" | tee -a "$log"
    fi

    if (( attempt < max_attempt )); then
      echo "[$(date '+%F %T')] RETRY $task_id $model_key" | tee -a "$log"
    fi
  done

  return 1
}

status_file="$BASE/review-status.tsv"
echo -e "task\tmodel\tstatus\tresult_file" > "$status_file"

for t in "${TASKS[@]}"; do
  IFS='|' read -r task_id task_file <<< "$t"
  for m in "${MODELS[@]}"; do
    IFS='|' read -r model_key model_id timeout_sec retry <<< "$m"
    if run_one "$task_id" "$task_file" "$model_key" "$model_id" "$timeout_sec" "$retry"; then
      echo -e "$task_id\t$model_key\tSUCCESS\t$BASE/results/result-${task_id}-${model_key}.md" >> "$status_file"
    else
      echo -e "$task_id\t$model_key\tFAIL\t$BASE/results/result-${task_id}-${model_key}.md" >> "$status_file"
    fi
  done
done

echo "done: $status_file"