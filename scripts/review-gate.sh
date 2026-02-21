#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

if [[ -f .review-gate.local.sh ]]; then
  # shellcheck disable=SC1091
  source .review-gate.local.sh
fi

PROJECT_NAME="${PROJECT_NAME:-$(basename "$ROOT_DIR")}"
REVIEW_TARGET="${REVIEW_TARGET:-working-tree}"
REVIEW_SCOPE="${REVIEW_SCOPE:-pre-push}"

TYPECHECK_CMD="${TYPECHECK_CMD:-echo '[skip] TYPECHECK_CMD not set'}"
TEST_CMD="${TEST_CMD:-echo '[skip] TEST_CMD not set'}"
BUILD_CMD="${BUILD_CMD:-echo '[skip] BUILD_CMD not set'}"
RUST_CHECK_CMD="${RUST_CHECK_CMD:-}"
SELFTEST_CMD="${SELFTEST_CMD:-}"

DEPRECATED_GREP="${DEPRECATED_GREP:-cocoa\\s*=|ReactDOM\\.render|findDOMNode\\(|@deprecated}"
BAN_GREP="${BAN_GREP:-\\bas any\\b|@ts-ignore}"
SCAN_PATHS="${SCAN_PATHS:-packages}"

run_step() {
  local label="$1"
  local cmd="$2"
  echo "\n==> ${label}"
  bash -lc "$cmd"
}

collect_existing_paths() {
  local raw="$1"
  local out=()
  IFS=',' read -r -a candidates <<< "$raw"
  for p in "${candidates[@]}"; do
    p="$(echo "$p" | xargs)"
    [[ -z "$p" ]] && continue
    if [[ -e "$p" ]]; then
      out+=("$p")
    fi
  done
  if [[ ${#out[@]} -eq 0 ]]; then
    out+=(".")
  fi
  printf '%s\n' "${out[@]}"
}

echo "[Review Gate]"
echo "project: ${PROJECT_NAME}"
echo "target : ${REVIEW_TARGET}"
echo "scope  : ${REVIEW_SCOPE}"

EFFECTIVE_SCAN_PATHS=()
while IFS= read -r line; do
  EFFECTIVE_SCAN_PATHS+=("$line")
done < <(collect_existing_paths "$SCAN_PATHS")

echo "\n==> Deprecated scan"
if rg -n -S \
  -g '!node_modules' -g '!dist' -g '!**/Cargo.lock' -g '!scripts/**' \
  "$DEPRECATED_GREP" "${EFFECTIVE_SCAN_PATHS[@]}"; then
  echo "[WARN] Deprecated signals found above. Review required."
else
  echo "[OK] No deprecated signals found by pattern scan."
fi

echo "\n==> Ban pattern scan"
if rg -n -S \
  -g '!node_modules' -g '!dist' \
  -g '!**/__tests__/**' -g '!**/*.test.*' \
  -g '!**/_legacy/**' -g '!**/docs/**' \
  "$BAN_GREP" "${EFFECTIVE_SCAN_PATHS[@]}"; then
  echo "[FAIL] Forbidden patterns found (as any / @ts-ignore)."
  exit 1
else
  echo "[OK] No forbidden patterns found."
fi

if [[ -n "$RUST_CHECK_CMD" ]]; then
  run_step "Rust check" "$RUST_CHECK_CMD"
fi
run_step "Typecheck" "$TYPECHECK_CMD"
run_step "Tests" "$TEST_CMD"
if [[ -n "$SELFTEST_CMD" ]]; then
  run_step "Gate selftest" "$SELFTEST_CMD"
fi
run_step "Build" "$BUILD_CMD"

echo "\n[PASS] Review gate completed successfully."
