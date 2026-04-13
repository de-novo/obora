#!/usr/bin/env bash

setup_npm_auth() {
  if [[ -z "${NPM_TOKEN:-}" ]]; then
    echo "[FAIL] NPM_TOKEN is not set." >&2
    return 1
  fi

  if [[ -z "${OBORA_NPM_AUTH_PREVIOUS_USERCONFIG_CAPTURED:-}" ]]; then
    if [[ ${NPM_CONFIG_USERCONFIG+x} ]]; then
      OBORA_NPM_AUTH_PREVIOUS_USERCONFIG="$NPM_CONFIG_USERCONFIG"
      OBORA_NPM_AUTH_PREVIOUS_USERCONFIG_WAS_SET=1
    else
      OBORA_NPM_AUTH_PREVIOUS_USERCONFIG=""
      OBORA_NPM_AUTH_PREVIOUS_USERCONFIG_WAS_SET=0
    fi
    OBORA_NPM_AUTH_PREVIOUS_USERCONFIG_CAPTURED=1
  fi

  cleanup_npm_auth >/dev/null 2>&1 || true

  OBORA_NPM_AUTH_TEMP_USERCONFIG="$(mktemp)"
  chmod 600 "$OBORA_NPM_AUTH_TEMP_USERCONFIG"
  printf '%s\n' "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > "$OBORA_NPM_AUTH_TEMP_USERCONFIG"
  export NPM_CONFIG_USERCONFIG="$OBORA_NPM_AUTH_TEMP_USERCONFIG"
}

cleanup_npm_auth() {
  if [[ -n "${OBORA_NPM_AUTH_TEMP_USERCONFIG:-}" && -f "${OBORA_NPM_AUTH_TEMP_USERCONFIG:-}" ]]; then
    rm -f "$OBORA_NPM_AUTH_TEMP_USERCONFIG"
  fi
  unset OBORA_NPM_AUTH_TEMP_USERCONFIG

  if [[ "${OBORA_NPM_AUTH_PREVIOUS_USERCONFIG_WAS_SET:-0}" == "1" ]]; then
    export NPM_CONFIG_USERCONFIG="$OBORA_NPM_AUTH_PREVIOUS_USERCONFIG"
  else
    unset NPM_CONFIG_USERCONFIG || true
  fi
}
