#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

STATUS_BEFORE="$(git status --short -- packages/cli/*.tgz 2>/dev/null || true)"
LOG_FILE="$(mktemp)"
cleanup() { rm -f "$LOG_FILE"; }
trap cleanup EXIT

bash scripts/release/verify-cli-package.sh >"$LOG_FILE" 2>&1 || {
  cat "$LOG_FILE"
  echo "[FAIL] verify-cli-package.sh failed unexpectedly"
  exit 1
}

STATUS_AFTER="$(git status --short -- packages/cli/*.tgz 2>/dev/null || true)"
if [[ "$STATUS_AFTER" != "$STATUS_BEFORE" ]]; then
  cat "$LOG_FILE"
  printf '%s\n' "$STATUS_BEFORE" >"$LOG_FILE.before"
  printf '%s\n' "$STATUS_AFTER" >"$LOG_FILE.after"
  echo "[FAIL] verify-cli-package.sh changed tarball status in working tree"
  echo "[before]"
  cat "$LOG_FILE.before"
  echo "[after]"
  cat "$LOG_FILE.after"
  rm -f "$LOG_FILE.before" "$LOG_FILE.after"
  exit 1
fi

echo "[PASS] verify cli package selftest passed"
