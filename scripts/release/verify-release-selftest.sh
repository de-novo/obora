#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

if ! grep -Fq 'bash scripts/release/npm-auth-selftest.sh' scripts/release/verify-release.sh; then
  echo "[FAIL] expected verify-release.sh to run npm auth selftest"
  exit 1
fi

if ! grep -Fq 'bash scripts/release/verify-cli-package-selftest.sh' scripts/release/verify-release.sh; then
  echo "[FAIL] expected verify-release.sh to run CLI package selftest"
  exit 1
fi

if ! grep -Fq 'bash scripts/release/verify-public-module-tags.sh' scripts/release/verify-release.sh; then
  echo "[FAIL] expected verify-release.sh to run public module tag verification"
  exit 1
fi

if ! grep -Fq 'bash scripts/release/verify-doc-public-imports.sh' scripts/release/verify-release.sh; then
  echo "[FAIL] expected verify-release.sh to run docs public import verification"
  exit 1
fi

if ! grep -Fq 'bash scripts/release/verify-doc-code-snippets.sh' scripts/release/verify-release.sh; then
  echo "[FAIL] expected verify-release.sh to run docs TypeScript snippet verification"
  exit 1
fi

if ! grep -Fq 'bash scripts/release/verify-doc-shell-snippets.sh' scripts/release/verify-release.sh; then
  echo "[FAIL] expected verify-release.sh to run docs shell snippet verification"
  exit 1
fi

if ! grep -Fq 'bash scripts/release/verify-doc-structured-snippets.sh' scripts/release/verify-release.sh; then
  echo "[FAIL] expected verify-release.sh to run docs structured snippet verification"
  exit 1
fi

if ! grep -Fq 'bash scripts/release/verify-doc-tutorial-cli-flows.sh' scripts/release/verify-release.sh; then
  echo "[FAIL] expected verify-release.sh to run tutorial CLI flow verification"
  exit 1
fi

echo "[PASS] verify release selftest passed"
