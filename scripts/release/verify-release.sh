#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

pnpm --filter @obora/runtime build >/dev/null
pnpm --filter @obora/adapters build >/dev/null
pnpm --filter @obora/sdk build >/dev/null
pnpm --filter @obora/cli build >/dev/null

bash scripts/release/verify-changelog.sh
bash scripts/release/npm-auth-selftest.sh
bash scripts/release/verify-public-module-tags.sh
bash scripts/release/verify-doc-public-imports.sh
bash scripts/release/verify-doc-code-snippets.sh
bash scripts/release/verify-doc-shell-snippets.sh
bash scripts/release/verify-doc-structured-snippets.sh
bash scripts/release/verify-doc-tutorial-cli-flows.sh
bash scripts/release/verify-typecheck-public-shims.sh
bash scripts/release/verify-publish-packages.sh
bash scripts/release/verify-cli-package-selftest.sh

echo "[PASS] Release verification completed successfully."
