#!/bin/bash
# 에이전트 시작 로깅
# Hook: SubagentStart
# Input (stdin): JSON with agent info

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="$("${SCRIPT_DIR}/init-db.sh" 2>/dev/null | tail -1)"

# stdin에서 JSON 읽기
INPUT=$(cat)

# JSON 파싱
AGENT_NAME=$(echo "$INPUT" | jq -r '.agent_name // .subagent_type // "unknown"')
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

# 세션 확인/생성
if [ -n "$SESSION_ID" ] && [ "$SESSION_ID" != "null" ]; then
  sqlite3 "$DB_PATH" "INSERT OR IGNORE INTO sessions (id) VALUES ('$SESSION_ID');"
fi

# 에이전트 실행 기록
sqlite3 "$DB_PATH" <<EOF
INSERT INTO agent_runs (id, session_id, agent_name, agent_category, model, status, started_at)
VALUES (
  '$RUN_ID',
  $([ -n "$SESSION_ID" ] && [ "$SESSION_ID" != "null" ] && echo "'$SESSION_ID'" || echo "NULL"),
  '$AGENT_NAME',
  $([ -n "$CATEGORY" ] && echo "'$CATEGORY'" || echo "NULL"),
  '$MODEL',
  'running',
  datetime('now')
);
EOF

# 에이전트 레지스트리 업데이트 (사용 횟수)
sqlite3 "$DB_PATH" <<EOF
UPDATE agent_registry
SET usage_count = usage_count + 1, last_updated = datetime('now')
WHERE name = '$AGENT_NAME';
EOF

# RUN_ID 출력 (다른 스크립트에서 사용)
echo "$RUN_ID"
