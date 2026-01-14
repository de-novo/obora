#!/bin/bash
# 사용자 프롬프트 제출 로깅
# Hook: UserPromptSubmit
# Input (stdin): JSON with prompt info
# Target: ~/.obora/dashboard.db
#
# 역할: workflows 테이블에 새 워크플로우 생성

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEBUG_LOG="${SCRIPT_DIR}/../../logs/hook-debug.log"
mkdir -p "$(dirname "$DEBUG_LOG")"

# Dashboard DB 경로
DB_PATH="${HOME}/.obora/dashboard.db"
SESSION_FILE="${HOME}/.obora/current-session.txt"
WORKFLOW_FILE="${HOME}/.obora/current-workflow.txt"
STEP_COUNTER_FILE="${HOME}/.obora/workflow-step-counter.txt"

# stdin에서 JSON 읽기
INPUT=$(cat)

# 디버그 로깅
echo "=== UserPromptSubmit $(date) ===" >> "$DEBUG_LOG"
echo "$INPUT" >> "$DEBUG_LOG"

# DB 존재 확인
if [ ! -f "$DB_PATH" ]; then
  echo "Dashboard DB not found: $DB_PATH" >> "$DEBUG_LOG"
  exit 0
fi

# 세션 ID 읽기
if [ ! -f "$SESSION_FILE" ]; then
  echo "Session file not found, skipping workflow creation" >> "$DEBUG_LOG"
  exit 0
fi

SESSION_ID=$(cat "$SESSION_FILE")

# 사용자 프롬프트 추출 (JSON에서)
USER_PROMPT=$(echo "$INPUT" | jq -r '.prompt // .message // .content // "Unknown task"' | head -c 200)
# SQL 인젝션 방지: 작은따옴표 이스케이프
USER_PROMPT_ESCAPED=$(echo "$USER_PROMPT" | sed "s/'/''/g")
# JSON 형식으로 변환 (input 필드가 json mode이므로)
INPUT_JSON=$(echo "$USER_PROMPT" | jq -Rs '{task: .}')
INPUT_JSON_ESCAPED=$(echo "$INPUT_JSON" | sed "s/'/''/g")

# 워크플로우 ID 생성
WORKFLOW_ID="wf_cc_$(date +%s)_$$"
TIMESTAMP=$(date +%s)

echo "SESSION_ID: $SESSION_ID, WORKFLOW_ID: $WORKFLOW_ID" >> "$DEBUG_LOG"
echo "USER_PROMPT: $USER_PROMPT" >> "$DEBUG_LOG"
echo "INPUT_JSON: $INPUT_JSON" >> "$DEBUG_LOG"

# 워크플로우 생성
sqlite3 "$DB_PATH" <<EOF 2>> "$DEBUG_LOG"
INSERT INTO workflows (
  id,
  session_id,
  name,
  type,
  status,
  started_at,
  input,
  tokens_used
) VALUES (
  '$WORKFLOW_ID',
  '$SESSION_ID',
  '$USER_PROMPT_ESCAPED',
  'claude-code',
  'running',
  $TIMESTAMP,
  '$INPUT_JSON_ESCAPED',
  0
);
EOF

echo "Workflow insert result: $?" >> "$DEBUG_LOG"

# 워크플로우 ID 저장
echo "$WORKFLOW_ID" > "$WORKFLOW_FILE"
echo "Workflow ID saved to: $WORKFLOW_FILE" >> "$DEBUG_LOG"

# 스텝 카운터 초기화
echo "0" > "$STEP_COUNTER_FILE"

echo "" >> "$DEBUG_LOG"
