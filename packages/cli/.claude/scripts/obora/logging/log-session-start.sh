#!/bin/bash
# 세션 시작 로깅
# Hook: SessionStart
# Input (stdin): JSON with session info
# Target: ~/.obora/dashboard.db
#
# 역할: sessions 테이블에 새 세션 생성, session_id를 파일에 저장

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

# stdin에서 JSON 읽기
INPUT=$(cat)

# 디버그 로깅
echo "=== SessionStart $(date) ===" >> "$DEBUG_LOG"
echo "$INPUT" >> "$DEBUG_LOG"

# DB 존재 확인
if [ ! -f "$DB_PATH" ]; then
  echo "Dashboard DB not found: $DB_PATH" >> "$DEBUG_LOG"
  exit 0
fi

# JSON 파싱
SESSION_TYPE=$(echo "$INPUT" | jq -r '.type // "startup"')
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')

# 세션 ID 생성 (Claude Code 세션용 접두사)
SESSION_ID="cc_$(date +%s)_$$"
TIMESTAMP=$(date +%s)

# 프로젝트 경로로 프로젝트 ID 조회
PROJECT_ID=""
if [ -n "$CWD" ] && [ "$CWD" != "null" ]; then
  PROJECT_ID=$(sqlite3 "$DB_PATH" "SELECT id FROM projects WHERE path = '$CWD' LIMIT 1;" 2>/dev/null)
fi

# 프로젝트가 없으면 CWD 기반으로 새 프로젝트 자동 생성
if [ -z "$PROJECT_ID" ]; then
  # CWD에서 프로젝트 이름 추출 (마지막 디렉토리명)
  if [ -n "$CWD" ] && [ "$CWD" != "null" ] && [ "$CWD" != "/" ]; then
    PROJECT_NAME=$(basename "$CWD")
    # 경로 해시로 고유 ID 생성
    PATH_HASH=$(echo "$CWD" | md5 | head -c 16)
    PROJECT_ID="proj_${PATH_HASH}"

    sqlite3 "$DB_PATH" <<EOF 2>> "$DEBUG_LOG"
INSERT OR IGNORE INTO projects (id, name, path, description, color, status)
VALUES ('$PROJECT_ID', '$PROJECT_NAME', '$CWD', 'Auto-created from Claude Code session', '#6366f1', 'active');
EOF
    echo "Auto-created project: $PROJECT_NAME ($PROJECT_ID)" >> "$DEBUG_LOG"
  else
    # CWD가 없거나 루트인 경우 기본 프로젝트 사용
    PROJECT_ID=$(sqlite3 "$DB_PATH" "SELECT id FROM projects WHERE name = 'Default' LIMIT 1;" 2>/dev/null)
    if [ -z "$PROJECT_ID" ]; then
      PROJECT_ID="proj_default"
      sqlite3 "$DB_PATH" <<EOF 2>> "$DEBUG_LOG"
INSERT OR IGNORE INTO projects (id, name, path, description, color, status)
VALUES ('$PROJECT_ID', 'Default', '/', 'Default project for unknown paths', '#8b5cf6', 'active');
EOF
    fi
  fi
fi

echo "PROJECT_ID: $PROJECT_ID, SESSION_ID: $SESSION_ID" >> "$DEBUG_LOG"

# 세션 레코드 생성
sqlite3 "$DB_PATH" <<EOF 2>> "$DEBUG_LOG"
INSERT INTO sessions (
  id,
  project_id,
  status,
  started_at,
  total_tokens,
  metadata
) VALUES (
  '$SESSION_ID',
  '$PROJECT_ID',
  'active',
  $TIMESTAMP,
  0,
  '{"type": "$SESSION_TYPE", "source": "claude-code", "cwd": "$CWD"}'
);
EOF

RESULT=$?
echo "Session insert result: $RESULT" >> "$DEBUG_LOG"

# 세션 ID를 파일에 저장 (다른 훅에서 사용)
if [ $RESULT -eq 0 ]; then
  mkdir -p "$(dirname "$SESSION_FILE")"
  echo "$SESSION_ID" > "$SESSION_FILE"
  echo "Session ID saved to: $SESSION_FILE" >> "$DEBUG_LOG"
fi

echo "" >> "$DEBUG_LOG"
