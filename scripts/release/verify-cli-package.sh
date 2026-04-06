#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

PKG_DIR="packages/cli"
EXPECTED_VERSION="$(jq -r '.version' "$PKG_DIR/package.json")"
TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

echo "[verify-cli-package] expected version: $EXPECTED_VERSION"

(cd "$PKG_DIR" && npm pack >/dev/null)
TARBALL="$(ls "$PKG_DIR"/*.tgz | tail -1)"

echo "[verify-cli-package] tarball: $TARBALL"

cd "$TMP_DIR"
npm init -y >/dev/null 2>&1
npm install "$ROOT_DIR/$TARBALL" >/dev/null 2>&1

ACTUAL_VERSION="$(npx obora --version | tail -1 | tr -d '\r')"
if [[ "$ACTUAL_VERSION" != "$EXPECTED_VERSION" ]]; then
  echo "[FAIL] CLI version mismatch: expected $EXPECTED_VERSION but got $ACTUAL_VERSION"
  exit 1
fi

npx obora --help >/dev/null 2>&1

echo "[PASS] CLI install and execution checks passed."
