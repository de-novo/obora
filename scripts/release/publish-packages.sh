#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

PACKAGES=(
  "packages/runtime:@obora/runtime"
  "packages/adapters:@obora/adapters"
  "packages/sdk:@obora/sdk"
  "packages/cli:@obora/cli"
)
TMP_DIR="$(mktemp -d)"
PACK_DIR="$TMP_DIR/tarballs"
NPM_AUTH_CONFIGURED=0

cleanup() {
  rm -rf "$TMP_DIR"
  if [[ "$NPM_AUTH_CONFIGURED" == "1" ]]; then
    cleanup_npm_auth
  fi
}
trap cleanup EXIT

mkdir -p "$PACK_DIR"

read_package_json_field() {
  node -e '
const fs = require("node:fs");
const [file, field] = process.argv.slice(1);
const value = JSON.parse(fs.readFileSync(file, "utf8"))[field];
if (typeof value !== "string") {
  console.error(`[FAIL] ${file} field ${field} must be a string`);
  process.exit(1);
}
console.log(value);
' "$1/package.json" "$2"
}

is_truthy() {
  case "${1:-0}" in
    1|true|TRUE|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

is_dry_run() {
  is_truthy "${PUBLISH_DRY_RUN:-0}"
}

run_publish() {
  local tarball="$1"
  local pkg_name="$2"
  local pkg_version="$3"
  local log_file
  local status

  log_file="$(mktemp)"
  status=0
  npm publish "$tarball" "${PUBLISH_ARGS[@]}" >"$log_file" 2>&1 || status=$?
  cat "$log_file"

  if (( status != 0 )); then
    if is_dry_run && grep -Fq "previously published versions" "$log_file"; then
      echo "[release] dry-run reached npm version check; ${pkg_name}@${pkg_version} is already published."
      rm -f "$log_file"
      return 0
    fi
    rm -f "$log_file"
    return "$status"
  fi

  rm -f "$log_file"
}

pack_package() {
  local pkg_dir="$1"
  local tarball_path

  tarball_path="$(cd "$pkg_dir" && pnpm pack --pack-destination "$PACK_DIR")"
  printf '%s\n' "$tarball_path" | node -e '
const fs = require("node:fs");
const path = require("node:path");
const pkgDir = process.argv[1];
const packDir = process.argv[2];
const tarballPath = fs.readFileSync(0, "utf8").trim();
const resolvedTarballPath = path.isAbsolute(tarballPath)
  ? tarballPath
  : path.resolve(pkgDir, tarballPath);
if (!resolvedTarballPath.startsWith(path.resolve(packDir) + path.sep)) {
  console.error(`[FAIL] pnpm pack wrote outside the temporary pack directory: ${resolvedTarballPath}`);
  process.exit(1);
}
console.log(resolvedTarballPath);
' "$pkg_dir" "$PACK_DIR"
}

PUBLISH_DIST_TAG="${PUBLISH_DIST_TAG:-latest}"
if [[ ! "$PUBLISH_DIST_TAG" =~ ^[A-Za-z][A-Za-z0-9._-]{0,63}$ ]]; then
  echo "[FAIL] PUBLISH_DIST_TAG must start with a letter and contain only letters, numbers, dot, underscore, or dash: $PUBLISH_DIST_TAG" >&2
  exit 1
fi

if [[ -n "${RELEASE_TAG:-}" ]]; then
  node scripts/release/verify-release-tag.mjs "$RELEASE_TAG"
elif ! is_dry_run; then
  echo "[FAIL] RELEASE_TAG is required for live publish. Use RELEASE_TAG=v<package-version>." >&2
  exit 1
fi

PUBLISH_ARGS=(--access public --tag "$PUBLISH_DIST_TAG")
echo "[release] npm dist-tag: $PUBLISH_DIST_TAG"
if is_dry_run; then
  echo "[release] dry-run mode enabled; packages will not be published to npm"
  PUBLISH_ARGS+=(--dry-run)
else
  if is_truthy "${PUBLISH_PROVENANCE:-0}"; then
    echo "[release] npm provenance enabled"
    PUBLISH_ARGS+=(--provenance)
  fi
  # shellcheck disable=SC1091
  source scripts/release/npm-auth.sh
  setup_npm_auth
  NPM_AUTH_CONFIGURED=1
fi

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
  pkg_version="$(read_package_json_field "$pkg_dir" version)"
  tarball="$(pack_package "$pkg_dir")"
  echo "=== publishing ${pkg_name}@${pkg_version} ==="
  run_publish "$tarball" "$pkg_name" "$pkg_version"
  echo
  if is_dry_run; then
    echo "[release] dry-run completed for ${pkg_name}@${pkg_version}"
  else
    echo "[release] published ${pkg_name}@${pkg_version}"
  fi
done

echo "[PASS] Publish flow completed successfully."
