#!/bin/bash
# 에이전트 종료 로깅
# Hook: SubagentStop
# Input (stdin): JSON with agent result

# set -e 제거 - 중간 실패해도 계속 진행

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# DB 경로 직접 설정
DB_PATH="${SCRIPT_DIR}/../../logs/agents.db"

# stdin에서 JSON 읽기
INPUT=$(cat)

# JSON 파싱
AGENT_NAME=$(echo "$INPUT" | jq -r '.agent_name // .subagent_type // "unknown"')
RUN_ID=$(echo "$INPUT" | jq -r '.agent_id // ""')
STATUS=$(echo "$INPUT" | jq -r '.status // "completed"')
OUTPUT=$(echo "$INPUT" | jq -r '.output // .result // ""' | head -c 1000)  # 최대 1000자
ERROR=$(echo "$INPUT" | jq -r '.error // ""')

# 상태 매핑
case "$STATUS" in
  "success"|"done"|"") STATUS="completed" ;;
  "error"|"exception") STATUS="failed" ;;
  *) STATUS="$STATUS" ;;
esac

# 실행 기록 업데이트
if [ -n "$RUN_ID" ] && [ "$RUN_ID" != "null" ]; then
  # 특정 RUN_ID 업데이트
  sqlite3 "$DB_PATH" <<EOF
UPDATE agent_runs
SET
  status = '$STATUS',
  ended_at = datetime('now'),
  duration_ms = CAST((julianday('now') - julianday(started_at)) * 86400000 AS INTEGER),
  output_summary = '$(echo "$OUTPUT" | sed "s/'/''/g")',
  error_message = $([ -n "$ERROR" ] && [ "$ERROR" != "null" ] && echo "'$(echo "$ERROR" | sed "s/'/''/g")'" || echo "NULL")
WHERE id = '$RUN_ID';
EOF
else
  # 가장 최근 running 상태의 해당 에이전트 업데이트
  sqlite3 "$DB_PATH" <<EOF
UPDATE agent_runs
SET
  status = '$STATUS',
  ended_at = datetime('now'),
  duration_ms = CAST((julianday('now') - julianday(started_at)) * 86400000 AS INTEGER),
  output_summary = '$(echo "$OUTPUT" | sed "s/'/''/g")',
  error_message = $([ -n "$ERROR" ] && [ "$ERROR" != "null" ] && echo "'$(echo "$ERROR" | sed "s/'/''/g")'" || echo "NULL")
WHERE agent_name = '$AGENT_NAME'
  AND status = 'running'
  AND id = (SELECT id FROM agent_runs WHERE agent_name = '$AGENT_NAME' AND status = 'running' ORDER BY started_at DESC LIMIT 1);
EOF
fi

# 에이전트 통계 업데이트
sqlite3 "$DB_PATH" <<EOF
UPDATE agent_registry
SET
  avg_duration_ms = (
    SELECT ROUND(AVG(duration_ms))
    FROM agent_runs
    WHERE agent_name = '$AGENT_NAME' AND duration_ms IS NOT NULL
  ),
  success_rate = (
    SELECT ROUND(100.0 * SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) / COUNT(*), 2)
    FROM agent_runs
    WHERE agent_name = '$AGENT_NAME'
  )
WHERE name = '$AGENT_NAME';
EOF

echo "Agent $AGENT_NAME completed with status: $STATUS"
