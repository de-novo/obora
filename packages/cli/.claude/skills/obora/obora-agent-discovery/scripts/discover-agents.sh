#!/bin/bash
# discover-agents.sh
# 에이전트 목록과 메타데이터(name, description)를 추출합니다.
#
# Usage: ./discover-agents.sh [project_root]
# Output: YAML 형식의 에이전트 목록

set -e

PROJECT_ROOT="${1:-.}"
AGENTS_DIR="$PROJECT_ROOT/.claude/agents"

if [ ! -d "$AGENTS_DIR" ]; then
  echo "Error: $AGENTS_DIR not found" >&2
  exit 1
fi

echo "agents:"

# Find all .md files except _shared-principles.md
find "$AGENTS_DIR" -name "*.md" -type f ! -name "_shared-principles.md" | sort | while read -r file; do
  # Extract name and description from frontmatter
  name=""
  description=""
  in_frontmatter=false

  while IFS= read -r line; do
    # Detect frontmatter boundaries
    if [[ "$line" == "---" ]]; then
      if [ "$in_frontmatter" = false ]; then
        in_frontmatter=true
        continue
      else
        break  # End of frontmatter
      fi
    fi

    if [ "$in_frontmatter" = true ]; then
      # Extract name
      if [[ "$line" =~ ^name:\ *(.+)$ ]]; then
        name="${BASH_REMATCH[1]}"
      fi
      # Extract description
      if [[ "$line" =~ ^description:\ *(.+)$ ]]; then
        description="${BASH_REMATCH[1]}"
      fi
    fi
  done < "$file"

  # Output if name exists
  if [ -n "$name" ]; then
    # Get relative path from agents dir
    rel_path="${file#$AGENTS_DIR/}"

    echo "  - name: \"$name\""
    echo "    description: \"$description\""
    echo "    path: \"$rel_path\""
  fi
done
