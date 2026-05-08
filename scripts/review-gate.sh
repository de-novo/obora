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

scan_pattern() {
  local pattern="$1"
  local scan_kind="$2"
  shift 2

  python3 - "$pattern" "$scan_kind" "$@" <<'PY'
import re
import sys
from pathlib import Path

pattern = sys.argv[1]
scan_kind = sys.argv[2]
roots = [Path(arg) for arg in sys.argv[3:]]
flags = 0 if any(char.isupper() for char in pattern) else re.IGNORECASE

try:
    regex = re.compile(pattern, flags)
except re.error as error:
    print(f'[FAIL] Invalid scan regex: {error}', file=sys.stderr)
    raise SystemExit(2)


def iter_files(root: Path):
    if root.is_file():
        yield root
        return
    if not root.exists():
        return
    for path in root.rglob('*'):
        if path.is_file():
            yield path


def is_excluded(path: Path) -> bool:
    rel = path
    try:
        rel = path.relative_to(Path.cwd())
    except ValueError:
        pass

    parts = rel.parts
    if (
        '.git' in parts
        or 'node_modules' in parts
        or 'dist' in parts
        or 'coverage' in parts
        or '.coverage' in parts
    ):
        return True

    if scan_kind == 'deprecated':
        return rel.name == 'Cargo.lock' or (len(parts) > 0 and parts[0] == 'scripts')

    if scan_kind == 'ban':
        return (
            '__tests__' in parts
            or '_legacy' in parts
            or 'docs' in parts
            or '.test.' in rel.name
        )

    return False


matched = False
for root in roots:
    for path in iter_files(root):
        if is_excluded(path):
            continue
        try:
            lines = path.read_text(errors='ignore').splitlines()
        except OSError:
            continue
        display_path = path.as_posix()
        for line_no, line in enumerate(lines, start=1):
            if regex.search(line):
                matched = True
                print(f'{display_path}:{line_no}:{line}')

raise SystemExit(0 if matched else 1)
PY
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
deprecated_scan_status=0
scan_pattern "$DEPRECATED_GREP" deprecated "${EFFECTIVE_SCAN_PATHS[@]}" >"$DEPRECATED_MATCHES_FILE" || deprecated_scan_status=$?
if (( deprecated_scan_status == 0 )); then
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
elif (( deprecated_scan_status == 1 )); then
  echo "[OK] No deprecated signals found by pattern scan."
else
  exit "$deprecated_scan_status"
fi

echo "\n==> Ban pattern scan"
ban_scan_status=0
scan_pattern "$BAN_GREP" ban "${EFFECTIVE_SCAN_PATHS[@]}" || ban_scan_status=$?
if (( ban_scan_status == 0 )); then
  echo "[FAIL] Forbidden patterns found (as any / @ts-ignore)."
  exit 1
elif (( ban_scan_status == 1 )); then
  echo "[OK] No forbidden patterns found."
else
  exit "$ban_scan_status"
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
