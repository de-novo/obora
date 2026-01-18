#!/bin/bash
# 에이전트 레지스트리 동기화
# .claude/agents/ 폴더의 에이전트 파일들을 스캔하여 DB에 등록

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="$("${SCRIPT_DIR}/init-db.sh" 2>/dev/null | tail -1)"
CLAUDE_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
AGENTS_DIR="${CLAUDE_DIR}/agents"

echo "Syncing agent registry from: $AGENTS_DIR"

# 에이전트 파일 스캔
find "$AGENTS_DIR" -name "*.md" -type f 2>/dev/null | while read -r file; do
  # 상대 경로 추출
  REL_PATH="${file#$AGENTS_DIR/}"

  # 카테고리 추출 (첫 번째 디렉토리)
  CATEGORY=$(dirname "$REL_PATH")
  if [ "$CATEGORY" = "." ]; then
    CATEGORY="root"
  fi

  # 에이전트 이름 추출 (파일명에서 .md 제거)
  AGENT_NAME=$(basename "$file" .md)

  # frontmatter 파싱
  DESCRIPTION=""
  TOOLS=""
  MODEL="sonnet"

  if head -1 "$file" | grep -q "^---"; then
    # YAML frontmatter 추출
    FRONTMATTER=$(sed -n '/^---$/,/^---$/p' "$file" | sed '1d;$d')

    DESCRIPTION=$(echo "$FRONTMATTER" | grep "^description:" | sed 's/^description: *//' | head -1)
    TOOLS=$(echo "$FRONTMATTER" | grep "^tools:" | sed 's/^tools: *//')
    MODEL=$(echo "$FRONTMATTER" | grep "^model:" | sed 's/^model: *//' | head -1)

    # 기본값
    [ -z "$MODEL" ] && MODEL="sonnet"
  fi

  # DB에 등록/업데이트
  sqlite3 "$DB_PATH" <<EOF
INSERT INTO agent_registry (name, category, description, tools, model, file_path, last_updated)
VALUES (
  '$AGENT_NAME',
  '$CATEGORY',
  '$(echo "$DESCRIPTION" | sed "s/'/''/g")',
  '$(echo "$TOOLS" | sed "s/'/''/g")',
  '$MODEL',
  '$REL_PATH',
  datetime('now')
)
ON CONFLICT(name) DO UPDATE SET
  category = excluded.category,
  description = excluded.description,
  tools = excluded.tools,
  model = excluded.model,
  file_path = excluded.file_path,
  last_updated = datetime('now');
EOF

  echo "  Registered: $CATEGORY/$AGENT_NAME"
done

echo "Registry sync complete."

# 통계 출력
echo ""
echo "=== Agent Registry ==="
sqlite3 -header -column "$DB_PATH" "SELECT category, name, model, usage_count FROM agent_registry ORDER BY category, name;"
