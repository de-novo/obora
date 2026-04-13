#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

TARBALL_PATH="packages/cli/obora-cli-$(jq -r '.version' packages/cli/package.json).tgz"
if git ls-files --error-unmatch "$TARBALL_PATH" >/dev/null 2>&1; then
  git checkout -- "$TARBALL_PATH"
else
  rm -f "$TARBALL_PATH"
fi

bash scripts/release/verify-cli-package.sh >/tmp/verify-cli-package-selftest.log 2>&1 || {
  cat /tmp/verify-cli-package-selftest.log
  echo "[FAIL] verify-cli-package.sh failed unexpectedly"
  exit 1
}

if [[ -n "$(git status --short -- "$TARBALL_PATH")" ]]; then
  cat /tmp/verify-cli-package-selftest.log
  git status --short -- "$TARBALL_PATH"
  echo "[FAIL] verify-cli-package.sh left tarball changes in working tree"
  exit 1
fi

echo "[PASS] verify cli package selftest passed"
