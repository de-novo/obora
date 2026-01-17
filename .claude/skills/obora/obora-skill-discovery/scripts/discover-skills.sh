#!/bin/bash
# discover-skills.sh
# 스킬 목록과 메타데이터(name, description)를 추출합니다.
#
# Usage: ./discover-skills.sh [project_root]
# Output: YAML 형식의 스킬 목록

set -e

PROJECT_ROOT="${1:-.}"
SKILLS_DIR="$PROJECT_ROOT/.claude/skills"

if [ ! -d "$SKILLS_DIR" ]; then
  echo "Error: $SKILLS_DIR not found" >&2
  exit 1
fi

echo "skills:"

# Find all SKILL.md files
find "$SKILLS_DIR" -name "SKILL.md" -type f | sort | while read -r file; do
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
    # Get relative path from skills dir (folder name)
    skill_folder=$(dirname "$file")
    rel_path="${skill_folder#$SKILLS_DIR/}"

    echo "  - name: \"$name\""
    echo "    description: \"$description\""
    echo "    path: \"$rel_path\""
  fi
done
