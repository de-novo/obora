#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

IDLE_TIMEOUT="${OBORA_IDLE_TIMEOUT_SEC:-1800}"
SAFETY_TIMEOUT="${OBORA_SAFETY_TIMEOUT_SEC:-43200}"
POLL_SEC="${OBORA_WATCHDOG_POLL_SEC:-10}"

mkdir -p "$ROOT/output/iterations/logs"
LOG="$ROOT/output/iterations/logs/run.log"
TAIL_LOG="$ROOT/output/iterations/logs/run.tail.log"

bash "$ROOT/run.sh" > "$LOG" 2>&1 &
PID=$!

STARTED=$(date +%s)
LAST_SIZE=$(stat -f%z "$LOG" 2>/dev/null || echo 0)

while kill -0 "$PID" 2>/dev/null; do
  sleep "$POLL_SEC"
  NOW=$(date +%s)
  ELAPSED=$((NOW - STARTED))

  if (( ELAPSED > SAFETY_TIMEOUT )); then
    echo "watchdog: safety ceiling reached (${SAFETY_TIMEOUT}s), killing" | tee -a "$LOG"
    kill "$PID" 2>/dev/null || true
    break
  fi

  CUR_SIZE=$(stat -f%z "$LOG" 2>/dev/null || echo 0)
  if [ "$CUR_SIZE" = "$LAST_SIZE" ]; then
    IDLE=$((IDLE + POLL_SEC))
  else
    IDLE=0
    LAST_SIZE="$CUR_SIZE"
  fi

  if (( IDLE > IDLE_TIMEOUT )); then
    echo "watchdog: idle timeout reached (${IDLE_TIMEOUT}s), killing" | tee -a "$LOG"
    kill "$PID" 2>/dev/null || true
    break
  fi
done

wait "$PID" 2>/dev/null || true
tail -n 200 "$LOG" > "$TAIL_LOG"
echo "watchdog: done"
