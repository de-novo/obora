#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

ALLOWLIST="scripts/release/compat-allowlist.txt"
TMP_HITS="$(mktemp)"
TMP_ALLOWED="$(mktemp)"
TMP_EXTRA="$(mktemp)"
cleanup() { rm -f "$TMP_HITS" "$TMP_ALLOWED" "$TMP_EXTRA"; }
trap cleanup EXIT

rg -l "legacy|deprecated|backward compat|compatibility|_legacy" \
  packages/runtime/src packages/adapters/src packages/sdk/src packages/cli/src \
  -g '*.ts' | sort > "$TMP_HITS" || true

awk -F '\t' 'NF >= 3 && $1 !~ /^#/ && $1 != "" { print $1 }' "$ALLOWLIST" | sort -u > "$TMP_ALLOWED"

comm -23 "$TMP_HITS" "$TMP_ALLOWED" > "$TMP_EXTRA"
if [[ -s "$TMP_EXTRA" ]]; then
  echo "[FAIL] Found compat/deprecated/legacy source mentions outside $ALLOWLIST:" >&2
  cat "$TMP_EXTRA" >&2
  exit 1
fi

if rg -n "_legacy" packages/runtime/src packages/cli/src packages/sdk/src -g '*.ts' >/tmp/obora-legacy-hits.$$ 2>/dev/null; then
  cat /tmp/obora-legacy-hits.$$ >&2
  rm -f /tmp/obora-legacy-hits.$$
  echo "[FAIL] Active source must not reference _legacy." >&2
  exit 1
fi
rm -f /tmp/obora-legacy-hits.$$

echo "[PASS] Compat/deprecated inventory is covered by $ALLOWLIST."
