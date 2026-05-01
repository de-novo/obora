#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

PKG_DIR="packages/cli"
TMP_DIR="$(mktemp -d)"
PACK_DIR="$TMP_DIR/tarballs"
cleanup() { rm -rf "$TMP_DIR"; }
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

EXPECTED_VERSION="$(read_package_json_field "$PKG_DIR" version)"

pack_local_tarball() {
  local pkg_dir="$1"
  local pkg_name
  local pkg_version
  local tarball_base

  pkg_name="$(read_package_json_field "$pkg_dir" name)"
  pkg_version="$(read_package_json_field "$pkg_dir" version)"
  tarball_base="${pkg_name#@}"
  tarball_base="${tarball_base//\//-}"

  (cd "$pkg_dir" && pnpm pack --pack-destination "$PACK_DIR" >/dev/null)
  printf '%s/%s-%s.tgz\n' "$PACK_DIR" "$tarball_base" "$pkg_version"
}

echo "[verify-cli-package] expected version: $EXPECTED_VERSION"

RUNTIME_TARBALL="$(pack_local_tarball packages/runtime)"
ADAPTERS_TARBALL="$(pack_local_tarball packages/adapters)"
SDK_TARBALL="$(pack_local_tarball packages/sdk)"
CLI_TARBALL="$(pack_local_tarball "$PKG_DIR")"

echo "[verify-cli-package] tarball: $CLI_TARBALL"

cd "$TMP_DIR"
npm init -y >/dev/null 2>&1
npm install "$RUNTIME_TARBALL" "$ADAPTERS_TARBALL" "$SDK_TARBALL" "$CLI_TARBALL" >/dev/null 2>&1

ACTUAL_VERSION="$(npx obora --version | tail -1 | tr -d '\r')"
if [[ "$ACTUAL_VERSION" != "$EXPECTED_VERSION" ]]; then
  echo "[FAIL] CLI version mismatch: expected $EXPECTED_VERSION but got $ACTUAL_VERSION"
  exit 1
fi

npx obora --help >/dev/null 2>&1

echo "[PASS] CLI install and execution checks passed."
