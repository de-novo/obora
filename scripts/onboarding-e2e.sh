#!/usr/bin/env bash
set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI_ENTRY="$REPO_ROOT/packages/cli/dist/index.js"
E2E_ROOT="/tmp/obora-e2e-test"
PROJECT_NAME="test-project"
PROJECT_DIR="$E2E_ROOT/$PROJECT_NAME"
TIME_LIMIT_SEC=1800

STEP_NAMES=()
STEP_STATUS=()
STEP_DURATION=()
STEP_OUTPUT=()

TOTAL_DURATION=0
OVERALL_OK=1

run_step() {
  local name="$1"
  local cmd="$2"

  STEP_NAMES+=("$name")

  local start_ms end_ms elapsed_ms duration
  start_ms=$(python3 -c 'import time; print(int(time.time()*1000))')

  set +e
  local output
  output=$(bash -lc "$cmd" 2>&1)
  local exit_code=$?
  set -e

  end_ms=$(python3 -c 'import time; print(int(time.time()*1000))')
  elapsed_ms=$((end_ms - start_ms))
  duration=$(((elapsed_ms + 999) / 1000))
  if [ $duration -lt 1 ]; then
    duration=1
  fi
  TOTAL_DURATION=$((TOTAL_DURATION + duration))

  STEP_OUTPUT+=("$output")
  STEP_DURATION+=("$duration")

  if [ $exit_code -eq 0 ]; then
    STEP_STATUS+=("OK")
  else
    STEP_STATUS+=("FAIL")
    OVERALL_OK=0
  fi
}

print_report() {
  echo "=== Obora Onboarding E2E Report ==="

  local i
  for i in "${!STEP_NAMES[@]}"; do
    local label status duration
    label="${STEP_NAMES[$i]}"
    status="${STEP_STATUS[$i]}"
    duration="${STEP_DURATION[$i]}"

    printf '%-34s %s (%ss)\n' "$label .........." "$status" "$duration"
  done

  echo "---"
  echo "Total: ${TOTAL_DURATION}s"

  if [ $OVERALL_OK -eq 1 ] && [ $TOTAL_DURATION -le $TIME_LIMIT_SEC ]; then
    echo "Verdict: PASS (< 30min)"
  elif [ $OVERALL_OK -eq 1 ] && [ $TOTAL_DURATION -gt $TIME_LIMIT_SEC ]; then
    echo "Verdict: FAIL (time exceeded: ${TOTAL_DURATION}s > ${TIME_LIMIT_SEC}s)"
  else
    echo "Verdict: FAIL (one or more steps failed)"
  fi
}

write_fixture() {
  mkdir -p "$PROJECT_DIR/tests"
  cat > "$PROJECT_DIR/tests/happy-path.yaml" <<'EOF'
name: onboarding-happy-path
workflow:
  name: onboarding-happy-path
  steps:
    - name: generate
      agent: generator
    - name: review
      agent: reviewer
      depends_on: [generate]
mocks:
  agents:
    - name: generator
      responses:
        generate: { text: "hello from fixture" }
    - name: reviewer
      responses:
        review: { approved: true }
expect:
  status: completed
  events:
    - type: step_end
      contains: { stepName: generate, status: completed }
    - type: step_end
      contains: { stepName: review, status: completed }
EOF
}

main() {
  set -e

  if [ ! -f "$CLI_ENTRY" ]; then
    echo "CLI entry not found: $CLI_ENTRY"
    exit 1
  fi

  rm -rf "$E2E_ROOT"
  mkdir -p "$E2E_ROOT"

  run_step "Step 0: README quickstart sanity" "cd '$REPO_ROOT' && grep -q 'obora init' README.md && grep -q 'obora run workflow.yaml' README.md"
  run_step "Step 1: npm install (local CLI package)" "cd '$E2E_ROOT' && npm init -y >/dev/null && npm install '$REPO_ROOT/packages/cli' --no-audit --no-fund"
  run_step "Step 2: obora init $PROJECT_NAME" "cd '$E2E_ROOT' && node '$CLI_ENTRY' init '$PROJECT_NAME' -y"
  run_step "Step 3: cd $PROJECT_NAME" "cd '$PROJECT_DIR'"

  write_fixture

  run_step "Step 4: obora run workflow.yaml" "cd '$PROJECT_DIR' && node '$CLI_ENTRY' run workflow.yaml"
  run_step "Step 5: obora test --fixture tests/happy-path.yaml" "cd '$PROJECT_DIR' && node '$CLI_ENTRY' test --fixture tests/happy-path.yaml"
  run_step "Step 6: obora audit query" "cd '$PROJECT_DIR' && node '$CLI_ENTRY' audit query --limit 20"
  run_step "Step 7: obora policy validate policy.yaml" "cd '$PROJECT_DIR' && node '$CLI_ENTRY' policy validate policy.yaml"
  run_step "Step 8: recovery config presence check" "cd '$REPO_ROOT' && grep -q '^recovery:' examples/01-simple-pipeline/workflow.yaml"
  run_step "Step 9: consensus config presence check" "cd '$REPO_ROOT' && grep -q 'consensus:' examples/02-multi-agent-consensus/workflow.yaml"

  print_report | tee "$E2E_ROOT/report.txt"

  echo
  echo "Detailed logs: $E2E_ROOT/step-logs.txt"
  {
    local i
    for i in "${!STEP_NAMES[@]}"; do
      echo "===== ${STEP_NAMES[$i]} (${STEP_STATUS[$i]}) ====="
      echo "${STEP_OUTPUT[$i]}"
      echo
    done
  } > "$E2E_ROOT/step-logs.txt"

  if [ $OVERALL_OK -eq 1 ] && [ $TOTAL_DURATION -le $TIME_LIMIT_SEC ]; then
    exit 0
  fi

  exit 1
}

main "$@"
