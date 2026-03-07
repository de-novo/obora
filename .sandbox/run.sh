#!/bin/bash
# Run individual sandbox test

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

resolve_test_dir() {
    local requested="$1"

    if [ -d "$SCRIPT_DIR/$requested" ]; then
        printf '%s\n' "$SCRIPT_DIR/$requested"
        return 0
    fi

    local matches=()
    while IFS= read -r dir; do
        matches+=("$dir")
    done < <(find "$SCRIPT_DIR" -maxdepth 1 -mindepth 1 -type d -name "${requested}-*" | sort)

    if [ "${#matches[@]}" -eq 1 ]; then
        printf '%s\n' "${matches[0]}"
        return 0
    fi

    return 1
}

if [ "$#" -eq 0 ]; then
    echo "Usage: $0 <test-case>"
    echo ""
    echo "Available test cases:"
    find "$SCRIPT_DIR" -maxdepth 1 -mindepth 1 -type d -name '[0-9]*' -exec basename {} \; | sort | while read -r dir; do
        echo "  - $dir"
    done
    exit 1
fi

TEST_CASE="$1"
shift || true

if ! TEST_DIR="$(resolve_test_dir "$TEST_CASE")"; then
    echo "Error: Test case '$TEST_CASE' not found"
    echo "Try one of:"
    find "$SCRIPT_DIR" -maxdepth 1 -mindepth 1 -type d -name '[0-9]*' -exec basename {} \; | sort | sed 's/^/  - /'
    exit 1
fi

cd "$TEST_DIR"

if [ -f "run.sh" ]; then
    bash run.sh "$@"
else
    source "$SCRIPT_DIR/common.sh"
    run_sandbox_workflow "$TEST_DIR" "$@"
fi
