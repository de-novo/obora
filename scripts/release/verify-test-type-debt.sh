#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

ALLOWLIST="scripts/release/test-type-debt-allowlist.txt"
TMP_HITS="$(mktemp)"
TMP_ALLOWED="$(mktemp)"
TMP_EXTRA="$(mktemp)"
cleanup() { rm -f "$TMP_HITS" "$TMP_ALLOWED" "$TMP_EXTRA"; }
trap cleanup EXIT

rg -n "as any|@ts-ignore|@ts-expect-error" packages/sdk/src packages/cli/src -g '*.ts' > "$TMP_HITS" || true
awk -F '\t' 'NF >= 3 && $1 !~ /^#/ && $1 != "" { print $1 }' "$ALLOWLIST" | sort -u > "$TMP_ALLOWED"
cut -d: -f1 "$TMP_HITS" | sort -u | comm -23 - "$TMP_ALLOWED" > "$TMP_EXTRA"
if [[ -s "$TMP_EXTRA" ]]; then
  echo "[FAIL] Found SDK/CLI test type debt outside $ALLOWLIST:" >&2
  cat "$TMP_EXTRA" >&2
  exit 1
fi

failed=0
while IFS=$'\t' read -r path max_matches reason; do
  [[ -z "${path:-}" || "${path:0:1}" == "#" ]] && continue
  actual="$(grep -F "${path}:" "$TMP_HITS" | wc -l | tr -d ' ')"
  if (( actual > max_matches )); then
    echo "[FAIL] $path has $actual matches; allowed maximum is $max_matches ($reason)" >&2
    failed=1
  fi
done < "$ALLOWLIST"

if (( failed != 0 )); then
  exit 1
fi

runtime_hits="$(rg -n "as any|@ts-ignore|@ts-expect-error" packages/runtime/src -g '*.ts' || true)"
if [[ -n "$runtime_hits" ]]; then
  echo "$runtime_hits" >&2
  echo "[FAIL] Runtime source/test type debt must stay at zero." >&2
  exit 1
fi

echo "[PASS] SDK/CLI test type debt is within the tracked allowlist and runtime remains clean."
