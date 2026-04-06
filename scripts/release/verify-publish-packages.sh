#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

PACKAGES=(packages/runtime packages/adapters packages/sdk packages/cli)

for p in "${PACKAGES[@]}"; do
  echo "=== verify $p ==="
  (cd "$p" && npm publish --dry-run --access public >/dev/null)
done

echo "[PASS] All publishable packages passed npm publish --dry-run."
