#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

CHANGELOG_FILE="CHANGELOG.md"
CLI_PKG="packages/cli/package.json"
CLI_VERSION="$(node -e 'const fs = require("node:fs"); console.log(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).version);' "$CLI_PKG")"

python3 - <<'PY'
import re
import sys
from pathlib import Path

path = Path('CHANGELOG.md')
if not path.exists():
    print('[FAIL] CHANGELOG.md not found.', file=sys.stderr)
    raise SystemExit(1)

text = path.read_text()
start = text.find('## [Unreleased]')
if start < 0:
    print('[FAIL] CHANGELOG.md is missing an [Unreleased] section.', file=sys.stderr)
    raise SystemExit(1)

if not re.search(r'0\.1\.\d+|CLI|version|release|packag', text, re.IGNORECASE):
    print('[WARN] CHANGELOG.md has no obvious release/version notes.')

next_idx = text.find('\n## [', start + 1)
block = text[start: next_idx if next_idx != -1 else None]
keywords = ['cli', 'release', 'version', 'pack', 'publish', 'dist', 'artifact', 'verification', 'changelog']
if not any(k.lower() in block.lower() for k in keywords):
    print('[FAIL] CHANGELOG.md [Unreleased] section does not mention pending release-facing changes.', file=sys.stderr)
    print('       Add a brief note for CLI packaging/version/release verification changes before releasing.', file=sys.stderr)
    raise SystemExit(1)
PY

echo "[PASS] CHANGELOG.md contains an [Unreleased] section with release-facing notes."
echo "[INFO] current CLI package version: $CLI_VERSION"
