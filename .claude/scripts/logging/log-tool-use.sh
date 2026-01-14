#!/bin/bash
# 도구 사용 로깅 (실시간 추적)
# Hook: PreToolUse / PostToolUse
# Input (stdin): JSON with tool info
# Target: ~/.obora/dashboard.db
#
# 역할:
#   - PreToolUse: current_tool 업데이트 (실시간)
#   - PostToolUse: tool_call_count++, current_tool 클리어
#   - PostToolUse(Task): model, prompt, tokens, result 업데이트

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEBUG_LOG="${SCRIPT_DIR}/../../logs/hook-debug.log"
mkdir -p "$(dirname "$DEBUG_LOG")"

DB_PATH="${HOME}/.obora/dashboard.db"

# stdin에서 JSON 읽기
INPUT=$(cat)

# 디버그 로깅
echo "=== ToolUse $(date) ===" >> "$DEBUG_LOG"
echo "$INPUT" | jq '.' >> "$DEBUG_LOG" 2>/dev/null || echo "$INPUT" >> "$DEBUG_LOG"

# DB 존재 확인
if [ ! -f "$DB_PATH" ]; then
  echo "Dashboard DB not found: $DB_PATH" >> "$DEBUG_LOG"
  exit 0
fi

# JSON 파싱
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
HOOK_TYPE=$(echo "$INPUT" | jq -r '.hook_event_name // .hook_type // "pre"')
RUN_ID=$(echo "$INPUT" | jq -r '.agent_id // ""')

# 도구 이름이 없으면 종료
if [ -z "$TOOL_NAME" ] || [ "$TOOL_NAME" = "null" ]; then
  echo "No tool name, skipping" >> "$DEBUG_LOG"
  exit 0
fi

TIMESTAMP=$(date +%s)

echo "TOOL_NAME: $TOOL_NAME, HOOK_TYPE: $HOOK_TYPE, RUN_ID: $RUN_ID" >> "$DEBUG_LOG"

# ============================================================================
# Task 도구 처리 (서브에이전트 완료 시 상세 정보 업데이트)
# ============================================================================
if [ "$TOOL_NAME" = "Task" ]; then
  if [ "$HOOK_TYPE" = "PostToolUse" ] || [ "$HOOK_TYPE" = "post" ]; then
    # PostToolUse: Task 도구에서 model, prompt, tokens, result 모두 추출
    MODEL=$(echo "$INPUT" | jq -r '.tool_input.model // ""')
    PROMPT=$(echo "$INPUT" | jq -r '.tool_input.prompt // ""' | head -c 50000)

    AGENT_ID=$(echo "$INPUT" | jq -r '.tool_response.agentId // ""')
    TOTAL_TOKENS=$(echo "$INPUT" | jq -r '.tool_response.totalTokens // 0')
    INPUT_TOKENS=$(echo "$INPUT" | jq -r '.tool_response.usage.input_tokens // 0')
    OUTPUT_TOKENS=$(echo "$INPUT" | jq -r '.tool_response.usage.output_tokens // 0')
    CACHE_CREATION=$(echo "$INPUT" | jq -r '.tool_response.usage.cache_creation_input_tokens // 0')
    CACHE_READ=$(echo "$INPUT" | jq -r '.tool_response.usage.cache_read_input_tokens // 0')
    STATUS=$(echo "$INPUT" | jq -r '.tool_response.status // "completed"')
    RESULT_TEXT=$(echo "$INPUT" | jq -r '.tool_response.content[0].text // ""' | head -c 50000)
    DURATION_MS=$(echo "$INPUT" | jq -r '.tool_response.totalDurationMs // 0')
    TOOL_USE_COUNT=$(echo "$INPUT" | jq -r '.tool_response.totalToolUseCount // 0')

    # 총 입력 토큰 계산 (캐시 포함)
    TOTAL_INPUT=$((INPUT_TOKENS + CACHE_CREATION + CACHE_READ))

    echo "Task PostToolUse - AGENT_ID: $AGENT_ID, MODEL: $MODEL, TOKENS: $TOTAL_TOKENS" >> "$DEBUG_LOG"

    if [ -n "$AGENT_ID" ] && [ "$AGENT_ID" != "null" ]; then
      # 결과 JSON 생성
      RESULT_JSON=$(jq -n \
        --arg text "$RESULT_TEXT" \
        --arg duration "$DURATION_MS" \
        --arg toolCount "$TOOL_USE_COUNT" \
        '{text: $text, durationMs: ($duration | tonumber), toolUseCount: ($toolCount | tonumber)}' 2>/dev/null || echo '{}')

      sqlite3 "$DB_PATH" <<EOF 2>> "$DEBUG_LOG"
UPDATE agent_runs
SET
  status = '$STATUS',
  model = $([ -n "$MODEL" ] && [ "$MODEL" != "null" ] && [ "$MODEL" != "" ] && echo "'$MODEL'" || echo "NULL"),
  prompt = '$(echo "$PROMPT" | sed "s/'/''/g")',
  ended_at = $TIMESTAMP,
  tokens_used = $TOTAL_TOKENS,
  input_tokens = $TOTAL_INPUT,
  output_tokens = $OUTPUT_TOKENS,
  output = '$(echo "$RESULT_TEXT" | sed "s/'/''/g")',
  result = '$(echo "$RESULT_JSON" | sed "s/'/''/g")',
  current_tool = NULL,
  tool_call_count = $TOOL_USE_COUNT,
  last_stream_update = $TIMESTAMP
WHERE id = '$AGENT_ID';
EOF
      echo "Task PostToolUse update result: $?" >> "$DEBUG_LOG"
    fi
  fi
  # PreToolUse for Task - nothing special needed
  exit 0
fi

# ============================================================================
# 일반 도구 처리 (실시간 추적)
# ============================================================================

# RUN_ID가 없으면 (Main Claude의 도구 호출) 스킵
if [ -z "$RUN_ID" ] || [ "$RUN_ID" = "null" ]; then
  echo "No agent RUN_ID, skipping real-time tracking" >> "$DEBUG_LOG"
  exit 0
fi

if [ "$HOOK_TYPE" = "PreToolUse" ] || [ "$HOOK_TYPE" = "pre" ]; then
  # ========== PreToolUse: current_tool 업데이트 (실시간) ==========
  TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}' | head -c 1000)

  sqlite3 "$DB_PATH" <<EOF 2>> "$DEBUG_LOG"
UPDATE agent_runs
SET
  current_tool = '$TOOL_NAME',
  current_tool_input = '$(echo "$TOOL_INPUT" | sed "s/'/''/g")',
  last_stream_update = $TIMESTAMP
WHERE id = '$RUN_ID';
EOF
  echo "PreToolUse real-time update result: $?" >> "$DEBUG_LOG"

else
  # ========== PostToolUse: tool_call_count++, current_tool 클리어 ==========
  sqlite3 "$DB_PATH" <<EOF 2>> "$DEBUG_LOG"
UPDATE agent_runs
SET
  current_tool = NULL,
  current_tool_input = NULL,
  tool_call_count = tool_call_count + 1,
  last_stream_update = $TIMESTAMP
WHERE id = '$RUN_ID';
EOF
  echo "PostToolUse real-time update result: $?" >> "$DEBUG_LOG"
fi

echo "" >> "$DEBUG_LOG"
exit 0
