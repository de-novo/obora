#!/bin/bash
# 에이전트 시작 로깅
# Hook: SubagentStart
# Input (stdin): JSON with agent info

# set -e 제거 - 중간 실패해도 계속 진행

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEBUG_LOG="${SCRIPT_DIR}/../../logs/hook-debug.log"
mkdir -p "$(dirname "$DEBUG_LOG")"

# DB 경로 직접 설정 (init-db.sh 호출 문제 방지)
DB_PATH="${SCRIPT_DIR}/../../logs/agents.db"

# stdin에서 JSON 읽기
INPUT=$(cat)

# 디버그 로깅
echo "=== SubagentStart $(date) ===" >> "$DEBUG_LOG"
echo "$INPUT" >> "$DEBUG_LOG"
echo "DB_PATH: $DB_PATH" >> "$DEBUG_LOG"

# JSON 파싱 - Claude Code hook 형식에 맞게 수정
# SubagentStart hook은 agent_type 필드를 사용
AGENT_NAME=$(echo "$INPUT" | jq -r '.agent_type // .subagent_type // .agent_name // "unknown"')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
RUN_ID=$(echo "$INPUT" | jq -r '.agent_id // ""')
MODEL=$(echo "$INPUT" | jq -r '.model // "inherit"')

# RUN_ID가 없으면 생성
if [ -z "$RUN_ID" ] || [ "$RUN_ID" = "null" ]; then
  RUN_ID="run_$(date +%s)_$$"
fi

# 에이전트 카테고리 추출 (파일 경로에서)
CATEGORY=""
if [[ "$AGENT_NAME" == *"/"* ]]; then
  CATEGORY=$(echo "$AGENT_NAME" | cut -d'/' -f1)
  AGENT_NAME=$(echo "$AGENT_NAME" | cut -d'/' -f2)
fi

# 디버그 - 파싱 결과
echo "AGENT_NAME: $AGENT_NAME, SESSION_ID: $SESSION_ID, RUN_ID: $RUN_ID" >> "$DEBUG_LOG"

# 세션 확인/생성
if [ -n "$SESSION_ID" ] && [ "$SESSION_ID" != "null" ]; then
  sqlite3 "$DB_PATH" "INSERT OR IGNORE INTO sessions (id) VALUES ('$SESSION_ID');" 2>> "$DEBUG_LOG"
  echo "Session insert result: $?" >> "$DEBUG_LOG"
fi

# 에이전트 실행 기록
sqlite3 "$DB_PATH" "INSERT INTO agent_runs (id, session_id, agent_name, agent_category, model, status, started_at) VALUES ('$RUN_ID', $([ -n "$SESSION_ID" ] && [ "$SESSION_ID" != "null" ] && echo "'$SESSION_ID'" || echo "NULL"), '$AGENT_NAME', $([ -n "$CATEGORY" ] && echo "'$CATEGORY'" || echo "NULL"), '$MODEL', 'running', datetime('now'));" 2>> "$DEBUG_LOG"
echo "Agent run insert result: $?" >> "$DEBUG_LOG"

# 에이전트 레지스트리 업데이트 (사용 횟수)
sqlite3 "$DB_PATH" "UPDATE agent_registry SET usage_count = usage_count + 1, last_updated = datetime('now') WHERE name = '$AGENT_NAME';" 2>> "$DEBUG_LOG"

echo "" >> "$DEBUG_LOG"

# RUN_ID 출력 (다른 스크립트에서 사용)
echo "$RUN_ID"
