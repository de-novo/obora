#!/bin/bash
# 세션 종료 로깅
# Hook: SessionEnd
# Input (stdin): JSON with session info
# Target: ~/.obora/dashboard.db
#
# 역할: sessions 테이블의 세션 상태를 completed로 업데이트

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEBUG_LOG="${SCRIPT_DIR}/../../logs/hook-debug.log"

# OBORA_INTERNAL=true면 내부 호출이므로 스킵 (title-generate 등)
if [ "$OBORA_INTERNAL" = "true" ]; then
  exit 0
fi

# Dashboard DB 경로
DB_PATH="${HOME}/.obora/dashboard.db"
SESSION_FILE="${HOME}/.obora/current-session.txt"

# stdin에서 JSON 읽기
INPUT=$(cat)

# 디버그 로깅
echo "=== SessionEnd $(date) ===" >> "$DEBUG_LOG"
echo "$INPUT" >> "$DEBUG_LOG"

# DB 존재 확인
if [ ! -f "$DB_PATH" ]; then
  echo "Dashboard DB not found: $DB_PATH" >> "$DEBUG_LOG"
  exit 0
fi

# 저장된 세션 ID 읽기
if [ ! -f "$SESSION_FILE" ]; then
  echo "Session file not found: $SESSION_FILE" >> "$DEBUG_LOG"
  exit 0
fi

SESSION_ID=$(cat "$SESSION_FILE")
TIMESTAMP=$(date +%s)

echo "SESSION_ID: $SESSION_ID" >> "$DEBUG_LOG"

# 세션에서 사용된 토큰 합계 계산
TOTAL_TOKENS=$(sqlite3 "$DB_PATH" "SELECT COALESCE(SUM(tokens_used), 0) FROM agent_runs WHERE session_id = '$SESSION_ID';" 2>/dev/null)

# 세션 상태 업데이트
sqlite3 "$DB_PATH" <<EOF 2>> "$DEBUG_LOG"
UPDATE sessions
SET
  status = 'completed',
  ended_at = $TIMESTAMP,
  total_tokens = $TOTAL_TOKENS
WHERE id = '$SESSION_ID';
EOF

echo "Session end update result: $?" >> "$DEBUG_LOG"

# 세션 파일 삭제
rm -f "$SESSION_FILE"
echo "Session file removed" >> "$DEBUG_LOG"

echo "" >> "$DEBUG_LOG"
