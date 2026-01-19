#!/bin/bash
# 사용자 프롬프트 제출 로깅
# Hook: UserPromptSubmit
# Input (stdin): JSON with prompt info
# Target: ~/.obora/dashboard.db
#
# 역할:
#   1. workflows 테이블에 새 워크플로우 생성
#   2. 워크플로우 컨텍스트 저장 (제목 자동 업데이트용)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEBUG_LOG="${SCRIPT_DIR}/../../logs/hook-debug.log"
mkdir -p "$(dirname "$DEBUG_LOG")"

# OBORA_INTERNAL=true면 내부 호출이므로 스킵 (title-generate 등)
if [ "$OBORA_INTERNAL" = "true" ]; then
  exit 0
fi

# Dashboard DB 경로
DB_PATH="${HOME}/.obora/dashboard.db"
SESSION_FILE="${HOME}/.obora/current-session.txt"
WORKFLOW_FILE="${HOME}/.obora/current-workflow.txt"
STEP_COUNTER_FILE="${HOME}/.obora/workflow-step-counter.txt"
PROMPT_TIMESTAMP_FILE="${HOME}/.obora/current-prompt-timestamp.txt"
WORKFLOW_CONTEXT_FILE="${HOME}/.obora/workflow-context.json"
CWD_FILE="${HOME}/.obora/current-cwd.txt"

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

# CWD 읽기: 먼저 stdin JSON에서 시도, 없으면 파일에서 읽기
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')
if [ -z "$CWD" ] || [ "$CWD" = "null" ]; then
  if [ -f "$CWD_FILE" ]; then
    CWD=$(cat "$CWD_FILE")
  fi
fi

# CWD 기반 프로젝트 ID 조회/생성
PROJECT_ID=""
if [ -n "$CWD" ] && [ "$CWD" != "null" ] && [ "$CWD" != "/" ]; then
  # 기존 프로젝트 조회
  PROJECT_ID=$(sqlite3 "$DB_PATH" "SELECT id FROM projects WHERE path = '$CWD' LIMIT 1;" 2>/dev/null)

  # 프로젝트가 없으면 자동 생성
  if [ -z "$PROJECT_ID" ]; then
    PROJECT_NAME=$(basename "$CWD")
    PATH_HASH=$(echo "$CWD" | md5 | head -c 16)
    PROJECT_ID="proj_${PATH_HASH}"

    sqlite3 "$DB_PATH" <<PROJ_EOF 2>> "$DEBUG_LOG"
INSERT OR IGNORE INTO projects (id, name, path, description, color, status)
VALUES ('$PROJECT_ID', '$PROJECT_NAME', '$CWD', 'Auto-created from workflow', '#6366f1', 'active');
PROJ_EOF
    echo "Auto-created project from workflow: $PROJECT_NAME ($PROJECT_ID)" >> "$DEBUG_LOG"
  fi
fi

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

echo "SESSION_ID: $SESSION_ID, WORKFLOW_ID: $WORKFLOW_ID, CWD: $CWD, PROJECT_ID: $PROJECT_ID" >> "$DEBUG_LOG"
echo "USER_PROMPT: $USER_PROMPT" >> "$DEBUG_LOG"
echo "INPUT_JSON: $INPUT_JSON" >> "$DEBUG_LOG"

# project_id 값 준비 (NULL 또는 quoted string)
if [ -n "$PROJECT_ID" ]; then
  PROJECT_ID_SQL="'$PROJECT_ID'"
else
  PROJECT_ID_SQL="NULL"
fi

# 워크플로우 생성 (cwd, project_id 컬럼 포함)
sqlite3 "$DB_PATH" <<EOF 2>> "$DEBUG_LOG"
INSERT INTO workflows (
  id,
  session_id,
  project_id,
  name,
  type,
  status,
  started_at,
  input,
  cwd,
  tokens_used
) VALUES (
  '$WORKFLOW_ID',
  '$SESSION_ID',
  $PROJECT_ID_SQL,
  '$USER_PROMPT_ESCAPED',
  'claude-code',
  'running',
  $TIMESTAMP,
  '$INPUT_JSON_ESCAPED',
  '$CWD',
  0
);
EOF

echo "Workflow insert result: $?" >> "$DEBUG_LOG"

# 워크플로우 ID 저장
echo "$WORKFLOW_ID" > "$WORKFLOW_FILE"
echo "Workflow ID saved to: $WORKFLOW_FILE" >> "$DEBUG_LOG"

# 스텝 카운터 초기화
echo "1" > "$STEP_COUNTER_FILE"

# ============================================================================
# Main Claude 스텝 생성 (항상 생성)
# ============================================================================
MAIN_STEP_ID="step_main_${WORKFLOW_ID}"
MAIN_RUN_ID="run_main_${WORKFLOW_ID}"

# Main 스텝 생성
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
  '$MAIN_STEP_ID',
  '$WORKFLOW_ID',
  0,
  'main-claude',
  '$USER_PROMPT_ESCAPED',
  'running',
  $TIMESTAMP,
  0
);
EOF
echo "Main step insert result: $?" >> "$DEBUG_LOG"

# Main agent_run 생성
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
  tool_call_count
) VALUES (
  '$MAIN_RUN_ID',
  '$SESSION_ID',
  '$MAIN_STEP_ID',
  'main-claude',
  'running',
  $TIMESTAMP,
  0, 0, 0, 0
);
EOF
echo "Main agent_run insert result: $?" >> "$DEBUG_LOG"

# Main 스텝 ID 저장 (tool-use에서 사용)
MAIN_STEP_FILE="${HOME}/.obora/current-main-step.txt"
MAIN_RUN_FILE="${HOME}/.obora/current-main-run.txt"
echo "$MAIN_STEP_ID" > "$MAIN_STEP_FILE"
echo "$MAIN_RUN_ID" > "$MAIN_RUN_FILE"
echo "Main step/run IDs saved" >> "$DEBUG_LOG"

# 프롬프트 타임스탬프 저장 (Stop hook에서 현재 턴의 output 추출용)
# transcript의 timestamp 형식과 맞추기 위해 ISO 8601 형식 사용
PROMPT_TS=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
echo "$PROMPT_TS" > "$PROMPT_TIMESTAMP_FILE"
echo "Prompt timestamp saved: $PROMPT_TS" >> "$DEBUG_LOG"

# ============================================================================
# 워크플로우 컨텍스트 저장 (제목 자동 업데이트용)
# ============================================================================
cat > "$WORKFLOW_CONTEXT_FILE" <<CONTEXT_EOF
{
  "current_workflow_id": "$WORKFLOW_ID",
  "current_prompt": $(echo "$USER_PROMPT" | jq -Rs '.'),
  "session_id": "$SESSION_ID",
  "timestamp": $TIMESTAMP
}
CONTEXT_EOF

echo "Workflow context saved to: $WORKFLOW_CONTEXT_FILE" >> "$DEBUG_LOG"

echo "" >> "$DEBUG_LOG"
