#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

CHANGELOG_FILE="CHANGELOG.md"
CLI_PKG="packages/cli/package.json"
CLI_VERSION="$(jq -r '.version' "$CLI_PKG")"

if [[ ! -f "$CHANGELOG_FILE" ]]; then
  echo "[FAIL] CHANGELOG.md not found."
  exit 1
fi

if ! rg -q '^## \[Unreleased\]' "$CHANGELOG_FILE"; then
  echo "[FAIL] CHANGELOG.md is missing an [Unreleased] section."
  exit 1
fi

if ! rg -q "0\.1\.0|0\.1\.2|CLI|version|release|packag" "$CHANGELOG_FILE"; then
  echo "[WARN] CHANGELOG.md has no obvious release/version notes."
fi

if ! python3 - <<'PY'
from pathlib import Path
text = Path('CHANGELOG.md').read_text()
start = text.find('## [Unreleased]')
if start < 0:
    raise SystemExit(1)
next_idx = text.find('\n## [', start + 1)
block = text[start: next_idx if next_idx != -1 else None]
keywords = ['cli', 'release', 'version', 'pack', 'publish', 'dist', 'artifact', 'verification', 'changelog']
if not any(k.lower() in block.lower() for k in keywords):
    raise SystemExit(2)
PY
then
  echo "[FAIL] CHANGELOG.md [Unreleased] section does not mention pending release-facing changes."
  echo "       Add a brief note for CLI packaging/version/release verification changes before releasing."
  exit 1
fi

echo "[PASS] CHANGELOG.md contains an [Unreleased] section with release-facing notes."
echo "[INFO] current CLI package version: $CLI_VERSION"
