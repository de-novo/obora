#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

PACKAGES=(packages/runtime packages/adapters packages/sdk packages/cli)

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
done

echo "[PASS] All publishable packages passed npm pack --dry-run payload checks."
