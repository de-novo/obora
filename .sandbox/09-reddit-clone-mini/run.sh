#!/bin/bash
# Test 09: Reddit Clone Mini
# Expected: Obora generates a runnable mini frontend project using file tools only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

require_provider_auth zai

APP_DIR="$SCRIPT_DIR/app"
SERVER_PORT=4319
SERVER_LOG="$SCRIPT_DIR/.server.log"

cleanup() {
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "=== Test 09: Reddit Clone Mini ==="
echo "Obora will generate the app inside sandbox and then we validate it..."

rm -rf "$APP_DIR" "$SERVER_LOG"

run_sandbox_workflow "$SCRIPT_DIR"

for required in package.json server.js index.html styles.css app.js; do
  if [ ! -f "$APP_DIR/$required" ]; then
    echo "Error: missing generated file: $APP_DIR/$required" >&2
    exit 1
  fi
done

echo "=== Generated files ==="
find "$APP_DIR" -maxdepth 1 -type f | sort

echo "=== Starting generated app ==="
(
  cd "$APP_DIR"
  PORT="$SERVER_PORT" node server.js >"$SERVER_LOG" 2>&1
) &
SERVER_PID=$!

for _ in $(seq 1 40); do
  if node -e "fetch('http://127.0.0.1:${SERVER_PORT}').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    break
  fi
  sleep 0.25
done

if ! node -e "fetch('http://127.0.0.1:${SERVER_PORT}').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
  echo "Error: generated app did not start correctly" >&2
  echo "--- server log ---" >&2
  cat "$SERVER_LOG" >&2 || true
  exit 1
fi

echo "=== Browser validation ==="
node --input-type=module <<'EOF'
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`pageerror:${err.message}`));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console:${msg.text()}`); });

await page.goto('http://127.0.0.1:4319', { waitUntil: 'networkidle' });

const initialPosts = await page.locator('[data-testid="post-card"]').count();
const communities = await page.locator('[data-testid="community-pill"]').count();
if (initialPosts < 4) throw new Error(`expected at least 4 posts, got ${initialPosts}`);
if (communities < 5) throw new Error(`expected at least 5 community pills, got ${communities}`);

const allFilter = page.locator('[data-testid="community-pill"][data-community="All"]');
const startupsFilter = page.locator('[data-testid="community-pill"][data-community="r/startups"]');
await startupsFilter.click();
const startupsPosts = await page.locator('[data-testid="post-card"]').count();
if (startupsPosts !== 1) throw new Error(`expected exactly 1 startups post, got ${startupsPosts}`);
await allFilter.click();

await page.locator('[data-testid="create-post-button"]').click();
await page.locator('[data-testid="create-post-modal"]').waitFor();
await page.locator('[data-testid="post-community-select"]').selectOption('r/webdev');
const newTitle = 'Obora sandbox generated this clone successfully';
await page.locator('[data-testid="post-title-input"]').fill(newTitle);
await page.locator('[data-testid="post-body-input"]').fill('This post was created during automated sandbox validation to confirm that the generated Reddit-style mini app supports modal-driven post creation.');
await page.locator('[data-testid="submit-post-button"]').click();

const firstTitle = await page.locator('[data-testid="post-card"]').first().locator('h3').textContent();
if (firstTitle?.trim() !== newTitle) throw new Error(`expected newest post title to match, got ${firstTitle}`);

const firstScore = page.locator('[data-testid="post-card"]').first().locator('[data-testid="vote-score"]').first();
const before = Number((await firstScore.textContent())?.trim() ?? '0');
await page.locator('[data-testid="post-card"]').first().locator('[data-testid="upvote-button"]').first().click();
const after = Number((await firstScore.textContent())?.trim() ?? '0');
if (after !== before + 1) throw new Error(`expected upvote to increment score from ${before} to ${before + 1}, got ${after}`);

if (errors.length > 0) throw new Error(errors.join('\n'));
console.log(JSON.stringify({ title: await page.title(), initialPosts, communities, startupsPosts, firstTitle, before, after }, null, 2));
await browser.close();
EOF

echo "=== Test Complete ==="
