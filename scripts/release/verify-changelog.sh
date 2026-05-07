#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

CHANGELOG_FILE="CHANGELOG.md"
CLI_PKG="packages/cli/package.json"
CLI_VERSION="$(node -e 'const fs = require("node:fs"); console.log(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).version);' "$CLI_PKG")"

CHANGELOG_SCOPE="$(python3 - "$CLI_VERSION" <<'PY'
import re
import sys
from pathlib import Path

cli_version = sys.argv[1]
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
    print('[WARN] CHANGELOG.md has no obvious release/version notes.', file=sys.stderr)

keywords = ['cli', 'release', 'version', 'pack', 'publish', 'dist', 'artifact', 'verification', 'changelog']

def section(heading: str) -> str | None:
    section_start = text.find(heading)
    if section_start < 0:
        return None
    next_idx = text.find('\n## ', section_start + 1)
    return text[section_start: next_idx if next_idx != -1 else None]

def has_release_notes(block: str | None) -> bool:
    if not block:
        return False
    return any(k.lower() in block.lower() for k in keywords)

version_block = section(f'## [{cli_version}]')
unreleased_block = section('## [Unreleased]')

if has_release_notes(version_block):
    print(f'version {cli_version}')
elif has_release_notes(unreleased_block):
    print('[Unreleased]')
else:
    print('[FAIL] CHANGELOG.md has no release-facing notes for the current package version or [Unreleased].', file=sys.stderr)
    print(f'       Add a ## [{cli_version}] section or pending release-facing notes before releasing.', file=sys.stderr)
    raise SystemExit(1)
PY
)"

echo "[PASS] CHANGELOG.md contains release-facing notes for $CHANGELOG_SCOPE."
echo "[INFO] current CLI package version: $CLI_VERSION"
