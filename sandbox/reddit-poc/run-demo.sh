#!/usr/bin/env bash
# Reddit-like PoC Demo — Obora-only (CLI v1)
# Usage: bash run-demo.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OBORA="node ${SCRIPT_DIR}/../../bin/obora.js"
cd "$SCRIPT_DIR"

echo "═══════════════════════════════════════════"
echo "  Obora Reddit-like PoC"
echo "═══════════════════════════════════════════"
echo ""

# ─── 1. Validate workflow (dry-run) ───
echo "▶ Step 1: Validate workflow (dry-run)"
$OBORA run .obora/workflows/reddit-basic.yaml --config .obora/config.yaml --agents .obora/agents.yaml --dry-run 2>&1 || true
echo ""

# ─── 2. Run workflow ───
echo "▶ Step 2: Run workflow"
$OBORA run .obora/workflows/reddit-basic.yaml --config .obora/config.yaml --agents .obora/agents.yaml --verbose 2>&1 || true
echo ""

# ─── 3. Compute ranking locally (pure Node.js, no external deps) ───
echo "▶ Step 3: Compute Hot Ranking (local)"
echo ""
node --input-type=module <<'RANK_SCRIPT'
import { readFileSync } from "node:fs";

const posts    = JSON.parse(readFileSync("seeds/posts.json",    "utf-8"));
const comments = JSON.parse(readFileSync("seeds/comments.json", "utf-8"));
const votes    = JSON.parse(readFileSync("seeds/votes.json",    "utf-8"));

const tally = {};
for (const v of votes) {
  if (!tally[v.post_id]) tally[v.post_id] = { up: 0, down: 0 };
  tally[v.post_id][v.type]++;
}

const commentCount = {};
for (const c of comments) commentCount[c.post_id] = (commentCount[c.post_id] || 0) + 1;

const now = new Date("2026-02-14T14:00:00Z");
const ranked = posts.map(p => {
  const t = tally[p.id] || { up: 0, down: 0 };
  const cc = commentCount[p.id] || 0;
  const ageHours = (now - new Date(p.created_at)) / 3600000;
  const score = (t.up - t.down) + cc * 0.5 - ageHours * 0.1;
  return { ...p, up: t.up, down: t.down, comments: cc, score: +score.toFixed(2) };
}).sort((a, b) => b.score - a.score);

console.log("┌─────┬────────────────────────────────────────────┬────┬────┬─────┬────────┐");
console.log("│ Rank│ Title                                      │ ▲  │ ▼  │ 💬  │ Score  │");
console.log("├─────┼────────────────────────────────────────────┼────┼────┼─────┼────────┤");
ranked.forEach((p, i) => {
  const title = p.title.padEnd(42).slice(0, 42);
  const up = String(p.up).padStart(2);
  const down = String(p.down).padStart(2);
  const cc = String(p.comments).padStart(3);
  const sc = String(p.score).padStart(6);
  console.log(`│  ${i + 1}  │ ${title} │ ${up} │ ${down} │ ${cc} │ ${sc} │`);
});
console.log("└─────┴────────────────────────────────────────────┴────┴────┴─────┴────────┘");
RANK_SCRIPT

echo ""
echo "═══════════════════════════════════════════"
echo "  ✓ Demo complete"
echo "═══════════════════════════════════════════"
