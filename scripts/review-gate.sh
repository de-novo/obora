#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

capture_env_override() {
  local name="$1"
  if [[ ${!name+x} ]]; then
    printf -v "ENV_OVERRIDE_${name}" '%s' "${!name}"
    printf -v "ENV_OVERRIDE_SET_${name}" '1'
  fi
}

restore_env_override() {
  local name="$1"
  local flag="ENV_OVERRIDE_SET_${name}"
  local value="ENV_OVERRIDE_${name}"
  if [[ ${!flag:-} == "1" ]]; then
    printf -v "$name" '%s' "${!value}"
  fi
}

for var_name in \
  PROJECT_NAME REVIEW_TARGET REVIEW_SCOPE \
  TYPECHECK_CMD TEST_CMD BUILD_CMD RUST_CHECK_CMD SELFTEST_CMD SANDBOX_SMOKE_CMD \
  DEPRECATED_GREP BAN_GREP SCAN_PATHS DEPRECATED_ALLOWLIST_FILE; do
  capture_env_override "$var_name"
done

if [[ -f .review-gate.local.sh ]]; then
  # shellcheck disable=SC1091
  source .review-gate.local.sh
fi

for var_name in \
  PROJECT_NAME REVIEW_TARGET REVIEW_SCOPE \
  TYPECHECK_CMD TEST_CMD BUILD_CMD RUST_CHECK_CMD SELFTEST_CMD SANDBOX_SMOKE_CMD \
  DEPRECATED_GREP BAN_GREP SCAN_PATHS DEPRECATED_ALLOWLIST_FILE; do
  restore_env_override "$var_name"
done

PROJECT_NAME="${PROJECT_NAME:-$(basename "$ROOT_DIR")}"
REVIEW_TARGET="${REVIEW_TARGET:-working-tree}"
REVIEW_SCOPE="${REVIEW_SCOPE:-pre-push}"

TYPECHECK_CMD="${TYPECHECK_CMD:-echo '[skip] TYPECHECK_CMD not set'}"
TEST_CMD="${TEST_CMD:-echo '[skip] TEST_CMD not set'}"
BUILD_CMD="${BUILD_CMD:-echo '[skip] BUILD_CMD not set'}"
RUST_CHECK_CMD="${RUST_CHECK_CMD:-}"
SELFTEST_CMD="${SELFTEST_CMD:-}"

DEPRECATED_GREP="${DEPRECATED_GREP:-cocoa\\s*=|ReactDOM\\.render|findDOMNode\\(|@deprecated}"
BAN_GREP="${BAN_GREP:-\\bas any\\b|@ts-ignore}"
SCAN_PATHS="${SCAN_PATHS:-packages,apps}"
DEFAULT_DEPRECATED_ALLOWLIST_FILE="scripts/review-gate-deprecated-allowlist.txt"
if [[ -z ${DEPRECATED_ALLOWLIST_FILE+x} && -f "$DEFAULT_DEPRECATED_ALLOWLIST_FILE" ]]; then
  DEPRECATED_ALLOWLIST_FILE="$DEFAULT_DEPRECATED_ALLOWLIST_FILE"
fi
DEPRECATED_ALLOWLIST_FILE="${DEPRECATED_ALLOWLIST_FILE:-}"

run_step() {
  local label="$1"
  local cmd="$2"
  echo "\n==> ${label}"
  bash -lc "$cmd"
}

collect_existing_paths() {
  local raw="$1"
  local out=()
  IFS=',' read -r -a candidates <<< "$raw"
  for p in "${candidates[@]}"; do
    p="$(echo "$p" | xargs)"
    [[ -z "$p" ]] && continue
    if [[ -e "$p" ]]; then
      out+=("$p")
    fi
  done

  # Monorepo auto-discovery fallback: include common workspace roots when present
  if [[ ${#out[@]} -eq 0 ]]; then
    for d in packages apps services; do
      if [[ -d "$d" ]]; then
        out+=("$d")
      fi
    done
  fi

  if [[ ${#out[@]} -eq 0 ]]; then
    out+=(".")
  fi
  printf '%s\n' "${out[@]}"
}

echo "[Review Gate]"
echo "project: ${PROJECT_NAME}"
echo "target : ${REVIEW_TARGET}"
echo "scope  : ${REVIEW_SCOPE}"

EFFECTIVE_SCAN_PATHS=()
while IFS= read -r line; do
  EFFECTIVE_SCAN_PATHS+=("$line")
done < <(collect_existing_paths "$SCAN_PATHS")

echo "\n==> Deprecated scan"
DEPRECATED_MATCHES_FILE="$(mktemp)"
DEPRECATED_FILTERED_FILE="$(mktemp)"
trap 'rm -f "$DEPRECATED_MATCHES_FILE" "$DEPRECATED_FILTERED_FILE"' EXIT
if rg -n -S \
  -g '!node_modules' -g '!dist' -g '!**/Cargo.lock' -g '!scripts/**' \
  "$DEPRECATED_GREP" "${EFFECTIVE_SCAN_PATHS[@]}" >"$DEPRECATED_MATCHES_FILE"; then
  if [[ -n "$DEPRECATED_ALLOWLIST_FILE" ]]; then
    if [[ ! -f "$DEPRECATED_ALLOWLIST_FILE" ]]; then
      echo "[FAIL] Deprecated allowlist file not found: $DEPRECATED_ALLOWLIST_FILE"
      exit 1
    fi
    if grep -Evf "$DEPRECATED_ALLOWLIST_FILE" "$DEPRECATED_MATCHES_FILE" >"$DEPRECATED_FILTERED_FILE"; then
      cat "$DEPRECATED_FILTERED_FILE"
      echo "[WARN] Deprecated signals found above. Review required."
    else
      echo "[OK] No deprecated signals found by pattern scan."
    fi
  else
    cat "$DEPRECATED_MATCHES_FILE"
    echo "[WARN] Deprecated signals found above. Review required."
  fi
else
  echo "[OK] No deprecated signals found by pattern scan."
fi

echo "\n==> Ban pattern scan"
if rg -n -S \
  -g '!node_modules' -g '!dist' \
  -g '!**/__tests__/**' -g '!**/*.test.*' \
  -g '!**/_legacy/**' -g '!**/docs/**' \
  "$BAN_GREP" "${EFFECTIVE_SCAN_PATHS[@]}"; then
  echo "[FAIL] Forbidden patterns found (as any / @ts-ignore)."
  exit 1
else
  echo "[OK] No forbidden patterns found."
fi

if [[ -n "$RUST_CHECK_CMD" ]]; then
  run_step "Rust check" "$RUST_CHECK_CMD"
fi
run_step "Typecheck" "$TYPECHECK_CMD"
run_step "Tests" "$TEST_CMD"
if [[ -n "$SELFTEST_CMD" ]]; then
  run_step "Gate selftest" "$SELFTEST_CMD"
fi
if [[ -n "$SANDBOX_SMOKE_CMD" ]]; then
  run_step "Sandbox smoke" "$SANDBOX_SMOKE_CMD"
fi
run_step "Build" "$BUILD_CMD"

echo "\n[PASS] Review gate completed successfully."
