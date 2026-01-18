#!/bin/bash
# 최근 인터뷰 워크플로우 조회 (토픽 매칭 지원)
#
# Usage:
#   ./get-recent-interview.sh [project_path] [topic] [mode]
#
# Arguments:
#   project_path: 프로젝트 경로 (기본: pwd)
#   topic: 검색할 토픽/키워드 (옵션)
#   mode: "list" = 후보 목록 반환, "single" = 최적 매칭 1개 (기본)
#
# 출력:
#   mode=single: 요구사항 문서 내용
#   mode=list: JSON 형식 [{id, name, topic, created_at}, ...]
#
# 반환값: 0=성공, 1=인터뷰 없음

DB_PATH="${HOME}/.obora/dashboard.db"
PROJECT_PATH="${1:-$(pwd)}"
TOPIC="${2:-}"
MODE="${3:-single}"

# DB 존재 확인
if [ ! -f "$DB_PATH" ]; then
  exit 1
fi

# 프로젝트 경로로 project_id 찾기
PROJECT_ID=$(sqlite3 "$DB_PATH" "
SELECT id FROM projects WHERE path = '$PROJECT_PATH' LIMIT 1;
" 2>/dev/null)

# SQL 이스케이프
TOPIC_ESCAPED=$(echo "$TOPIC" | sed "s/'/''/g")

# 모드별 처리
if [ "$MODE" = "list" ]; then
  # 후보 목록 반환 (JSON)
  if [ -n "$PROJECT_ID" ]; then
    sqlite3 "$DB_PATH" "
      SELECT json_group_array(json_object(
        'id', w.id,
        'name', w.name,
        'started_at', datetime(w.started_at, 'unixepoch')
      ))
      FROM workflows w
      JOIN sessions s ON w.session_id = s.id
      WHERE s.project_id = '$PROJECT_ID'
        AND w.status = 'completed'
        AND (w.output LIKE '# 요구사항 명세서:%' OR w.name LIKE '%/interview%')
        AND w.started_at > strftime('%s', 'now', '-24 hours')
      ORDER BY w.started_at DESC
      LIMIT 10;
    " 2>/dev/null
  else
    sqlite3 "$DB_PATH" "
      SELECT json_group_array(json_object(
        'id', id,
        'name', name,
        'started_at', datetime(started_at, 'unixepoch')
      ))
      FROM workflows
      WHERE status = 'completed'
        AND (output LIKE '# 요구사항 명세서:%' OR name LIKE '%/interview%')
        AND started_at > strftime('%s', 'now', '-24 hours')
      ORDER BY started_at DESC
      LIMIT 10;
    " 2>/dev/null
  fi
  exit 0
fi

# single 모드: 최적 매칭 1개 반환

# 토픽이 있으면 토픽 매칭만 시도 (fallback 없음)
if [ -n "$TOPIC" ]; then
  if [ -n "$PROJECT_ID" ]; then
    INTERVIEW_OUTPUT=$(sqlite3 "$DB_PATH" "
      SELECT w.output
      FROM workflows w
      JOIN sessions s ON w.session_id = s.id
      WHERE s.project_id = '$PROJECT_ID'
        AND w.status = 'completed'
        AND w.output LIKE '# 요구사항 명세서:%'
        AND (w.name LIKE '%$TOPIC_ESCAPED%' OR w.output LIKE '%$TOPIC_ESCAPED%')
        AND w.started_at > strftime('%s', 'now', '-24 hours')
      ORDER BY w.started_at DESC
      LIMIT 1;
    " 2>/dev/null)
  else
    INTERVIEW_OUTPUT=$(sqlite3 "$DB_PATH" "
      SELECT output
      FROM workflows
      WHERE status = 'completed'
        AND output LIKE '# 요구사항 명세서:%'
        AND (name LIKE '%$TOPIC_ESCAPED%' OR output LIKE '%$TOPIC_ESCAPED%')
        AND started_at > strftime('%s', 'now', '-24 hours')
      ORDER BY started_at DESC
      LIMIT 1;
    " 2>/dev/null)
  fi

  # 토픽이 있는데 매칭 실패하면 종료 (fallback 없음)
  if [ -z "$INTERVIEW_OUTPUT" ]; then
    exit 1
  fi

  echo "$INTERVIEW_OUTPUT"
  exit 0
fi

# 토픽 없음 → 최근 요구사항 명세서 반환 (list용 또는 전체 조회)
if [ -n "$PROJECT_ID" ]; then
  INTERVIEW_OUTPUT=$(sqlite3 "$DB_PATH" "
    SELECT w.output
    FROM workflows w
    JOIN sessions s ON w.session_id = s.id
    WHERE s.project_id = '$PROJECT_ID'
      AND w.status = 'completed'
      AND w.output LIKE '# 요구사항 명세서:%'
      AND w.started_at > strftime('%s', 'now', '-24 hours')
    ORDER BY w.started_at DESC
    LIMIT 1;
  " 2>/dev/null)
else
  INTERVIEW_OUTPUT=$(sqlite3 "$DB_PATH" "
    SELECT output
    FROM workflows
    WHERE status = 'completed'
      AND output LIKE '# 요구사항 명세서:%'
      AND started_at > strftime('%s', 'now', '-24 hours')
    ORDER BY started_at DESC
    LIMIT 1;
  " 2>/dev/null)
fi

if [ -z "$INTERVIEW_OUTPUT" ]; then
  exit 1
fi

echo "$INTERVIEW_OUTPUT"
exit 0
