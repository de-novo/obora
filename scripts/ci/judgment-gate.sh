#!/usr/bin/env bash
# judgment-gate.sh — TASK-M1-28
# Standalone CI gate for the judgment module.
# Same checkset used by .github/workflows/judgment-gate.yml
#
# Usage: ./scripts/ci/judgment-gate.sh
# Exit 0 = PASS, non-zero = FAIL with summary report.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS=0
FAIL=0
FAILURES=()

step() {
  local name="$1"
  shift
  printf "${YELLOW}▶ %s${NC}\n" "$name"
  if "$@" 2>&1; then
    printf "${GREEN}✓ %s PASSED${NC}\n\n" "$name"
    ((PASS++))
  else
    printf "${RED}✗ %s FAILED${NC}\n\n" "$name"
    ((FAIL++))
    FAILURES+=("$name")
  fi
}

cd "$ROOT_DIR"

echo "═══════════════════════════════════════════"
echo " Judgment Module CI Gate"
echo "═══════════════════════════════════════════"
echo ""

# --- Check 1: TypeScript type check ---
step "TypeScript type-check" pnpm --filter @obora/runtime exec tsc --noEmit

# --- Check 2: Judgment unit + e2e tests ---
step "Judgment tests" pnpm --filter @obora/runtime exec vitest run --reporter=verbose src/judgment/

# --- Check 3: Build ---
step "Build" pnpm --filter @obora/runtime build

# --- Summary ---
echo ""
echo "═══════════════════════════════════════════"
echo " Gate Summary"
echo "═══════════════════════════════════════════"
printf " Passed: ${GREEN}%d${NC}\n" "$PASS"
printf " Failed: ${RED}%d${NC}\n" "$FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  printf "${RED}FAILED checks:${NC}\n"
  for f in "${FAILURES[@]}"; do
    printf "  - %s\n" "$f"
  done
  echo ""
  echo "Gate: FAIL"
  exit 1
fi

echo ""
echo "Gate: PASS"
exit 0
