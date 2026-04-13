#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source scripts/release/npm-auth.sh

ORIGINAL_USERCONFIG="${NPM_CONFIG_USERCONFIG-__unset__}"

# 1) setup fails when NPM_TOKEN is missing
unset NPM_TOKEN || true
if setup_npm_auth >/dev/null 2>&1; then
  echo "[FAIL] expected setup_npm_auth to fail when NPM_TOKEN is missing"
  exit 1
fi

# 2) setup creates isolated userconfig with literal token value
export NPM_TOKEN="test-token"
setup_npm_auth
if [[ -z "${NPM_CONFIG_USERCONFIG:-}" ]]; then
  echo "[FAIL] expected NPM_CONFIG_USERCONFIG to be set"
  exit 1
fi
if [[ ! -f "$NPM_CONFIG_USERCONFIG" ]]; then
  echo "[FAIL] expected temp userconfig file to exist"
  exit 1
fi
if ! grep -Fq '//registry.npmjs.org/:_authToken=test-token' "$NPM_CONFIG_USERCONFIG"; then
  echo "[FAIL] expected temp userconfig to contain concrete token"
  cat "$NPM_CONFIG_USERCONFIG"
  exit 1
fi

TMP_USERCONFIG="$NPM_CONFIG_USERCONFIG"
cleanup_npm_auth
if [[ -f "$TMP_USERCONFIG" ]]; then
  echo "[FAIL] expected cleanup_npm_auth to remove temp userconfig"
  exit 1
fi
if [[ "$ORIGINAL_USERCONFIG" == "__unset__" ]]; then
  if [[ -n "${NPM_CONFIG_USERCONFIG:-}" ]]; then
    echo "[FAIL] expected NPM_CONFIG_USERCONFIG to be unset after cleanup"
    exit 1
  fi
else
  if [[ "${NPM_CONFIG_USERCONFIG:-}" != "$ORIGINAL_USERCONFIG" ]]; then
    echo "[FAIL] expected NPM_CONFIG_USERCONFIG to be restored after cleanup"
    exit 1
  fi
fi

echo "[PASS] npm auth selftest passed"
