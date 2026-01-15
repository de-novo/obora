#!/bin/bash
# 에이전트 시작 로깅
# Hook: SubagentStart
# Input (stdin): JSON with agent info
# Target: ~/.obora/dashboard.db
#
# 역할:
# 1. workflow_steps 테이블에 스텝 생성
# 2. agent_runs 테이블에 실행 기록 생성 (workflow_step_id 연결)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEBUG_LOG="${SCRIPT_DIR}/../../logs/hook-debug.log"
mkdir -p "$(dirname "$DEBUG_LOG")"

# Dashboard DB 경로
DB_PATH="${HOME}/.obora/dashboard.db"
SESSION_FILE="${HOME}/.obora/current-session.txt"
WORKFLOW_FILE="${HOME}/.obora/current-workflow.txt"
STEP_COUNTER_FILE="${HOME}/.obora/workflow-step-counter.txt"
CURRENT_STEP_FILE="${HOME}/.obora/current-workflow-step.txt"

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
RUN_ID=$(echo "$INPUT" | jq -r '.agent_id // ""')
TASK_DESC=$(echo "$INPUT" | jq -r '.prompt // .task // "Task execution"' | head -c 500)
TASK_DESC=$(echo "$TASK_DESC" | sed "s/'/''/g")

# RUN_ID가 없으면 생성
if [ -z "$RUN_ID" ] || [ "$RUN_ID" = "null" ]; then
  RUN_ID="ar_$(date +%s)_$$"
fi

# 세션 ID 읽기
SESSION_ID=""
if [ -f "$SESSION_FILE" ]; then
  SESSION_ID=$(cat "$SESSION_FILE")
fi

# 워크플로우 ID 읽기
WORKFLOW_ID=""
if [ -f "$WORKFLOW_FILE" ]; then
  WORKFLOW_ID=$(cat "$WORKFLOW_FILE")
fi

# 스텝 카운터 읽기 및 증가
STEP_NUMBER=1
if [ -f "$STEP_COUNTER_FILE" ]; then
  STEP_NUMBER=$(($(cat "$STEP_COUNTER_FILE") + 1))
fi
echo "$STEP_NUMBER" > "$STEP_COUNTER_FILE"

# 현재 타임스탬프
TIMESTAMP=$(date +%s)

# 디버그 - 파싱 결과
echo "AGENT_TYPE: $AGENT_TYPE, SESSION_ID: $SESSION_ID, WORKFLOW_ID: $WORKFLOW_ID, STEP: $STEP_NUMBER, RUN_ID: $RUN_ID" >> "$DEBUG_LOG"

# workflow_step_id 생성
STEP_ID=""
if [ -n "$WORKFLOW_ID" ]; then
  STEP_ID="ws_${WORKFLOW_ID#wf_}_${STEP_NUMBER}"

  # workflow_step 생성
  sqlite3 "$DB_PATH" <<EOF 2>> "$DEBUG_LOG"
INSERT INTO workflow_steps (
  id,
  workflow_id,
  step_number,
  agent_type,
  task_description,
  status,
  started_at,
  tokens_used
) VALUES (
  '$STEP_ID',
  '$WORKFLOW_ID',
  $STEP_NUMBER,
  '$AGENT_TYPE',
  '$TASK_DESC',
  'running',
  $TIMESTAMP,
  0
);
EOF
  echo "Workflow step insert result: $?" >> "$DEBUG_LOG"

  # 현재 step ID 저장 (log-agent-stop.sh에서 사용)
  echo "$STEP_ID" > "$CURRENT_STEP_FILE"
  echo "Saved STEP_ID to: $CURRENT_STEP_FILE" >> "$DEBUG_LOG"
fi

# 에이전트 실행 기록 삽입
if [ -n "$SESSION_ID" ]; then
  sqlite3 "$DB_PATH" <<EOF 2>> "$DEBUG_LOG"
INSERT INTO agent_runs (
  id,
  session_id,
  workflow_step_id,
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
  '$SESSION_ID',
  $([ -n "$STEP_ID" ] && echo "'$STEP_ID'" || echo "NULL"),
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
else
  sqlite3 "$DB_PATH" <<EOF 2>> "$DEBUG_LOG"
INSERT INTO agent_runs (
  id,
  session_id,
  workflow_step_id,
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
  NULL,
  $([ -n "$STEP_ID" ] && echo "'$STEP_ID'" || echo "NULL"),
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
fi

echo "Agent start insert result: $?" >> "$DEBUG_LOG"
echo "" >> "$DEBUG_LOG"

# RUN_ID 출력
echo "$RUN_ID"
