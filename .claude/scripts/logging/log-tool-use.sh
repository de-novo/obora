#!/bin/bash
# 도구 사용 로깅
# Hook: PreToolUse / PostToolUse
# Input (stdin): JSON with tool info

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="$("${SCRIPT_DIR}/init-db.sh" 2>/dev/null | tail -1)"

# stdin에서 JSON 읽기
INPUT=$(cat)

# JSON 파싱
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}' | head -c 5000)  # 최대 5000자
HOOK_TYPE=$(echo "$INPUT" | jq -r '.hook_type // "pre"')
RUN_ID=$(echo "$INPUT" | jq -r '.agent_id // ""')

# 도구 이름이 없으면 종료
if [ -z "$TOOL_NAME" ] || [ "$TOOL_NAME" = "null" ]; then
  exit 0
fi

if [ "$HOOK_TYPE" = "pre" ] || [ "$HOOK_TYPE" = "PreToolUse" ]; then
  # PreToolUse: 새 도구 호출 기록 생성
  sqlite3 "$DB_PATH" <<EOF
INSERT INTO tool_calls (run_id, tool_name, input, status, started_at)
VALUES (
  $([ -n "$RUN_ID" ] && [ "$RUN_ID" != "null" ] && echo "'$RUN_ID'" || echo "NULL"),
  '$TOOL_NAME',
  '$(echo "$TOOL_INPUT" | sed "s/'/''/g")',
  'success',
  datetime('now')
);
EOF
else
  # PostToolUse: 도구 호출 결과 업데이트
  TOOL_OUTPUT=$(echo "$INPUT" | jq -c '.tool_output // .output // {}' | head -c 5000)
  STATUS=$(echo "$INPUT" | jq -r '.status // "success"')
  ERROR=$(echo "$INPUT" | jq -r '.error // ""')

  # 상태 매핑
  case "$STATUS" in
    "blocked") STATUS="blocked" ;;
    "error"|"failed") STATUS="failed" ;;
    "timeout") STATUS="timeout" ;;
    *) STATUS="success" ;;
  esac

  sqlite3 "$DB_PATH" <<EOF
UPDATE tool_calls
SET
  output = '$(echo "$TOOL_OUTPUT" | sed "s/'/''/g")',
  status = '$STATUS',
  ended_at = datetime('now'),
  duration_ms = CAST((julianday('now') - julianday(started_at)) * 86400000 AS INTEGER),
  error_message = $([ -n "$ERROR" ] && [ "$ERROR" != "null" ] && echo "'$(echo "$ERROR" | sed "s/'/''/g")'" || echo "NULL")
WHERE tool_name = '$TOOL_NAME'
  AND ended_at IS NULL
  AND id = (SELECT id FROM tool_calls WHERE tool_name = '$TOOL_NAME' AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1);
EOF
fi

exit 0
