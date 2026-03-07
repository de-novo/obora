#!/bin/bash

OBORA_SANDBOX_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OBORA_SANDBOX_REPO_ROOT="$(cd "$OBORA_SANDBOX_ROOT/.." && pwd)"
OBORA_SANDBOX_CONFIG="$OBORA_SANDBOX_ROOT/.obora/config.yaml"

run_obora_cli() {
    if command -v obora >/dev/null 2>&1; then
        obora "$@"
        return
    fi

    local local_cli="$OBORA_SANDBOX_REPO_ROOT/packages/cli/dist/index.js"
    if [ -f "$local_cli" ]; then
        node "$local_cli" "$@"
        return
    fi

    echo "Error: obora CLI not found. Install @obora/cli globally or build packages/cli first." >&2
    return 127
}

require_sandbox_env() {
    if [ -z "${ZAI_API_KEY:-}" ]; then
        echo "Error: ZAI_API_KEY is required for sandbox tests." >&2
        echo "Set it before running .sandbox workflows." >&2
        return 2
    fi
}

run_sandbox_workflow() {
    local test_dir="$1"
    shift || true

    require_sandbox_env

    local workflow_path="$test_dir/workflow.yaml"
    local agents_path="$test_dir/agents.yaml"
    local args=(run "$workflow_path" --verbose --config "$OBORA_SANDBOX_CONFIG")

    if [ -f "$agents_path" ]; then
        args+=(--agents "$agents_path")
    fi

    if [ "$#" -gt 0 ]; then
        args+=("$@")
    fi

    run_obora_cli "${args[@]}"
}
