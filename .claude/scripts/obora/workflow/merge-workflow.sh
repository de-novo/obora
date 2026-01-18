#!/bin/bash
# 현재 워크플로우를 기존 워크플로우에 병합
# Usage: merge-workflow.sh <target_workflow_id>
#
# 현재 워크플로우의 스텝/에이전트 실행을 타겟 워크플로우로 이동하고
# 현재 워크플로우는 삭제 (또는 merged 상태로 변경)
#
# Example:
#   merge-workflow.sh wf_abc123

DB_PATH="${HOME}/.obora/dashboard.db"
CURRENT_WORKFLOW_FILE="${HOME}/.obora/current-workflow.txt"
CURRENT_STEP_FILE="${HOME}/.obora/current-main-step.txt"
CURRENT_RUN_FILE="${HOME}/.obora/current-main-run.txt"

TARGET_WORKFLOW_ID="$1"

# 인자 검증
if [ -z "$TARGET_WORKFLOW_ID" ]; then
  echo "Usage: merge-workflow.sh <target_workflow_id>"
  exit 1
fi

# 현재 워크플로우 ID 읽기
if [ ! -f "$CURRENT_WORKFLOW_FILE" ]; then
  echo "Error: No current workflow found"
  exit 1
fi

CURRENT_WORKFLOW_ID=$(cat "$CURRENT_WORKFLOW_FILE")

# 같은 워크플로우면 무시
if [ "$CURRENT_WORKFLOW_ID" = "$TARGET_WORKFLOW_ID" ]; then
  echo "Current workflow is already the target. No merge needed."
  exit 0
fi

# DB 존재 확인
if [ ! -f "$DB_PATH" ]; then
  echo "Error: Database not found at $DB_PATH"
  exit 1
fi

# 트랜잭션으로 병합 수행
sqlite3 "$DB_PATH" <<EOF
BEGIN TRANSACTION;

-- 워크플로우 스텝을 타겟으로 이동
UPDATE workflow_steps
SET workflow_id = '$TARGET_WORKFLOW_ID'
WHERE workflow_id = '$CURRENT_WORKFLOW_ID';

-- 현재 워크플로우 삭제 (또는 merged 상태로 변경)
DELETE FROM workflows WHERE id = '$CURRENT_WORKFLOW_ID';

-- 타겟 워크플로우 상태를 running으로 업데이트 (완료되었다면)
UPDATE workflows
SET status = 'running'
WHERE id = '$TARGET_WORKFLOW_ID' AND status IN ('completed', 'idle');

COMMIT;
EOF

if [ $? -eq 0 ]; then
  # 현재 워크플로우 파일 업데이트
  echo "$TARGET_WORKFLOW_ID" > "$CURRENT_WORKFLOW_FILE"

  # 스텝/런 파일도 업데이트
  if [ -f "$CURRENT_STEP_FILE" ]; then
    STEP_ID=$(cat "$CURRENT_STEP_FILE")
    NEW_STEP_ID=$(echo "$STEP_ID" | sed "s/$CURRENT_WORKFLOW_ID/$TARGET_WORKFLOW_ID/g")
    echo "$NEW_STEP_ID" > "$CURRENT_STEP_FILE"
  fi

  if [ -f "$CURRENT_RUN_FILE" ]; then
    RUN_ID=$(cat "$CURRENT_RUN_FILE")
    NEW_RUN_ID=$(echo "$RUN_ID" | sed "s/$CURRENT_WORKFLOW_ID/$TARGET_WORKFLOW_ID/g")
    echo "$NEW_RUN_ID" > "$CURRENT_RUN_FILE"
  fi

  echo "Merged workflow $CURRENT_WORKFLOW_ID into $TARGET_WORKFLOW_ID"
else
  echo "Error: Failed to merge workflows"
  exit 1
fi
