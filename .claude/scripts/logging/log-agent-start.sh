#!/bin/bash
# 에이전트 시작 로깅
# Hook: SubagentStart
# Input (stdin): JSON with agent info
# Target: ~/.obora/dashboard.db
#
# 역할: running 상태의 agent_run 레코드 생성
# 상세 정보(model, prompt, tokens)는 PostToolUse(Task)에서 업데이트

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEBUG_LOG="${SCRIPT_DIR}/../../logs/hook-debug.log"
mkdir -p "$(dirname "$DEBUG_LOG")"

# Dashboard DB 경로
DB_PATH="${HOME}/.obora/dashboard.db"

# stdin에서 JSON 읽기
INPUT=$(cat)

# 디버그 로깅
echo "=== SubagentStart $(date) ===" >> "$DEBUG_LOG"
echo "$INPUT" >> "$DEBUG_LOG"

# DB 존재 확인
if [ ! -f "$DB_PATH" ]; then
  echo "Dashboard DB not found: $DB_PATH" >> "$DEBUG_LOG"
  exit 0
fi

# JSON 파싱
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // .subagent_type // .agent_name // "unknown"')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
RUN_ID=$(echo "$INPUT" | jq -r '.agent_id // ""')

# RUN_ID가 없으면 생성
if [ -z "$RUN_ID" ] || [ "$RUN_ID" = "null" ]; then
  RUN_ID="ar_$(date +%s)_$$"
fi

# 현재 타임스탬프 (Unix epoch)
TIMESTAMP=$(date +%s)

# 디버그 - 파싱 결과
echo "AGENT_TYPE: $AGENT_TYPE, SESSION_ID: $SESSION_ID, RUN_ID: $RUN_ID" >> "$DEBUG_LOG"

# 에이전트 실행 기록 삽입 (최소 정보만)
sqlite3 "$DB_PATH" <<EOF 2>> "$DEBUG_LOG"
INSERT INTO agent_runs (
  id,
  session_id,
  agent_type,
  status,
  started_at,
  tokens_used,
  input_tokens,
  output_tokens,
  tool_call_count,
  last_stream_update
) VALUES (
  '$RUN_ID',
  $([ -n "$SESSION_ID" ] && [ "$SESSION_ID" != "null" ] && echo "'$SESSION_ID'" || echo "NULL"),
  '$AGENT_TYPE',
  'running',
  $TIMESTAMP,
  0,
  0,
  0,
  0,
  $TIMESTAMP
);
EOF

echo "Agent start insert result: $?" >> "$DEBUG_LOG"
echo "" >> "$DEBUG_LOG"

# RUN_ID 출력
echo "$RUN_ID"
