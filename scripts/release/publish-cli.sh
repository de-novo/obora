#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

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

is_dry_run() {
  case "${PUBLISH_DRY_RUN:-0}" in
    1|true|TRUE|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
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
      echo "[release-cli] dry-run reached npm version check; ${pkg_name}@${pkg_version} is already published."
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

PUBLISH_ARGS=(--access public)
if is_dry_run; then
  echo "[release-cli] dry-run mode enabled; package will not be published to npm"
  PUBLISH_ARGS+=(--dry-run)
else
  # shellcheck disable=SC1091
  source scripts/release/npm-auth.sh
  setup_npm_auth
  NPM_AUTH_CONFIGURED=1
fi

echo "[release-cli] cleaning CLI dist"
rm -rf packages/cli/dist

echo "[release-cli] rebuilding CLI"
pnpm --filter @obora/cli build >/dev/null

echo "[release-cli] verifying changelog"
bash scripts/release/verify-changelog.sh

echo "[release-cli] verifying CLI package"
bash scripts/release/verify-cli-package.sh

pkg_version="$(read_package_json_field packages/cli version)"
tarball="$(pack_package packages/cli)"
echo "=== publishing @obora/cli@${pkg_version} ==="
run_publish "$tarball" @obora/cli "$pkg_version"

echo "[PASS] CLI publish completed successfully."
