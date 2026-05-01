#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

PACKAGES=(packages/runtime packages/adapters packages/sdk packages/cli)
TMP_DIR="$(mktemp -d)"
PACK_DIR="$TMP_DIR/tarballs"
SMOKE_DIR="$TMP_DIR/smoke"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$PACK_DIR" "$SMOKE_DIR"

for p in "${PACKAGES[@]}"; do
  echo "=== verify $p ==="
  payload_json="$(cd "$p" && npm pack --dry-run --json)"
  printf '%s' "$payload_json" | node -e '
const fs = require("node:fs");
const pkgDir = process.argv[1];
const payload = JSON.parse(fs.readFileSync(0, "utf8"))[0];
const files = payload.files.map((file) => file.path);
const forbidden = files.filter((path) => /(^|\/)__tests__\/|\.test\.|-e2e\.test\./.test(path));
if (forbidden.length > 0) {
  console.error(`[FAIL] ${pkgDir} publish payload includes test artifacts:`);
  for (const path of forbidden) console.error(`  - ${path}`);
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
console.log(`[PASS] ${pkgDir} payload: ${files.length} files, ${payload.size} bytes packed.`);
' "$p"

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
  LC_ALL=C tar -xOf "$tarball" package/package.json | node -e '
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
npm init -y >/dev/null 2>&1
npm install "$PACK_DIR"/*.tgz >/dev/null 2>&1

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

echo "[PASS] All publishable packages passed npm pack --dry-run payload checks."
