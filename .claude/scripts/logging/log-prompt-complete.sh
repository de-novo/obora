#!/bin/bash
# 프롬프트 처리 완료 로깅
# Hook: Stop
# Input (stdin): JSON with completion info
# Target: ~/.obora/dashboard.db
#
# 역할:
#   - workflows 테이블의 상태를 completed로 업데이트
#   - Main Claude의 작업 내용(output) 저장

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEBUG_LOG="${SCRIPT_DIR}/../../logs/hook-debug.log"

# Dashboard DB 경로
DB_PATH="${HOME}/.obora/dashboard.db"
WORKFLOW_FILE="${HOME}/.obora/current-workflow.txt"
PROMPT_FILE="${HOME}/.obora/current-prompt-timestamp.txt"

# stdin에서 JSON 읽기
INPUT=$(cat)

# 디버그 로깅
echo "=== Stop (Prompt Complete) $(date) ===" >> "$DEBUG_LOG"
echo "$INPUT" >> "$DEBUG_LOG"

# DB 존재 확인
if [ ! -f "$DB_PATH" ]; then
  echo "Dashboard DB not found: $DB_PATH" >> "$DEBUG_LOG"
  exit 0
fi

# 워크플로우 ID 읽기
if [ ! -f "$WORKFLOW_FILE" ]; then
  echo "Workflow file not found, skipping update" >> "$DEBUG_LOG"
  exit 0
fi

WORKFLOW_ID=$(cat "$WORKFLOW_FILE")
TIMESTAMP=$(date +%s)

# transcript 경로 파싱
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""')

# ============================================================================
# Main Claude의 출력 추출 (현재 턴의 assistant 메시지만)
# ============================================================================
MAIN_OUTPUT=""

if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  echo "Parsing main transcript: $TRANSCRIPT_PATH" >> "$DEBUG_LOG"

  # 프롬프트 제출 타임스탬프 읽기 (해당 턴 시작점)
  PROMPT_TIMESTAMP=""
  if [ -f "$PROMPT_FILE" ]; then
    PROMPT_TIMESTAMP=$(cat "$PROMPT_FILE")
  fi

  if [ -n "$PROMPT_TIMESTAMP" ]; then
    # 해당 타임스탬프 이후의 assistant 메시지만 추출
    MAIN_OUTPUT=$(cat "$TRANSCRIPT_PATH" | jq -rs --arg ts "$PROMPT_TIMESTAMP" '
      [.[] |
        select(.type == "assistant") |
        select(.timestamp >= $ts) |
        select(.message.content | type == "array") |
        .message.content[] |
        select(.type == "text") |
        .text
      ] | join("\n\n")
    ' 2>/dev/null || echo "")
    echo "Extracted main output since $PROMPT_TIMESTAMP, length: ${#MAIN_OUTPUT}" >> "$DEBUG_LOG"
  else
    # 타임스탬프 없으면 마지막 assistant 메시지들 추출
    MAIN_OUTPUT=$(cat "$TRANSCRIPT_PATH" | jq -rs '
      # 마지막 user 메시지 인덱스 찾기
      (to_entries | map(select(.value.type == "user")) | last.key) as $last_user_idx |
      # 그 이후의 assistant 메시지만 추출
      .[($last_user_idx + 1):] |
      [.[] |
        select(.type == "assistant") |
        select(.message.content | type == "array") |
        .message.content[] |
        select(.type == "text") |
        .text
      ] | join("\n\n")
    ' 2>/dev/null || echo "")
    echo "Extracted main output (last turn), length: ${#MAIN_OUTPUT}" >> "$DEBUG_LOG"
  fi
fi

# SQL 이스케이프
MAIN_OUTPUT_ESCAPED=$(echo "$MAIN_OUTPUT" | sed "s/'/''/g")

echo "WORKFLOW_ID: $WORKFLOW_ID" >> "$DEBUG_LOG"

# 워크플로우에서 사용된 토큰 합계 계산
TOTAL_TOKENS=$(sqlite3 "$DB_PATH" "
SELECT COALESCE(SUM(ar.tokens_used), 0)
FROM agent_runs ar
JOIN workflow_steps ws ON ar.workflow_step_id = ws.id
WHERE ws.workflow_id = '$WORKFLOW_ID';
" 2>/dev/null)

# 워크플로우 상태 업데이트
sqlite3 "$DB_PATH" <<EOF 2>> "$DEBUG_LOG"
UPDATE workflows
SET
  status = 'completed',
  ended_at = $TIMESTAMP,
  tokens_used = $TOTAL_TOKENS
WHERE id = '$WORKFLOW_ID';

-- workflow_steps도 완료 처리
UPDATE workflow_steps
SET status = 'completed', ended_at = $TIMESTAMP
WHERE workflow_id = '$WORKFLOW_ID' AND status = 'running';
EOF

echo "Workflow complete update result: $?" >> "$DEBUG_LOG"

# 워크플로우 파일 삭제 (다음 프롬프트에서 새로 생성)
rm -f "$WORKFLOW_FILE"
echo "Workflow file removed" >> "$DEBUG_LOG"

echo "" >> "$DEBUG_LOG"
