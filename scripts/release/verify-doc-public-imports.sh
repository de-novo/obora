#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

TMP_HITS="$(mktemp)"
cleanup() { rm -f "$TMP_HITS"; }
trap cleanup EXIT

python3 - <<'PY' > "$TMP_HITS"
import json
import re
from pathlib import Path

allowed: set[str] = set()
for package_json in Path('packages').glob('*/package.json'):
    pkg = json.loads(package_json.read_text())
    name = pkg.get('name')
    if not isinstance(name, str) or pkg.get('private') is True:
        continue

    exports = pkg.get('exports')
    if isinstance(exports, dict):
        if '.' in exports:
            allowed.add(name)
        for export_name in exports:
            if export_name == '.':
                continue
            if export_name.startswith('./'):
                allowed.add(f'{name}/{export_name[2:]}')
    elif 'main' in pkg:
        allowed.add(name)

markdown_files = []
for candidate in [Path('README.md'), *Path('docs').rglob('*.md'), *Path('packages').glob('*/README.md')]:
    if candidate.exists():
        markdown_files.append(candidate)

patterns = [
    re.compile(r'\bfrom\s+[\'"](@obora/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_./-]+)?)[\'"]'),
    re.compile(r'\bimport\s*\(\s*[\'"](@obora/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_./-]+)?)[\'"]\s*\)'),
    re.compile(r'\brequire\s*\(\s*[\'"](@obora/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_./-]+)?)[\'"]\s*\)'),
]

for path in markdown_files:
    for line_no, line in enumerate(path.read_text(errors='ignore').splitlines(), start=1):
        for pattern in patterns:
            for match in pattern.finditer(line):
                specifier = match.group(1)
                if specifier not in allowed:
                    print(f'{path.as_posix()}:{line_no}:{specifier}')
PY

if [[ -s "$TMP_HITS" ]]; then
  echo "[FAIL] Markdown docs reference @obora import specifiers that are not public package exports:" >&2
  cat "$TMP_HITS" >&2
  echo "       Update the docs sample or add the export intentionally in package.json." >&2
  exit 1
fi

echo "[PASS] Markdown @obora import samples match public package exports."
