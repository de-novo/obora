#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

ALLOWLIST="scripts/release/compat-allowlist.txt"
TMP_HITS="$(mktemp)"
TMP_ALLOWED="$(mktemp)"
TMP_EXTRA="$(mktemp)"
TMP_LEGACY="$(mktemp)"
cleanup() { rm -f "$TMP_HITS" "$TMP_ALLOWED" "$TMP_EXTRA" "$TMP_LEGACY"; }
trap cleanup EXIT

python3 - <<'PY' | sort -u > "$TMP_HITS"
from pathlib import Path

roots = [
    Path('packages/runtime/src'),
    Path('packages/adapters/src'),
    Path('packages/sdk/src'),
    Path('packages/cli/src'),
]
needles = ['legacy', 'deprecated', 'backward compat', 'compatibility', '_legacy']

for root in roots:
    if not root.exists():
        continue
    for path in root.rglob('*.ts'):
        text = path.read_text(errors='ignore')
        if any(needle in text for needle in needles):
            print(path.as_posix())
PY

awk -F '\t' 'NF >= 3 && $1 !~ /^#/ && $1 != "" { print $1 }' "$ALLOWLIST" | sort -u > "$TMP_ALLOWED"

comm -23 "$TMP_HITS" "$TMP_ALLOWED" > "$TMP_EXTRA"
if [[ -s "$TMP_EXTRA" ]]; then
  echo "[FAIL] Found compat/deprecated/legacy source mentions outside $ALLOWLIST:" >&2
  cat "$TMP_EXTRA" >&2
  exit 1
fi

python3 - <<'PY' > "$TMP_LEGACY"
from pathlib import Path

for root in [Path('packages/runtime/src'), Path('packages/cli/src'), Path('packages/sdk/src')]:
    if not root.exists():
        continue
    for path in root.rglob('*.ts'):
        for line_no, line in enumerate(path.read_text(errors='ignore').splitlines(), start=1):
            if '_legacy' in line:
                print(f'{path.as_posix()}:{line_no}:{line}')
PY

if [[ -s "$TMP_LEGACY" ]]; then
  cat "$TMP_LEGACY" >&2
  echo "[FAIL] Active source must not reference _legacy." >&2
  exit 1
fi

echo "[PASS] Compat/deprecated inventory is covered by $ALLOWLIST."
