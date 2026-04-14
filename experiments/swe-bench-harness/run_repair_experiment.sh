#!/bin/bash
set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_env.sh
source "$SCRIPT_DIR/_env.sh"

cd "$REPO_ROOT" || exit 1

if [ -z "${ZAI_API_KEY:-}" ] && [ -f "$HOME/.obora/auth.json" ]; then
  export ZAI_API_KEY="$(jq -r '.providers.zai.apiKey // empty' "$HOME/.obora/auth.json")"
  if [ -n "${ZAI_API_KEY:-}" ]; then
    echo "Loaded ZAI_API_KEY from auth.json"
  fi
fi

SAMPLES_DIR="${SAMPLES_DIR:-$SWE_BENCH_REPAIR_SAMPLES_DIR}"
RESULTS_DIR="${RESULTS_DIR:-$SWE_BENCH_RESULTS_REPAIR_DIR}"
SAMPLE_ARG="${1:-5}"
HELPER="${HELPER:-$HARNESS_DIR/structured_repair_helper.py}"
WORKFLOW="${WORKFLOW:-$SWE_BENCH_REPAIR_WORKFLOW}"
CONFIG="${CONFIG:-$SWE_BENCH_EXPERIMENT_CONFIG}"

if [ ! -f "$OBORA_CLI_BIN" ]; then
  echo "Missing CLI build: $OBORA_CLI_BIN"
  echo "Run pnpm --filter @obora/cli build first."
  exit 1
fi

if [ ! -d "$SAMPLES_DIR" ]; then
  echo "Missing samples dir: $SAMPLES_DIR"
  exit 1
fi

if [ ! -f "$WORKFLOW" ]; then
  echo "Missing workflow: $WORKFLOW"
  exit 1
fi

PASS=0
FAIL=0
TOTAL=0

mkdir -p "$RESULTS_DIR"

echo "=== SWE-bench Evaluation with CLI Validation Repair ==="
echo "Start: $(date)"
echo "Results dir: $RESULTS_DIR"

SAMPLE_FILES=()
if echo "$SAMPLE_ARG" | grep -Eq '^[0-9]+$'; then
  SAMPLE_COUNT="$SAMPLE_ARG"
  mapfile -t SAMPLE_FILES < <(find "$SAMPLES_DIR" -maxdepth 1 -name '*.json' ! -name 'metadata.json' | sort | head -n "$SAMPLE_COUNT")
else
  if [ -f "$SAMPLES_DIR/$SAMPLE_ARG.json" ]; then
    SAMPLE_FILES+=("$SAMPLES_DIR/$SAMPLE_ARG.json")
  else
    echo "Unknown sample: $SAMPLE_ARG"
    exit 1
  fi
fi

SAMPLE_COUNT="${#SAMPLE_FILES[@]}"
echo "Samples: $SAMPLE_COUNT"
echo ""

for SAMPLE_FILE in "${SAMPLE_FILES[@]}"; do
  [ -f "$SAMPLE_FILE" ] || continue
  TOTAL=$((TOTAL + 1))
  SAMPLE_ID="$(basename "$SAMPLE_FILE" .json)"
  RESULT_DIR="$RESULTS_DIR/$SAMPLE_ID"
  WORK_DIR="${TMPDIR:-/tmp}/swebench_repair_${SAMPLE_ID}"
  REPO_DIR="$WORK_DIR/repo"
  ARTIFACTS_DIR="$REPO_DIR/artifacts"

  echo ""
  echo "=== [$TOTAL/$SAMPLE_COUNT] $SAMPLE_ID ==="

  rm -rf "$RESULT_DIR" "$WORK_DIR"
  mkdir -p "$RESULT_DIR" "$WORK_DIR"

  REPO="$(jq -r '.repo' "$SAMPLE_FILE")"
  BASE_COMMIT="$(jq -r '.base_commit' "$SAMPLE_FILE")"

  echo "Cloning $REPO..."
  if ! timeout 180 git clone --depth 1 "https://github.com/$REPO.git" "$REPO_DIR" >/dev/null 2>&1; then
    echo "❌ FAIL: Clone failed"
    echo "FAIL_CLONE" > "$RESULT_DIR/status.txt"
    FAIL=$((FAIL + 1))
    continue
  fi

  if ! timeout 60 git -C "$REPO_DIR" fetch --depth 100 origin "$BASE_COMMIT" >/dev/null 2>&1; then
    echo "❌ FAIL: Fetch failed"
    echo "FAIL_FETCH" > "$RESULT_DIR/status.txt"
    FAIL=$((FAIL + 1))
    continue
  fi

  if ! timeout 30 git -C "$REPO_DIR" checkout "$BASE_COMMIT" >/dev/null 2>&1; then
    echo "❌ FAIL: Checkout failed"
    echo "FAIL_CHECKOUT" > "$RESULT_DIR/status.txt"
    FAIL=$((FAIL + 1))
    continue
  fi

  mkdir -p "$ARTIFACTS_DIR"
  jq -r '.problem_statement' "$SAMPLE_FILE" > "$ARTIFACTS_DIR/problem.txt"

  TARGET_FILE="$(python3 "$HELPER" extract-target "$ARTIFACTS_DIR/problem.txt")"
  printf '%s\n' "$TARGET_FILE" > "$ARTIFACTS_DIR/target_file.txt"

  if [ -n "$TARGET_FILE" ] && [ -f "$REPO_DIR/$TARGET_FILE" ]; then
    python3 "$HELPER" make-snippet "$REPO_DIR" "$TARGET_FILE" "$ARTIFACTS_DIR/target_snippet.txt"
  else
    : > "$ARTIFACTS_DIR/target_snippet.txt"
  fi

  echo "Running Obora CLI validation-repair loop..."
  ATTEMPT=1
  MAX_ATTEMPTS=3
  RUN_OK=false
  while [ "$ATTEMPT" -le "$MAX_ATTEMPTS" ]; do
    : > "$RESULT_DIR/obora.log"
    RUN_CMD=(node "$OBORA_CLI_BIN" run "$WORKFLOW" --output-dir "$RESULT_DIR" --timeout "${OBORA_RUN_TIMEOUT_MS:-240000}")
    if [ -f "$CONFIG" ]; then
      RUN_CMD+=(--config "$CONFIG")
    fi
    if (cd "$REPO_DIR" && "${RUN_CMD[@]}") 2>&1 | tee "$RESULT_DIR/obora.log"; then
      RUN_OK=true
      break
    fi

    if grep -q '429 Rate limit reached for requests' "$RESULT_DIR/obora.log"; then
      SLEEP_SECS=$((ATTEMPT * 20))
      echo "⚠️ 429 rate limit, retrying in ${SLEEP_SECS}s..."
      sleep "$SLEEP_SECS"
      ATTEMPT=$((ATTEMPT + 1))
      continue
    fi

    if grep -q '\[SDK_8002\] Execution cancelled' "$RESULT_DIR/obora.log"; then
      if [ "$ATTEMPT" -lt "$MAX_ATTEMPTS" ]; then
        echo "⚠️ SDK_8002 execution cancelled, retrying..."
        sleep 5
        ATTEMPT=$((ATTEMPT + 1))
        continue
      fi
    fi

    break
  done

  if [ "$RUN_OK" = true ]; then
    if [ -f "$ARTIFACTS_DIR/edit.json" ]; then
      cp "$ARTIFACTS_DIR/edit.json" "$RESULT_DIR/edit.json"
    fi

    FINAL_TARGET_FILE="$(cat "$ARTIFACTS_DIR/target_file.txt" 2>/dev/null || true)"
    if [ -z "$FINAL_TARGET_FILE" ] && [ -f "$ARTIFACTS_DIR/edit.json" ]; then
      FINAL_TARGET_FILE="$(jq -r '.target_file // empty' "$ARTIFACTS_DIR/edit.json" 2>/dev/null || true)"
    fi
    if [ -z "$FINAL_TARGET_FILE" ]; then
      echo "❌ FAIL: Missing final target file"
      echo "FAIL_NO_TARGET" > "$RESULT_DIR/status.txt"
      FAIL=$((FAIL + 1))
      sleep 3
      continue
    fi

    if [ ! -f "$REPO_DIR/$FINAL_TARGET_FILE" ]; then
      echo "❌ FAIL: Target file missing: $FINAL_TARGET_FILE"
      echo "FAIL_WRONG_TARGET" > "$RESULT_DIR/status.txt"
      FAIL=$((FAIL + 1))
      sleep 3
      continue
    fi

    python3 "$HELPER" validate-edit "$ARTIFACTS_DIR" "$REPO_DIR" "$FINAL_TARGET_FILE" > "$RESULT_DIR/final-validation.json"
    if jq -e '.passed == true' "$RESULT_DIR/final-validation.json" >/dev/null 2>&1; then
      cp "$ARTIFACTS_DIR/patch.diff" "$RESULT_DIR/patch.diff"
      echo "✅ PASS"
      echo "PASS" > "$RESULT_DIR/status.txt"
      PASS=$((PASS + 1))
    else
      echo "❌ FAIL: Final validation failed"
      echo "FAIL_PATCH" > "$RESULT_DIR/status.txt"
      FAIL=$((FAIL + 1))
    fi
  else
    echo "❌ FAIL: CLI repair loop execution failed"
    echo "FAIL_RUNTIME" > "$RESULT_DIR/status.txt"
    FAIL=$((FAIL + 1))
  fi

  sleep 3
done

echo ""
echo "=== Final Results ==="
echo "End: $(date)"
echo "Results dir: $RESULTS_DIR"
echo "Total: $TOTAL"
echo "PASS: $PASS"
echo "FAIL: $FAIL"
if [ "$TOTAL" -gt 0 ]; then
  echo "Pass Rate: $((PASS * 100 / TOTAL))%"
fi

RUNTIME_FAIL_COUNT="$(find "$RESULTS_DIR" -maxdepth 2 -name status.txt -exec grep -l '^FAIL_RUNTIME$' {} \; 2>/dev/null | wc -l | tr -d ' ')"
QUALITY_FAIL_COUNT="$(find "$RESULTS_DIR" -maxdepth 2 -name status.txt -exec grep -El '^(FAIL_PATCH|FAIL_WRONG_TARGET|FAIL_NO_TARGET)$' {} \; 2>/dev/null | wc -l | tr -d ' ')"
INFRA_FAIL_COUNT="$(find "$RESULTS_DIR" -maxdepth 2 -name status.txt -exec grep -El '^(FAIL_CLONE|FAIL_FETCH|FAIL_CHECKOUT|FAIL_UNKNOWN)$' {} \; 2>/dev/null | wc -l | tr -d ' ')"

echo "total: $TOTAL" > "$RESULTS_DIR/summary.txt"
echo "pass: $PASS" >> "$RESULTS_DIR/summary.txt"
echo "fail: $FAIL" >> "$RESULTS_DIR/summary.txt"
echo "runtime_fail: $RUNTIME_FAIL_COUNT" >> "$RESULTS_DIR/summary.txt"
echo "quality_fail: $QUALITY_FAIL_COUNT" >> "$RESULTS_DIR/summary.txt"
echo "infra_fail: $INFRA_FAIL_COUNT" >> "$RESULTS_DIR/summary.txt"
if [ "$TOTAL" -gt 0 ]; then
  echo "pass_rate: $((PASS * 100 / TOTAL))%" >> "$RESULTS_DIR/summary.txt"
fi
