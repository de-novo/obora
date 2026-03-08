#!/bin/bash
# Test 12: Reddit Clone Modern Repair Loop
# Expected: Obora generates a modern app, validates it, repairs from logs, and re-validates in a feedback loop

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

require_provider_auth zai

APP_DIR="$SCRIPT_DIR/app"
ARTIFACT_DIR="$SCRIPT_DIR/artifacts"
OUTPUT_DIR="$SCRIPT_DIR/output"
PREVIEW_LOG="$SCRIPT_DIR/.preview.log"
MAX_REPAIRS=3

cleanup() {
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

validate_generated_app() {
  local attempt="$1"
  local port="$2"
  local log_path="$ARTIFACT_DIR/VALIDATION-ATTEMPT-$(printf '%02d' "$attempt").log"
  rm -f "$PREVIEW_LOG"

  if ATTEMPT="$attempt" APP_DIR="$APP_DIR" SERVER_PORT="$port" PREVIEW_LOG="$PREVIEW_LOG" bash <<'EOF' >"$log_path" 2>&1
set -euo pipefail

required_files=(
  "$APP_DIR/package.json"
  "$APP_DIR/tsconfig.json"
  "$APP_DIR/tsconfig.app.json"
  "$APP_DIR/tsconfig.node.json"
  "$APP_DIR/vite.config.ts"
  "$APP_DIR/index.html"
  "$APP_DIR/src/main.tsx"
  "$APP_DIR/src/App.tsx"
  "$APP_DIR/src/vite-env.d.ts"
  "$APP_DIR/src/types.ts"
  "$APP_DIR/src/data/seed.ts"
  "$APP_DIR/src/components/Sidebar.tsx"
  "$APP_DIR/src/components/PostCard.tsx"
  "$APP_DIR/src/components/Feed.tsx"
  "$APP_DIR/src/components/RightRail.tsx"
  "$APP_DIR/src/components/CreatePostModal.tsx"
  "$APP_DIR/src/styles.css"
)

for required in "${required_files[@]}"; do
  if [ ! -f "$required" ]; then
    echo "Missing generated file: $required" >&2
    exit 1
  fi
done

component_count=$(find "$APP_DIR/src/components" -maxdepth 1 -name '*.tsx' | wc -l | tr -d ' ')
if [ "$component_count" -lt 4 ]; then
  echo "Expected at least 4 component files, got $component_count" >&2
  exit 1
fi

if rg -n "<style jsx>|styled-jsx|from 'next/|from \"next/" "$APP_DIR/src" -S >/dev/null 2>&1; then
  echo "Generated app contains Next.js-specific patterns inside a Vite project" >&2
  rg -n "<style jsx>|styled-jsx|from 'next/|from \"next/" "$APP_DIR/src" -S >&2 || true
  exit 1
fi

if rg -n "import .*\.css" "$APP_DIR/src" -g '*.tsx' -g '*.ts' | grep -v "src/main.tsx:.*'./styles.css'" | grep -v 'src/main.tsx:.*\"./styles.css\"' >/dev/null 2>&1; then
  echo "Only src/main.tsx may import ./styles.css; unexpected CSS imports found" >&2
  rg -n "import .*\.css" "$APP_DIR/src" -g '*.tsx' -g '*.ts' >&2 || true
  exit 1
fi

vite_client_found=0
for tsfile in "$APP_DIR/tsconfig.json" "$APP_DIR/tsconfig.app.json"; do
  if [ -f "$tsfile" ] && rg -n '"vite/client"' "$tsfile" >/dev/null 2>&1; then
    vite_client_found=1
    break
  fi
done
if [ "$vite_client_found" -eq 0 ]; then
  echo "tsconfig must include vite/client types" >&2
  exit 1
fi

echo "=== Installing generated app (attempt $ATTEMPT) ==="
(
  cd "$APP_DIR"
  npm install --no-audit --no-fund
)

echo "=== Typecheck ==="
(
  cd "$APP_DIR"
  if npm run typecheck 2>/dev/null; then
    echo "typecheck passed"
  elif npx tsc -b --noEmit 2>/dev/null; then
    echo "tsc -b passed"
  else
    npx tsc --noEmit
  fi
)

echo "=== Build ==="
(
  cd "$APP_DIR"
  npm run build
)

echo "=== Preview ==="
(
  cd "$APP_DIR"
  npm run preview -- --host 127.0.0.1 --port "$SERVER_PORT" >"$PREVIEW_LOG" 2>&1
) &
SERVER_PID=$!
export SERVER_PID

for _ in $(seq 1 60); do
  if node -e "fetch('http://127.0.0.1:${SERVER_PORT}').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    break
  fi
  sleep 0.5
done

if ! node -e "fetch('http://127.0.0.1:${SERVER_PORT}').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
  echo "Preview server did not start correctly" >&2
  cat "$PREVIEW_LOG" >&2 || true
  exit 1
fi

echo "=== Browser validation ==="
node --input-type=module <<'PLAYWRIGHT'
import { chromium } from '@playwright/test';

const port = process.env.SERVER_PORT;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`pageerror:${err.message}`));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console:${msg.text()}`); });

await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });

const initialPosts = await page.locator('[data-testid="post-card"]').count();
const communities = await page.locator('[data-testid="community-pill"]').count();
if (initialPosts < 4) throw new Error(`expected at least 4 posts, got ${initialPosts}`);
if (communities !== 5) throw new Error(`expected exactly 5 community pills, got ${communities}`);

const allFilter = page.locator('[data-testid="community-pill"][data-community="All"]');
const startupsFilter = page.locator('[data-testid="community-pill"][data-community="r/startups"]');
await startupsFilter.click();
const startupsPosts = await page.locator('[data-testid="post-card"]').count();
if (startupsPosts !== 1) throw new Error(`expected exactly 1 startups post, got ${startupsPosts}`);
await allFilter.click();

await page.locator('[data-testid="create-post-button"]').click();
await page.locator('[data-testid="create-post-modal"]').waitFor();
await page.locator('[data-testid="post-community-select"]').selectOption('r/webdev');
const newTitle = 'Repair loop sandbox generated this React app';
await page.locator('[data-testid="post-title-input"]').fill(newTitle);
await page.locator('[data-testid="post-body-input"]').fill('This post validates that Obora can generate, validate, repair, and re-validate a modern React TypeScript Vite project using a feedback loop.');
await page.locator('[data-testid="submit-post-button"]').click();

const firstTitle = await page.locator('[data-testid="post-card"]').first().locator('h3').textContent();
if (firstTitle?.trim() !== newTitle) throw new Error(`expected newest post title to match, got ${firstTitle}`);

const seededCard = page.locator('[data-testid="post-card"]').nth(1);
const scoreNode = seededCard.locator('[data-testid="vote-score"]').first();
const before = Number((await scoreNode.textContent())?.trim() ?? '0');
await seededCard.locator('[data-testid="upvote-button"]').first().click();
const after = Number((await scoreNode.textContent())?.trim() ?? '0');
if (after !== before + 1) throw new Error(`expected upvote to increment score from ${before} to ${before + 1}, got ${after}`);

if (errors.length > 0) throw new Error(errors.join('\n'));
console.log(JSON.stringify({ title: await page.title(), initialPosts, communities, startupsPosts, firstTitle, before, after }, null, 2));
await browser.close();
PLAYWRIGHT
EOF
  then
    cat "$log_path"
    return 0
  else
    cat "$log_path"
    return 1
  fi
}

echo "=== Test 12: Reddit Clone Modern Repair Loop ==="
echo "Obora will research, generate, validate, repair from logs, and re-validate..."

rm -rf "$APP_DIR" "$ARTIFACT_DIR" "$OUTPUT_DIR" "$PREVIEW_LOG"
mkdir -p "$ARTIFACT_DIR" "$OUTPUT_DIR"

node "$SCRIPT_DIR/run.mjs" generate

validation_attempt=1
repair_attempt=0
status="failed"

while true; do
  port=$((4322 + validation_attempt))
  if validate_generated_app "$validation_attempt" "$port"; then
    status="passed"
    break
  fi

  if [ "$repair_attempt" -ge "$MAX_REPAIRS" ]; then
    echo "Reached max repair attempts ($MAX_REPAIRS)." >&2
    break
  fi

  repair_attempt=$((repair_attempt + 1))
  validation_log="$ARTIFACT_DIR/VALIDATION-ATTEMPT-$(printf '%02d' "$validation_attempt").log"
  echo "=== Repair attempt $repair_attempt ==="
  node "$SCRIPT_DIR/run.mjs" repair "$validation_log" "$repair_attempt"
  validation_attempt=$((validation_attempt + 1))
done

node "$SCRIPT_DIR/run.mjs" final-report "$status" "$validation_attempt" "$repair_attempt"

if [ "$status" != "passed" ]; then
  echo "=== Final Result: FAILED after repair loop ===" >&2
  exit 1
fi

echo "=== Final Result: PASSED after $validation_attempt validation attempt(s) and $repair_attempt repair(s) ==="
