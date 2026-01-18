#!/bin/bash
# 최근 워크플로우 정보 조회
# Usage: get-recent-workflow.sh [session_id]
#
# 같은 세션의 최근 워크플로우 정보를 JSON으로 출력
# Main Claude가 워크플로우 분류 시 참조

DB_PATH="${HOME}/.obora/dashboard.db"
SESSION_FILE="${HOME}/.obora/current-session.txt"

# 세션 ID 결정
if [ -n "$1" ]; then
  SESSION_ID="$1"
elif [ -f "$SESSION_FILE" ]; then
  SESSION_ID=$(cat "$SESSION_FILE")
else
  echo '{"error": "No session found"}'
  exit 1
fi

# DB 존재 확인
if [ ! -f "$DB_PATH" ]; then
  echo '{"error": "Database not found"}'
  exit 1
fi

# 최근 10분 이내의 워크플로우 조회 (현재 제외)
CURRENT_WORKFLOW_FILE="${HOME}/.obora/current-workflow.txt"
CURRENT_WORKFLOW_ID=""
if [ -f "$CURRENT_WORKFLOW_FILE" ]; then
  CURRENT_WORKFLOW_ID=$(cat "$CURRENT_WORKFLOW_FILE")
fi

TEN_MIN_AGO=$(($(date +%s) - 600))

# 최근 워크플로우 조회 (JSON 출력)
RESULT=$(sqlite3 -json "$DB_PATH" <<EOF
SELECT
  id,
  name as title,
  type,
  status,
  started_at,
  ended_at,
  input,
  output
FROM workflows
WHERE session_id = '$SESSION_ID'
  AND id != '$CURRENT_WORKFLOW_ID'
  AND started_at > $TEN_MIN_AGO
ORDER BY started_at DESC
LIMIT 3;
EOF
)

# 결과가 없으면 빈 배열
if [ -z "$RESULT" ] || [ "$RESULT" = "[]" ]; then
  echo '{"recent_workflows": [], "has_context": false}'
else
  echo "{\"recent_workflows\": $RESULT, \"has_context\": true}"
fi
