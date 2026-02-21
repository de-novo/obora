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

run_step() {
  local label="$1"
  local cmd="$2"
  echo "\n==> ${label}"
  bash -lc "$cmd"
}

echo "[Review Gate]"
echo "project: ${PROJECT_NAME}"
echo "target : ${REVIEW_TARGET}"
echo "scope  : ${REVIEW_SCOPE}"

echo "\n==> Deprecated scan"
if rg -n -S -g '!node_modules' -g '!dist' -g '!**/Cargo.lock' -g '!scripts/**' "$DEPRECATED_GREP" src test src-tauri src-tauri/Cargo.toml package.json; then
  echo "[WARN] Deprecated signals found above. Review required."
else
  echo "[OK] No deprecated signals found by pattern scan."
fi

echo "\n==> Ban pattern scan"
if rg -n -S -g '!node_modules' -g '!dist' "$BAN_GREP" src test; then
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
