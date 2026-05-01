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

python3 - <<'PY' > "$TMP_HITS"
from pathlib import Path

needles = ['as any', '@ts-ignore', '@ts-expect-error']
for root in [Path('packages/sdk/src'), Path('packages/cli/src')]:
    if not root.exists():
        continue
    for path in root.rglob('*.ts'):
        for line_no, line in enumerate(path.read_text(errors='ignore').splitlines(), start=1):
            if any(needle in line for needle in needles):
                print(f'{path.as_posix()}:{line_no}:{line}')
PY

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

runtime_hits="$(python3 - <<'PY'
from pathlib import Path

needles = ['as any', '@ts-ignore', '@ts-expect-error']
root = Path('packages/runtime/src')
if root.exists():
    for path in root.rglob('*.ts'):
        for line_no, line in enumerate(path.read_text(errors='ignore').splitlines(), start=1):
            if any(needle in line for needle in needles):
                print(f'{path.as_posix()}:{line_no}:{line}')
PY
)"
if [[ -n "$runtime_hits" ]]; then
  echo "$runtime_hits" >&2
  echo "[FAIL] Runtime source/test type debt must stay at zero." >&2
  exit 1
fi

echo "[PASS] SDK/CLI test type debt is within the tracked allowlist and runtime remains clean."
