#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source scripts/release/npm-auth.sh
setup_npm_auth
trap cleanup_npm_auth EXIT

echo "[release-cli] cleaning CLI dist"
rm -rf packages/cli/dist

echo "[release-cli] rebuilding CLI"
pnpm --filter @obora/cli build >/dev/null

echo "[release-cli] verifying changelog"
bash scripts/release/verify-changelog.sh

echo "[release-cli] verifying CLI package"
bash scripts/release/verify-cli-package.sh

pkg_version="$(jq -r '.version' packages/cli/package.json)"
echo "=== publishing @obora/cli@${pkg_version} ==="
(cd packages/cli && pnpm publish --access public --no-git-checks)

echo "[PASS] CLI publish completed successfully."
