#!/bin/bash

OBORA_SANDBOX_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OBORA_SANDBOX_REPO_ROOT="$(cd "$OBORA_SANDBOX_ROOT/.." && pwd)"
OBORA_SANDBOX_CONFIG="$OBORA_SANDBOX_ROOT/.obora/config.yaml"
OBORA_GLOBAL_AUTH_JSON="${HOME}/.obora/global-auth.json"

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

has_global_auth() {
    local provider="$1"

    if [ ! -f "$OBORA_GLOBAL_AUTH_JSON" ]; then
        return 1
    fi

    python3 - "$provider" "$OBORA_GLOBAL_AUTH_JSON" <<'PY'
import json, sys
provider = sys.argv[1]
path = sys.argv[2]
try:
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    value = data.get(provider)
    raise SystemExit(0 if isinstance(value, str) and value else 1)
except Exception:
    raise SystemExit(1)
PY
}

provider_auth_available() {
    local provider="$1"

    case "$provider" in
        zai)
            [ -n "${ZAI_API_KEY:-}" ] || has_global_auth zai
            ;;
        openai)
            [ -n "${OPENAI_API_KEY:-}" ] || has_global_auth openai
            ;;
        openai-codex)
            [ -n "${OPENAI_CODEX_API_KEY:-}" ] || has_global_auth openai-codex
            ;;
        anthropic)
            [ -n "${ANTHROPIC_API_KEY:-}" ] || has_global_auth anthropic
            ;;
        *)
            return 1
            ;;
    esac
}

require_provider_auth() {
    local provider="$1"

    if provider_auth_available "$provider"; then
        return 0
    fi

    echo "Error: authentication for provider '$provider' is required for sandbox tests." >&2
    echo "Set the matching env var or configure ~/.obora/global-auth.json." >&2
    return 2
}

run_sandbox_workflow() {
    local test_dir="$1"
    shift || true

    require_provider_auth zai

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
