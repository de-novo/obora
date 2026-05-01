#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

TMP_HITS="$(mktemp)"
cleanup() { rm -f "$TMP_HITS"; }
trap cleanup EXIT

python3 - <<'PY' > "$TMP_HITS"
from pathlib import Path

packages_dir = Path('packages')
if packages_dir.exists():
    for path in packages_dir.glob('*/src/**/*.ts'):
        for line_no, line in enumerate(path.read_text(errors='ignore').splitlines(), start=1):
            if '@module @obora/' in line:
                print(f'{path.as_posix()}:{line_no}:{line}')
PY

if [[ -s "$TMP_HITS" ]]; then
  echo "[FAIL] Source JSDoc must not advertise scoped @obora module subpaths:" >&2
  cat "$TMP_HITS" >&2
  echo "       Remove the scoped @module tag or document the surface through package.json exports." >&2
  exit 1
fi

echo "[PASS] Source JSDoc does not advertise scoped @obora module subpaths."
