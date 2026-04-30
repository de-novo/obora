#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null)"
cd "$ROOT_DIR"

if [[ ! -f "pnpm-lock.yaml" || ! -f "package.json" ]]; then
  echo "verify-clean must run from the Obora repository root" >&2
  exit 1
fi

echo "Removing local install, build, and turbo artifacts..."
rm -rf node_modules packages/*/dist .turbo packages/*/.turbo

echo "Installing dependencies from lockfile..."
pnpm install --frozen-lockfile

echo "Running default verification gate..."
pnpm typecheck
pnpm lint
pnpm test
pnpm build
