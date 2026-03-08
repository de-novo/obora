#!/bin/bash
set -euo pipefail

: "${ATTEMPT:?ATTEMPT is required}"
: "${APP_DIR:?APP_DIR is required}"
: "${SERVER_PORT:?SERVER_PORT is required}"
: "${PREVIEW_LOG:?PREVIEW_LOG is required}"

cleanup() {
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

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
rm -f "$PREVIEW_LOG"
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
