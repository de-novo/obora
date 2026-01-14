#!/bin/bash
# 프롬프트 처리 완료 로깅
# Hook: Stop
# Input (stdin): JSON with completion info
# Target: ~/.obora/dashboard.db
#
# 역할: workflows 테이블의 상태를 completed로 업데이트

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEBUG_LOG="${SCRIPT_DIR}/../../logs/hook-debug.log"

# Dashboard DB 경로
DB_PATH="${HOME}/.obora/dashboard.db"
WORKFLOW_FILE="${HOME}/.obora/current-workflow.txt"

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
