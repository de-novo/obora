#!/bin/bash
# 최근 인터뷰 워크플로우 조회
# Usage: ./get-recent-interview.sh [project_path]
#
# 출력: 가장 최근 인터뷰의 output (요구사항 문서)
# 반환값: 0=성공 (요구사항 발견), 1=인터뷰 없음
#
# 우선순위:
#   1. output이 "# 요구사항 명세서:" 로 시작하는 워크플로우 (실제 인터뷰 결과)
#   2. name에 'interview' 포함하고 output이 있는 워크플로우

DB_PATH="${HOME}/.obora/dashboard.db"
PROJECT_PATH="${1:-$(pwd)}"

# DB 존재 확인
if [ ! -f "$DB_PATH" ]; then
  exit 1
fi

# 프로젝트 경로로 project_id 찾기
PROJECT_ID=$(sqlite3 "$DB_PATH" "
SELECT id FROM projects WHERE path = '$PROJECT_PATH' LIMIT 1;
" 2>/dev/null)

# 1차: 실제 요구사항 명세서 형식인 워크플로우 찾기
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

# 1차에서 못 찾으면 2차: 인터뷰 관련 워크플로우
if [ -z "$INTERVIEW_OUTPUT" ]; then
  if [ -n "$PROJECT_ID" ]; then
    INTERVIEW_OUTPUT=$(sqlite3 "$DB_PATH" "
      SELECT w.output
      FROM workflows w
      JOIN sessions s ON w.session_id = s.id
      WHERE s.project_id = '$PROJECT_ID'
        AND (
          w.name LIKE '%/interview%' OR
          w.type = 'interview'
        )
        AND w.status = 'completed'
        AND w.output IS NOT NULL
        AND w.output != ''
        AND LENGTH(w.output) > 500
        AND w.started_at > strftime('%s', 'now', '-24 hours')
      ORDER BY w.started_at DESC
      LIMIT 1;
    " 2>/dev/null)
  else
    INTERVIEW_OUTPUT=$(sqlite3 "$DB_PATH" "
      SELECT output
      FROM workflows
      WHERE (
        name LIKE '%/interview%' OR
        type = 'interview'
      )
      AND status = 'completed'
      AND output IS NOT NULL
      AND output != ''
      AND LENGTH(output) > 500
      AND started_at > strftime('%s', 'now', '-24 hours')
      ORDER BY started_at DESC
      LIMIT 1;
    " 2>/dev/null)
  fi
fi

if [ -z "$INTERVIEW_OUTPUT" ]; then
  exit 1
fi

echo "$INTERVIEW_OUTPUT"
exit 0
