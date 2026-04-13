#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source scripts/release/npm-auth.sh
setup_npm_auth
trap cleanup_npm_auth EXIT

PACKAGES=(
  "packages/runtime:@obora/runtime"
  "packages/adapters:@obora/adapters"
  "packages/sdk:@obora/sdk"
  "packages/cli:@obora/cli"
)

echo "[release] cleaning build artifacts"
rm -rf packages/runtime/dist packages/adapters/dist packages/sdk/dist packages/cli/dist

echo "[release] rebuilding publishable packages"
pnpm --filter @obora/runtime build >/dev/null
pnpm --filter @obora/adapters build >/dev/null
pnpm --filter @obora/sdk build >/dev/null
pnpm --filter @obora/cli build >/dev/null

echo "[release] running verification gate"
bash scripts/release/verify-release.sh

echo "[release] publishing packages"
for entry in "${PACKAGES[@]}"; do
  pkg_dir="${entry%%:*}"
  pkg_name="${entry##*:}"
  pkg_version="$(jq -r '.version' "$pkg_dir/package.json")"
  echo "=== publishing ${pkg_name}@${pkg_version} ==="
  (cd "$pkg_dir" && npm publish --access public)
  echo
  echo "[release] published ${pkg_name}@${pkg_version}"
done

echo "[PASS] Publish flow completed successfully."
