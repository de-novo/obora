#!/bin/bash
# Workflow Enforcement Script
#
# 이 스크립트는 PreToolUse hook에서 호출됩니다.
# Write/Edit 도구 사용 시 워크플로우를 따르는지 검증합니다.
#
# Exit codes:
#   0 - 허용 (에이전트를 통한 호출)
#   2 - 차단 (직접 호출 시도)

# stdin에서 JSON 입력 읽기
INPUT=$(cat)

# 파일 경로 추출
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // ""')

# 설정 파일은 직접 수정 허용
if [[ "$FILE_PATH" == *".claude/"* ]]; then
  exit 0
fi

# 문서 파일은 직접 수정 허용
if [[ "$FILE_PATH" == *".md" ]] || [[ "$FILE_PATH" == *".txt" ]]; then
  exit 0
fi

# JSON/YAML 설정 파일은 직접 수정 허용
if [[ "$FILE_PATH" == *".json" ]] || [[ "$FILE_PATH" == *".yaml" ]] || [[ "$FILE_PATH" == *".yml" ]]; then
  exit 0
fi

# 세션 타입 확인 (subagent인지 확인)
SESSION_TYPE=$(echo "$INPUT" | jq -r '.session_type // "main"')

# 에이전트(subagent)를 통한 호출은 허용
if [[ "$SESSION_TYPE" == "subagent" ]]; then
  exit 0
fi

# 코드 파일 직접 수정 시도 차단
if [[ "$FILE_PATH" == *.ts ]] || [[ "$FILE_PATH" == *.tsx ]] || \
   [[ "$FILE_PATH" == *.js ]] || [[ "$FILE_PATH" == *.jsx ]]; then
  echo "워크플로우 위반: 코드 파일은 에이전트를 통해 수정해야 합니다." >&2
  echo "" >&2
  echo "사용 방법:" >&2
  echo "  /implement <작업 설명>  - 새 기능 구현" >&2
  echo "  /fix <버그 설명>        - 버그 수정" >&2
  echo "" >&2
  echo "또는 Task tool로 orchestrator 에이전트를 호출하세요." >&2
  exit 2
fi

# 그 외 파일은 허용
exit 0
