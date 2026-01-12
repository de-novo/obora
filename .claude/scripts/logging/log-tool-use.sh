#!/bin/bash
# 도구 사용 로깅
# Hook: PreToolUse / PostToolUse
# Input (stdin): JSON with tool info

# set -e 제거 - 중간 실패해도 계속 진행

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEBUG_LOG="${SCRIPT_DIR}/../../logs/hook-debug.log"
mkdir -p "$(dirname "$DEBUG_LOG")"

# DB 경로 직접 설정 (init-db.sh 호출 문제 방지)
DB_PATH="${SCRIPT_DIR}/../../logs/agents.db"

# stdin에서 JSON 읽기
INPUT=$(cat)

# 디버그 로깅
echo "=== ToolUse $(date) ===" >> "$DEBUG_LOG"
echo "$INPUT" | jq '.' >> "$DEBUG_LOG" 2>/dev/null || echo "$INPUT" >> "$DEBUG_LOG"
echo "" >> "$DEBUG_LOG"

# JSON 파싱
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}' | head -c 5000)  # 최대 5000자
HOOK_TYPE=$(echo "$INPUT" | jq -r '.hook_type // "pre"')
RUN_ID=$(echo "$INPUT" | jq -r '.agent_id // ""')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')

# 도구 이름이 없으면 종료
if [ -z "$TOOL_NAME" ] || [ "$TOOL_NAME" = "null" ]; then
  exit 0
fi

if [ "$HOOK_TYPE" = "pre" ] || [ "$HOOK_TYPE" = "PreToolUse" ]; then
  # Task 도구인 경우 tool_calls에 parent 정보와 함께 기록
  # agent_runs는 SubagentStart hook에서 생성됨 (중복 방지)
  if [ "$TOOL_NAME" = "Task" ]; then
    TASK_DESC=$(echo "$INPUT" | jq -r '.tool_input.description // .tool_input.prompt // ""' | head -c 200)
    # tool_calls의 input에 parent_run_id 정보 포함
    TOOL_INPUT=$(echo "$INPUT" | jq -c '{parent_run_id: .agent_id, subagent_type: .tool_input.subagent_type, description: .tool_input.description, prompt: (.tool_input.prompt | .[0:500])}')
  fi

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

  # Task 도구의 agent_runs 업데이트는 SubagentStop hook에서 처리됨

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
