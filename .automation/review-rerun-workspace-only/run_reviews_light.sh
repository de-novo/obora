#!/usr/bin/env bash
set -euo pipefail
REPO="/Users/denovo/workspace/github/obora-kit"
BASE="$REPO/.automation/review-rerun-workspace-only"
OPENCODE="/Users/denovo/.asdf/installs/nodejs/lts/bin/opencode"
mkdir -p "$BASE/prompts" "$BASE/results" "$BASE/logs"

run_review(){
  local task="$1" file="$2" modelk="$3" modelid="$4" tout="$5" retry="$6"
  local prompt="$BASE/prompts/prompt-${task}-${modelk}.md"
  local out="$BASE/results/result-${task}-${modelk}.md"
  local raw="$BASE/results/result-${task}-${modelk}.jsonl"
  local log="$BASE/logs/log-${task}-${modelk}.txt"

  {
    echo "Use only provided text. No tool use. Output immediately."
    echo "Required exact lines:"
    echo "SCORE: <n>/10"
    echo "P0: <n>"
    echo "P1: <n>"
    echo "Completion decision: PASS_FOR_DONE | KEEP_CONDITIONAL"
    echo
    echo "[TASK DOC]"
    cat "$REPO/$file"
    echo
    echo "[STATUS EXCERPT for $task]"
    rg -n "$task|9\.|P0|P1|조건부완료|완료" "$REPO/docs/tasks/P1/TASK-STATUS-RESYNC-2026-02-13.md" || true
  } > "$prompt"

  : > "$log"
  local a=0 max=$((retry+1))
  while ((a<max)); do
    a=$((a+1))
    echo "RUN $task $modelk attempt=$a" | tee -a "$log"
    if timeout "$tout" "$OPENCODE" run --format json -m "$modelid" < "$prompt" > "$raw" 2>> "$log"; then
      if jq -r 'select(.type=="text") | (.part.text // empty)' "$raw" > "$out"; then
        :
      else
        cp "$raw" "$out"
      fi
      if grep -qE '^SCORE:[[:space:]]*[0-9]+(\.[0-9]+)?/10' "$out" && grep -qE '^P0:[[:space:]]*[0-9]+' "$out" && grep -qE '^P1:[[:space:]]*[0-9]+' "$out"; then
        echo "OK $task $modelk" | tee -a "$log"; return 0
      fi
      echo "BAD_FORMAT $task $modelk" | tee -a "$log"
    else
      echo "FAILED_EXIT $task $modelk" | tee -a "$log"
    fi
  done
  return 1
}

status="$BASE/review-status.tsv"
echo -e "task\tmodel\tstatus\tresult_file" > "$status"

declare -a tasks=(
"TASK-040|docs/tasks/P1/TASK-040-board-package.md"
"TASK-042b|docs/tasks/P1/TASK-042b-observer-reflector-mvp.md"
"TASK-042c|docs/tasks/P1/TASK-042c-conflict-guardrail-advanced.md"
"TASK-042|docs/tasks/P1/TASK-042-tkg-observer-reflector.md"
)

declare -a models=(
"opus|anthropic/claude-opus-4-6|900|0"
"glm|zai-coding-plan/glm-5|3600|1"
"codex|openai/gpt-5.3-codex|900|0"
)

for t in "${tasks[@]}"; do
 IFS='|' read -r tid tf <<< "$t"
 for m in "${models[@]}"; do
  IFS='|' read -r mk mid to rt <<< "$m"
  if run_review "$tid" "$tf" "$mk" "$mid" "$to" "$rt"; then
    echo -e "$tid\t$mk\tSUCCESS\t$BASE/results/result-${tid}-${mk}.md" >> "$status"
  else
    echo -e "$tid\t$mk\tFAIL\t$BASE/results/result-${tid}-${mk}.md" >> "$status"
  fi
 done
done

echo "done"