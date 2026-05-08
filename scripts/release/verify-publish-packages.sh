#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

PACKAGES=(packages/runtime packages/adapters packages/sdk packages/cli)
TMP_DIR="$(mktemp -d)"
PACK_DIR="$TMP_DIR/tarballs"
SMOKE_DIR="$TMP_DIR/smoke"
export NPM_CONFIG_CACHE="$TMP_DIR/npm-cache"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$PACK_DIR" "$SMOKE_DIR" "$NPM_CONFIG_CACHE"

max_packed_bytes() {
  case "$1" in
    packages/runtime) echo 5500000 ;;
    packages/adapters) echo 9000000 ;;
    packages/sdk) echo 1000000 ;;
    packages/cli) echo 250000 ;;
    *) echo 0 ;;
  esac
}

for p in "${PACKAGES[@]}"; do
  echo "=== verify $p ==="
  max_bytes="$(max_packed_bytes "$p")"
  payload_json="$(cd "$p" && npm pack --dry-run --json)"
  printf '%s' "$payload_json" | node -e '
const fs = require("node:fs");
const pkgDir = process.argv[1];
const maxPackedBytes = Number(process.argv[2] ?? 0);
const payload = JSON.parse(fs.readFileSync(0, "utf8"))[0];
const files = payload.files.map((file) => file.path);
const forbidden = files.filter((path) => /(^|\/)__tests__\/|\.test\.|-e2e\.test\./.test(path));
if (forbidden.length > 0) {
  console.error(`[FAIL] ${pkgDir} publish payload includes test artifacts:`);
  for (const path of forbidden) console.error(`  - ${path}`);
  process.exit(1);
}
const sourceMaps = files.filter((path) => path.endsWith(".map"));
if (sourceMaps.length > 0) {
  console.error(`[FAIL] ${pkgDir} publish payload includes source maps:`);
  sourceMaps.forEach((path) => console.error(`  - ${path}`));
  process.exit(1);
}
if (!files.includes("package.json")) {
  console.error(`[FAIL] ${pkgDir} publish payload is missing package.json`);
  process.exit(1);
}
if (!files.some((path) => path.startsWith("dist/"))) {
  console.error(`[FAIL] ${pkgDir} publish payload is missing dist output`);
  process.exit(1);
}
if (pkgDir === "packages/cli" && !files.includes("bin/obora.js")) {
  console.error("[FAIL] packages/cli publish payload is missing bin/obora.js");
  process.exit(1);
}
if (maxPackedBytes > 0 && payload.size > maxPackedBytes) {
  console.error(`[FAIL] ${pkgDir} publish payload is ${payload.size} bytes, exceeding the ${maxPackedBytes} byte budget.`);
  process.exit(1);
}
console.log(`[PASS] ${pkgDir} payload: ${files.length} files, ${payload.size} bytes packed.`);
const topFiles = [...payload.files]
  .sort((left, right) => right.size - left.size)
  .slice(0, 5)
  .map((file) => `${file.path}=${file.size}B`)
  .join(", ");
console.log(`[INFO] ${pkgDir} largest packed files: ${topFiles}`);
' "$p" "$max_bytes"

  tarball_path="$(cd "$p" && pnpm pack --pack-destination "$PACK_DIR")"
  printf '%s\n' "$tarball_path" | node -e '
const fs = require("node:fs");
const path = require("node:path");
const pkgDir = process.argv[1];
const packDir = process.argv[2];
const tarballPath = fs.readFileSync(0, "utf8").trim();
const resolvedTarballPath = path.isAbsolute(tarballPath)
  ? tarballPath
  : path.resolve(pkgDir, tarballPath);

if (!resolvedTarballPath.startsWith(path.resolve(packDir) + path.sep)) {
  console.error(`[FAIL] ${pkgDir} pnpm pack wrote outside the temporary pack directory: ${resolvedTarballPath}`);
  process.exit(1);
}

console.log(resolvedTarballPath);
' "$p" "$PACK_DIR" > "$TMP_DIR/${p//\//-}.tarball"

  tarball="$(cat "$TMP_DIR/${p//\//-}.tarball")"
  LC_ALL=POSIX tar -xOf "$tarball" package/package.json | node -e '
const fs = require("node:fs");
const pkgDir = process.argv[1];
const pkg = JSON.parse(fs.readFileSync(0, "utf8"));
const dependencySections = ["dependencies", "optionalDependencies", "peerDependencies"];

for (const section of dependencySections) {
  for (const [name, version] of Object.entries(pkg[section] ?? {})) {
    if (typeof version === "string" && version.startsWith("workspace:")) {
      console.error(`[FAIL] ${pkg.name} ${section}.${name} still uses ${version} in the pnpm-packed package.json`);
      process.exit(1);
    }
  }
}

const requiredExports = {
  "packages/runtime": ["./storage"],
  "packages/adapters": ["./llm", "./tools", "./auth", "./testing"],
  "packages/sdk": ["./testing"],
  "packages/cli": [],
}[pkgDir] ?? [];

for (const exportName of requiredExports) {
  if (!pkg.exports || !Object.prototype.hasOwnProperty.call(pkg.exports, exportName)) {
    console.error(`[FAIL] ${pkg.name} package.json is missing export ${exportName}`);
    process.exit(1);
  }
}

console.log(`[PASS] ${pkg.name} pnpm pack metadata is release-safe.`);
' "$p"
done

cd "$SMOKE_DIR"
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

link_node_modules "$ROOT_DIR/node_modules"
link_node_modules "$ROOT_DIR/packages/runtime/node_modules"
link_node_modules "$ROOT_DIR/packages/adapters/node_modules"
link_node_modules "$ROOT_DIR/packages/sdk/node_modules"
link_node_modules "$ROOT_DIR/packages/cli/node_modules"

for tarball in "$PACK_DIR"/*.tgz; do
  package_name="$(LC_ALL=POSIX tar -xOf "$tarball" package/package.json | node -e 'const fs = require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(0, "utf8")).name);')"
  package_dir="node_modules/$package_name"
  mkdir -p "$package_dir"
  LC_ALL=POSIX tar -xzf "$tarball" -C "$package_dir" --strip-components=1 package
done

node --input-type=module <<'EOF'
const imports = [
  ["@obora/runtime", "@obora/runtime"],
  ["@obora/runtime/storage", "@obora/runtime/storage"],
  ["@obora/adapters", "@obora/adapters"],
  ["@obora/adapters/llm", "@obora/adapters/llm"],
  ["@obora/adapters/tools", "@obora/adapters/tools"],
  ["@obora/adapters/auth", "@obora/adapters/auth"],
  ["@obora/adapters/testing", "@obora/adapters/testing"],
  ["@obora/sdk", "@obora/sdk"],
  ["@obora/sdk/testing", "@obora/sdk/testing"],
];

for (const [label, specifier] of imports) {
  try {
    await import(specifier);
  } catch (error) {
    console.error(`[FAIL] publish smoke import failed for ${label}`);
    console.error(error?.stack ?? error);
    process.exit(1);
  }
}

console.log("[PASS] Published package import smoke checks passed.");
EOF

node <<'EOF'
const requires = [
  ["@obora/runtime", "@obora/runtime"],
  ["@obora/runtime/storage", "@obora/runtime/storage"],
  ["@obora/adapters", "@obora/adapters"],
  ["@obora/adapters/llm", "@obora/adapters/llm"],
  ["@obora/adapters/tools", "@obora/adapters/tools"],
  ["@obora/adapters/auth", "@obora/adapters/auth"],
  ["@obora/adapters/testing", "@obora/adapters/testing"],
  ["@obora/sdk", "@obora/sdk"],
  ["@obora/sdk/testing", "@obora/sdk/testing"],
];

for (const [label, specifier] of requires) {
  try {
    require(specifier);
  } catch (error) {
    console.error(`[FAIL] publish smoke require failed for ${label}`);
    console.error(error?.stack ?? error);
    process.exit(1);
  }
}

console.log("[PASS] Published package require smoke checks passed.");
EOF

cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM"]
  },
  "files": ["index.mts"]
}
EOF

cat > index.mts <<'EOF'
import { z } from "zod";
import {
  OboraRuntime,
  defineSchemaTool,
  defineTool,
  defineWorkflow,
  type RuntimeExecution,
  type TypedRunHandle,
  type TypedRunOptions,
} from "@obora/sdk";
import { MockAgent } from "@obora/sdk/testing";

const workflow = defineWorkflow({
  name: "release-smoke",
  variables: { topic: "release" },
  steps: [{ name: "plan", agent: "assistant", input: { task: "Plan release" } }],
});

const runtime = new OboraRuntime();
runtime.define(workflow.name, workflow);
runtime.registerAgent("assistant", () => ({ role: "Assistant" }));

const options: TypedRunOptions<{ topic: string }> = { input: { topic: "release" } };
const handlePromise = runtime.run<{ topic: string }, { plan: string }>(workflow.name, options);
type Execution = RuntimeExecution<{ topic: string }, { plan: string }>;
const waitForExecution = async (
  handle: TypedRunHandle<{ topic: string }, { plan: string }>
): Promise<Execution> => handle.wait();

const schemaTool = defineSchemaTool(
  z.object({ topic: z.string() }),
  async (params) => params.topic,
  { name: "topic" }
);
const identityTool = defineTool<{ value: string }, undefined, string>(
  async (params) => params.value
);

void handlePromise;
void waitForExecution;
void schemaTool;
void identityTool;
void MockAgent;
EOF

"$ROOT_DIR/node_modules/.bin/tsc" --project tsconfig.json
echo "[PASS] Published package TypeScript smoke checks passed."

echo "[PASS] All publishable packages passed npm pack --dry-run payload checks."
