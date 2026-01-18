#!/bin/bash
# 에이전트 로깅 데이터베이스 초기화

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
DB_PATH="${CLAUDE_DIR}/logs/agents.db"
SCHEMA_PATH="${SCRIPT_DIR}/schema.sql"

# logs 디렉토리 생성
mkdir -p "$(dirname "$DB_PATH")"

# 데이터베이스 초기화
if [ ! -f "$DB_PATH" ]; then
  echo "Initializing agent logging database..."
  sqlite3 "$DB_PATH" < "$SCHEMA_PATH"
  echo "Database created at: $DB_PATH"
else
  # 스키마 업데이트 (테이블이 없으면 생성)
  sqlite3 "$DB_PATH" < "$SCHEMA_PATH" 2>/dev/null || true
fi

echo "$DB_PATH"
