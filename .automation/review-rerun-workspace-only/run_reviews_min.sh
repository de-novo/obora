#!/usr/bin/env bash
set -euo pipefail
REPO="/Users/denovo/workspace/github/obora-kit"
BASE="$REPO/.automation/review-rerun-workspace-only"
OPENCODE="/Users/denovo/.asdf/installs/nodejs/lts/bin/opencode"
mkdir -p "$BASE/prompts" "$BASE/results" "$BASE/logs"

run(){
  local task="$1" file="$2" mk="$3" mid="$4" to="$5" retry="$6"
  local p="$BASE/prompts/prompt-${task}-${mk}.md" r="$BASE/results/result-${task}-${mk}.md" raw="$BASE/results/result-${task}-${mk}.jsonl" l="$BASE/logs/log-${task}-${mk}.txt"
  {
    echo "No tool use. Review this task doc only and output compactly."
    echo "Must include exact lines:"
    echo "SCORE: <n>/10"
    echo "P0: <n>"
    echo "P1: <n>"
    echo "Completion decision: PASS_FOR_DONE | KEEP_CONDITIONAL"
    echo "Then 3 bullets max reason."
    echo "---"
    cat "$REPO/$file"
  } > "$p"
  : > "$l"
  local a=0 max=$((retry+1))
  while ((a<max)); do
    a=$((a+1)); echo "RUN $task $mk attempt=$a" | tee -a "$l"
    if timeout "$to" "$OPENCODE" run --format json -m "$mid" < "$p" > "$raw" 2>> "$l"; then
      if jq -r 'select(.type=="text") | (.part.text // empty)' "$raw" > "$r"; then
        :
      else
        cp "$raw" "$r"
      fi
      if grep -qE '^SCORE:[[:space:]]*[0-9]+(\.[0-9]+)?/10' "$r" && grep -qE '^P0:[[:space:]]*[0-9]+' "$r" && grep -qE '^P1:[[:space:]]*[0-9]+' "$r"; then echo "OK $task $mk"|tee -a "$l"; return 0; fi
      echo "BAD_FORMAT $task $mk"|tee -a "$l"
    else
      echo "FAILED_EXIT $task $mk"|tee -a "$l"
    fi
  done
  return 1
}

echo -e "task\tmodel\tstatus\tresult" > "$BASE/review-status.tsv"
for t in "TASK-040|docs/tasks/P1/TASK-040-board-package.md" "TASK-042b|docs/tasks/P1/TASK-042b-observer-reflector-mvp.md" "TASK-042c|docs/tasks/P1/TASK-042c-conflict-guardrail-advanced.md" "TASK-042|docs/tasks/P1/TASK-042-tkg-observer-reflector.md"; do
 IFS='|' read -r tid tf <<< "$t"
 for m in "opus|anthropic/claude-opus-4-6|900|0" "glm|zai-coding-plan/glm-5|3600|1" "codex|openai/gpt-5.3-codex|900|0"; do
  IFS='|' read -r mk mid to rt <<< "$m"
  if run "$tid" "$tf" "$mk" "$mid" "$to" "$rt"; then s=SUCCESS; else s=FAIL; fi
  echo -e "$tid\t$mk\t$s\t$BASE/results/result-${tid}-${mk}.md" >> "$BASE/review-status.tsv"
 done
done
