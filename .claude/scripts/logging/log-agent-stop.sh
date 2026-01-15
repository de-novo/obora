#!/bin/bash
# 에이전트 종료 로깅 + Transcript 파싱
# Hook: SubagentStop
# Input (stdin): JSON with agent result
# Target: ~/.obora/dashboard.db
#
# 역할:
#   - 상태 업데이트 (completed/failed)
#   - Transcript 파싱하여 tool_call_details 추출
#   - 에이전트 출력(output) 추출 및 저장
#   - 누락된 정보 보완

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEBUG_LOG="${SCRIPT_DIR}/../../logs/hook-debug.log"
mkdir -p "$(dirname "$DEBUG_LOG")"

DB_PATH="${HOME}/.obora/dashboard.db"
STEP_FILE="${HOME}/.obora/current-workflow-step.txt"

# stdin에서 JSON 읽기
INPUT=$(cat)

# 디버그 로깅
echo "=== SubagentStop $(date) ===" >> "$DEBUG_LOG"
echo "$INPUT" >> "$DEBUG_LOG"

# DB 존재 확인
if [ ! -f "$DB_PATH" ]; then
  echo "Dashboard DB not found: $DB_PATH" >> "$DEBUG_LOG"
  exit 0
fi

# JSON 파싱
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // .subagent_type // .agent_name // "unknown"')
RUN_ID=$(echo "$INPUT" | jq -r '.agent_id // ""')
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.agent_transcript_path // ""')

TIMESTAMP=$(date +%s)

echo "AGENT_TYPE: $AGENT_TYPE, RUN_ID: $RUN_ID, TRANSCRIPT: $TRANSCRIPT_PATH" >> "$DEBUG_LOG"

# ============================================================================
# Transcript 파싱 - tool_call_details 및 output 추출
# ============================================================================
TOOL_CALLS="[]"
TOOLS_CALLED="[]"
AGENT_OUTPUT=""

if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  echo "Parsing transcript: $TRANSCRIPT_PATH" >> "$DEBUG_LOG"

  # JSONL에서 tool_use 항목 추출
  # message.content가 배열인 경우만 처리 (문자열인 경우 스킵)
  TOOL_CALLS=$(cat "$TRANSCRIPT_PATH" | jq -s '
    [.[] |
      select(.message.content | type == "array") |
      .message.content[] |
      select(.type == "tool_use") |
      {
        toolName: .name,
        input: .input
      }
    ]
  ' 2>/dev/null || echo "[]")

  # 도구 이름 목록 추출
  TOOLS_CALLED=$(echo "$TOOL_CALLS" | jq -c '[.[].toolName] | unique' 2>/dev/null || echo "[]")

  # 에이전트의 텍스트 출력 추출 (assistant 메시지의 text 타입 content)
  AGENT_OUTPUT=$(cat "$TRANSCRIPT_PATH" | jq -rs '
    [.[] |
      select(.type == "assistant") |
      select(.message.content | type == "array") |
      .message.content[] |
      select(.type == "text") |
      .text
    ] | join("\n\n")
  ' 2>/dev/null || echo "")

  echo "Extracted tool calls: $(echo "$TOOL_CALLS" | jq -c 'length')" >> "$DEBUG_LOG"
  echo "Tools called: $TOOLS_CALLED" >> "$DEBUG_LOG"
  echo "Output length: ${#AGENT_OUTPUT}" >> "$DEBUG_LOG"
fi

# output SQL escape
AGENT_OUTPUT_ESCAPED=$(echo "$AGENT_OUTPUT" | sed "s/'/''/g")

# ============================================================================
# DB 업데이트
# ============================================================================

# 현재 workflow_step_id 조회
STEP_ID=""
if [ -f "$STEP_FILE" ]; then
  STEP_ID=$(cat "$STEP_FILE")
  echo "Current STEP_ID from file: $STEP_ID" >> "$DEBUG_LOG"
fi

if [ -n "$RUN_ID" ] && [ "$RUN_ID" != "null" ]; then
  # 현재 상태 확인 (PostToolUse에서 이미 업데이트했을 수 있음)
  CURRENT_STATUS=$(sqlite3 "$DB_PATH" "SELECT status FROM agent_runs WHERE id = '$RUN_ID';" 2>/dev/null)

  echo "Current status for $RUN_ID: $CURRENT_STATUS" >> "$DEBUG_LOG"

  # agent_runs 업데이트 (tool_call_details + output)
  sqlite3 "$DB_PATH" <<EOF 2>> "$DEBUG_LOG"
UPDATE agent_runs
SET
  tools_called = '$(echo "$TOOLS_CALLED" | sed "s/'/''/g")',
  tool_call_details = '$(echo "$TOOL_CALLS" | sed "s/'/''/g")',
  output = '$AGENT_OUTPUT_ESCAPED',
  current_tool = NULL,
  last_stream_update = $TIMESTAMP
WHERE id = '$RUN_ID';
EOF
  echo "Agent run update result: $?" >> "$DEBUG_LOG"

  # 상태가 running 또는 async_launched이면 completed로 변경
  if [ "$CURRENT_STATUS" = "running" ] || [ "$CURRENT_STATUS" = "async_launched" ]; then
    sqlite3 "$DB_PATH" <<EOF 2>> "$DEBUG_LOG"
UPDATE agent_runs
SET
  status = 'completed',
  ended_at = $TIMESTAMP,
  current_tool = NULL,
  last_stream_update = $TIMESTAMP
WHERE id = '$RUN_ID' AND status = 'running';
EOF
    echo "Status update result: $?" >> "$DEBUG_LOG"
  fi

  # workflow_step도 업데이트
  if [ -n "$STEP_ID" ]; then
    sqlite3 "$DB_PATH" <<EOF 2>> "$DEBUG_LOG"
UPDATE workflow_steps
SET
  output = '$AGENT_OUTPUT_ESCAPED',
  status = 'completed',
  ended_at = $TIMESTAMP
WHERE id = '$STEP_ID' AND status = 'running';
EOF
    echo "Workflow step update result: $?" >> "$DEBUG_LOG"
  fi

else
  # RUN_ID가 없으면 가장 최근 running 상태의 해당 에이전트 업데이트
  echo "No RUN_ID, updating most recent running agent of type: $AGENT_TYPE" >> "$DEBUG_LOG"

  sqlite3 "$DB_PATH" <<EOF 2>> "$DEBUG_LOG"
UPDATE agent_runs
SET
  status = 'completed',
  ended_at = $TIMESTAMP,
  tools_called = '$(echo "$TOOLS_CALLED" | sed "s/'/''/g")',
  tool_call_details = '$(echo "$TOOL_CALLS" | sed "s/'/''/g")',
  output = '$AGENT_OUTPUT_ESCAPED',
  current_tool = NULL,
  last_stream_update = $TIMESTAMP
WHERE agent_type = '$AGENT_TYPE'
  AND status = 'running'
  AND id = (
    SELECT id FROM agent_runs
    WHERE agent_type = '$AGENT_TYPE' AND status = 'running'
    ORDER BY started_at DESC LIMIT 1
  );
EOF
  echo "Fallback update result: $?" >> "$DEBUG_LOG"

  # workflow_step도 업데이트 (STEP_ID가 있으면)
  if [ -n "$STEP_ID" ]; then
    sqlite3 "$DB_PATH" <<EOF 2>> "$DEBUG_LOG"
UPDATE workflow_steps
SET
  output = '$AGENT_OUTPUT_ESCAPED',
  status = 'completed',
  ended_at = $TIMESTAMP
WHERE id = '$STEP_ID' AND status = 'running';
EOF
    echo "Workflow step fallback update result: $?" >> "$DEBUG_LOG"
  fi
fi

echo "" >> "$DEBUG_LOG"
echo "Agent $AGENT_TYPE completed"
