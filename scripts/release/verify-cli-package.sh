#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

PKG_DIR="packages/cli"
TMP_DIR="$(mktemp -d)"
PACK_DIR="$TMP_DIR/tarballs"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT
mkdir -p "$PACK_DIR"

read_package_json_field() {
  node -e '
const fs = require("node:fs");
const [file, field] = process.argv.slice(1);
const value = JSON.parse(fs.readFileSync(file, "utf8"))[field];
if (typeof value !== "string") {
  console.error(`[FAIL] ${file} field ${field} must be a string`);
  process.exit(1);
}
console.log(value);
' "$1/package.json" "$2"
}

EXPECTED_VERSION="$(read_package_json_field "$PKG_DIR" version)"

pack_local_tarball() {
  local pkg_dir="$1"
  local pkg_name
  local pkg_version
  local tarball_base

  pkg_name="$(read_package_json_field "$pkg_dir" name)"
  pkg_version="$(read_package_json_field "$pkg_dir" version)"
  tarball_base="${pkg_name#@}"
  tarball_base="${tarball_base//\//-}"

  (cd "$pkg_dir" && pnpm pack --pack-destination "$PACK_DIR" >/dev/null)
  printf '%s/%s-%s.tgz\n' "$PACK_DIR" "$tarball_base" "$pkg_version"
}

echo "[verify-cli-package] expected version: $EXPECTED_VERSION"

RUNTIME_TARBALL="$(pack_local_tarball packages/runtime)"
ADAPTERS_TARBALL="$(pack_local_tarball packages/adapters)"
SDK_TARBALL="$(pack_local_tarball packages/sdk)"
CLI_TARBALL="$(pack_local_tarball "$PKG_DIR")"

echo "[verify-cli-package] tarball: $CLI_TARBALL"

cd "$TMP_DIR"
cat > package.json <<'EOF'
{
  "private": true,
  "type": "module"
}
EOF

mkdir -p node_modules/@obora

link_node_modules() {
  local source_dir="$1"
  [[ -d "$source_dir" ]] || return 0

  find "$source_dir" -mindepth 1 -maxdepth 1 ! -name "@obora" | while IFS= read -r entry; do
    local entry_name
    entry_name="$(basename "$entry")"

    if [[ "$entry_name" == @* && -d "$entry" ]]; then
      mkdir -p "node_modules/$entry_name"
      find "$entry" -mindepth 1 -maxdepth 1 | while IFS= read -r scoped_entry; do
        local scoped_name
        scoped_name="$(basename "$scoped_entry")"
        local scoped_dest="node_modules/$entry_name/$scoped_name"
        [[ -e "$scoped_dest" ]] || ln -s "$scoped_entry" "$scoped_dest"
      done
    else
      local dest="node_modules/$entry_name"
      [[ -e "$dest" ]] || ln -s "$entry" "$dest"
    fi
  done
}

extract_tarball() {
  local tarball="$1"
  local package_name
  local package_dir

  package_name="$(LC_ALL=POSIX tar -xOf "$tarball" package/package.json | node -e 'const fs = require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(0, "utf8")).name);')"
  package_dir="node_modules/$package_name"
  mkdir -p "$package_dir"
  LC_ALL=POSIX tar -xzf "$tarball" -C "$package_dir" --strip-components=1 package
}

link_node_modules "$ROOT_DIR/node_modules"
link_node_modules "$ROOT_DIR/packages/runtime/node_modules"
link_node_modules "$ROOT_DIR/packages/adapters/node_modules"
link_node_modules "$ROOT_DIR/packages/sdk/node_modules"
link_node_modules "$ROOT_DIR/packages/cli/node_modules"

extract_tarball "$RUNTIME_TARBALL"
extract_tarball "$ADAPTERS_TARBALL"
extract_tarball "$SDK_TARBALL"
extract_tarball "$CLI_TARBALL"

OBORA_BIN="node_modules/@obora/cli/bin/obora.js"

ACTUAL_VERSION="$(node "$OBORA_BIN" --version | tail -1 | tr -d '\r')"
if [[ "$ACTUAL_VERSION" != "$EXPECTED_VERSION" ]]; then
  echo "[FAIL] CLI version mismatch: expected $EXPECTED_VERSION but got $ACTUAL_VERSION"
  exit 1
fi

node "$OBORA_BIN" --help >/dev/null 2>&1

echo "[verify-cli-package] installed CLI JSON command smoke"

node "$OBORA_BIN" --json models > models.json
node "$OBORA_BIN" models openai --json > models-openai.json
node "$OBORA_BIN" --json agents list > agents-list.json
node "$OBORA_BIN" quickstart package-smoke --json > quickstart.json
node "$OBORA_BIN" --json validate package-smoke/judge.yaml > quickstart-validate.json

node <<'EOF'
const fs = require("node:fs");

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`[FAIL] ${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
};

const assert = (condition, message) => {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
};

const models = readJson("models.json");
assert(models.source === "pi-ai", "models JSON must report the pi-ai catalog source");
assert(Array.isArray(models.providers) && models.providers.length > 0, "models JSON must include providers");
assert(
  models.guidance?.nextStep === "obora models <provider> [query]",
  "models JSON must include the provider/query next step"
);

const openaiModels = readJson("models-openai.json");
assert(openaiModels.source === "pi-ai", "provider models JSON must report the pi-ai catalog source");
assert(openaiModels.provider === "openai", "provider models JSON must preserve the requested provider");
assert(openaiModels.count > 0, "provider models JSON must include at least one model");
assert(
  Array.isArray(openaiModels.models) && openaiModels.models.length === openaiModels.count,
  "provider models JSON count must match the models array"
);

const agents = readJson("agents-list.json");
assert(agents.command === "agents list", "agents list JSON must identify the command");
assert(Array.isArray(agents.agents), "agents list JSON must include an agents array");
assert(
  agents.agents.some((agent) => agent.name === "default" && agent.status === "resolved"),
  "agents list JSON must include the default resolved agent in an empty install smoke project"
);

const quickstart = readJson("quickstart.json");
assert(quickstart.initialized === true, "quickstart JSON must report initialized=true");
assert(quickstart.template === "quickstart", "quickstart JSON must report the quickstart template");
assert(fs.existsSync("package-smoke/judge.yaml"), "quickstart must create judge.yaml from the packed template");

const validation = readJson("quickstart-validate.json");
assert(validation.summary?.failed === 0, "quickstart validate JSON must have zero failed files");
assert(validation.summary?.passed === 1, "quickstart validate JSON must have one passed file");
EOF

echo "[PASS] CLI install and execution checks passed."
