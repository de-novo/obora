#!/bin/bash
# 워크플로우 정보 업데이트
# Usage: update-workflow.sh <workflow_id> <field> <value>
#
# Fields:
#   title - 워크플로우 제목 업데이트
#   status - 워크플로우 상태 업데이트
#
# Example:
#   update-workflow.sh wf_abc123 title "CLI 글로벌 설정 기능 구현"

DB_PATH="${HOME}/.obora/dashboard.db"

WORKFLOW_ID="$1"
FIELD="$2"
VALUE="$3"

# 인자 검증
if [ -z "$WORKFLOW_ID" ] || [ -z "$FIELD" ] || [ -z "$VALUE" ]; then
  echo "Usage: update-workflow.sh <workflow_id> <field> <value>"
  echo "Fields: title, status"
  exit 1
fi

# DB 존재 확인
if [ ! -f "$DB_PATH" ]; then
  echo "Error: Database not found at $DB_PATH"
  exit 1
fi

# SQL 인젝션 방지: 값 이스케이프
VALUE_ESCAPED=$(echo "$VALUE" | sed "s/'/''/g")

case "$FIELD" in
  "title"|"name")
    sqlite3 "$DB_PATH" "UPDATE workflows SET name = '$VALUE_ESCAPED' WHERE id = '$WORKFLOW_ID';"
    ;;
  "status")
    sqlite3 "$DB_PATH" "UPDATE workflows SET status = '$VALUE_ESCAPED' WHERE id = '$WORKFLOW_ID';"
    ;;
  *)
    echo "Error: Unknown field '$FIELD'. Supported: title, status"
    exit 1
    ;;
esac

if [ $? -eq 0 ]; then
  echo "Updated workflow $WORKFLOW_ID: $FIELD = $VALUE"
else
  echo "Error: Failed to update workflow"
  exit 1
fi
