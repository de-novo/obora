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
PROJECT_ROOT="${SCRIPT_DIR}/../../.."
DEBUG_LOG="${SCRIPT_DIR}/../../logs/hook-debug.log"

# OBORA_INTERNAL=true면 내부 호출이므로 스킵 (title-generate 등)
if [ "$OBORA_INTERNAL" = "true" ]; then
  echo "=== Stop SKIPPED (internal call) $(date) ===" >> "$DEBUG_LOG"
  exit 0
fi

# .env 파일 로드 (프로젝트 루트)
ENV_FILE="${PROJECT_ROOT}/.env"
if [ -f "$ENV_FILE" ]; then
  # .env에서 OBORA_DEV 읽기 (export 없이 설정된 경우도 처리)
  OBORA_DEV_FROM_ENV=$(grep -E "^OBORA_DEV=" "$ENV_FILE" 2>/dev/null | cut -d '=' -f2 | tr -d '"' | tr -d "'")
  if [ -n "$OBORA_DEV_FROM_ENV" ]; then
    export OBORA_DEV="$OBORA_DEV_FROM_ENV"
  fi
fi

# Dashboard DB 경로
DB_PATH="${HOME}/.obora/dashboard.db"
WORKFLOW_FILE="${HOME}/.obora/current-workflow.txt"
PROMPT_FILE="${HOME}/.obora/current-prompt-timestamp.txt"
MAIN_STEP_FILE="${HOME}/.obora/current-main-step.txt"
MAIN_RUN_FILE="${HOME}/.obora/current-main-run.txt"

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

  # 최근 1000줄만 처리 (전체 파일은 손상된 JSON으로 인해 파싱 실패 가능)
  # 최근 데이터는 일반적으로 유효함
  if [ -n "$PROMPT_TIMESTAMP" ]; then
    # 해당 타임스탬프 이후의 assistant 메시지만 추출
    MAIN_OUTPUT=$(tail -1000 "$TRANSCRIPT_PATH" | jq -rs --arg ts "$PROMPT_TIMESTAMP" '
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
    MAIN_OUTPUT=$(tail -1000 "$TRANSCRIPT_PATH" | jq -rs '
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

# Main Run ID 읽기
MAIN_RUN_ID=""
if [ -f "$MAIN_RUN_FILE" ]; then
  MAIN_RUN_ID=$(cat "$MAIN_RUN_FILE")
fi

# 워크플로우 상태 업데이트 (output 포함)
# NULLIF로 빈 문자열을 NULL로 변환 (Drizzle JSON 파싱 에러 방지)
sqlite3 "$DB_PATH" <<EOF 2>> "$DEBUG_LOG"
UPDATE workflows
SET
  status = 'completed',
  ended_at = $TIMESTAMP,
  tokens_used = $TOTAL_TOKENS,
  output = NULLIF('$MAIN_OUTPUT_ESCAPED', '')
WHERE id = '$WORKFLOW_ID';

-- workflow_steps도 완료 처리
UPDATE workflow_steps
SET
  status = 'completed',
  ended_at = $TIMESTAMP,
  output = NULLIF('$MAIN_OUTPUT_ESCAPED', '')
WHERE workflow_id = '$WORKFLOW_ID' AND status = 'running';

-- Main agent_run 완료 처리
UPDATE agent_runs
SET
  status = 'completed',
  ended_at = $TIMESTAMP,
  output = NULLIF('$MAIN_OUTPUT_ESCAPED', ''),
  current_tool = NULL,
  current_tool_input = NULL,
  last_stream_update = $TIMESTAMP
WHERE id = '$MAIN_RUN_ID';
EOF

echo "Workflow complete update result: $?" >> "$DEBUG_LOG"

# ============================================================================
# 워크플로우 제목 자동 생성 (백그라운드에서 실행)
# ============================================================================
# OBORA_DEV=true: 개발환경 (로컬 프로젝트 CLI 사용)
# OBORA_DEV 없음: 프로덕션 (글로벌 obora 명령어 사용)

if [ "$OBORA_DEV" = "true" ]; then
  # 개발환경: 현재 프로젝트의 빌드된 CLI 사용
  OBORA_SCRIPT="${SCRIPT_DIR}/../../../packages/cli/dist/obora.mjs"
  if [ -f "$OBORA_SCRIPT" ]; then
    echo "Running obora title-generate (dev mode)..." >> "$DEBUG_LOG"
    (OBORA_INTERNAL=true node "$OBORA_SCRIPT" title-generate --quiet >> "$DEBUG_LOG" 2>&1) &
  else
    echo "Dev mode but obora script not found: $OBORA_SCRIPT" >> "$DEBUG_LOG"
  fi
else
  # 프로덕션: 글로벌 설치된 obora 사용
  if command -v obora &> /dev/null; then
    echo "Running obora title-generate (production)..." >> "$DEBUG_LOG"
    (OBORA_INTERNAL=true obora title-generate --quiet >> "$DEBUG_LOG" 2>&1) &
  else
    echo "obora CLI not found, skipping title generation" >> "$DEBUG_LOG"
  fi
fi

# 임시 파일 삭제
rm -f "$WORKFLOW_FILE"
rm -f "$PROMPT_FILE"
rm -f "$MAIN_STEP_FILE"
rm -f "$MAIN_RUN_FILE"
echo "Workflow and temp files removed" >> "$DEBUG_LOG"

echo "" >> "$DEBUG_LOG"
