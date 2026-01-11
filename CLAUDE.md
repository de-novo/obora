# Claude Code Configuration

**중요: 모든 요청은 워크플로우를 따라야 합니다.**

## 절대 금지 사항

```yaml
직접_수행_금지:
  - Write/Edit 도구로 코드 파일(.ts, .tsx, .js, .jsx) 직접 수정
  - Git commit 직접 수행
  - 워크플로우 없이 대규모 변경

반드시_Agent_통해_수행:
  - 모든 코드 변경 → 개발 에이전트
  - 모든 Git 커밋 → 커밋 담당 에이전트
  - 모든 리뷰 → 리뷰 담당 에이전트
```

## Commands (워크플로우 트리거)

| Command | 용도 | 워크플로우 |
|---------|------|-----------|
| `/implement <설명>` | 새 기능 구현 | planner → 개발자 → reviewer → committer |
| `/fix <버그>` | 버그 수정 | debugger → reviewer → committer |
| `/commit` | 커밋 | commit-helper |
| `/review <대상>` | 코드 리뷰 | reviewer |

## 워크플로우

```
사용자 요청 또는 /command
    ↓
에이전트 디스커버리 (Glob: .claude/agents/**/*.md)
    ↓
orchestrator 호출
    ↓
planner에게 워크플로우 설계 위임
    ↓
적합한 에이전트 선택 (description 기반)
    ↓
병렬/순차 실행
    ↓
피드백 루프 (필요시)
    ↓
결과 반환
```

## 실행 방법

모든 요청에 대해:

```
Task tool 사용:
- subagent_type: .claude/agents/core/orchestrator.md 참조
- prompt: 사용자 요청 전달
```

## 에이전트 디스커버리

에이전트는 **동적으로 탐색**합니다. 하드코딩 금지.

```bash
Glob: .claude/agents/**/*.md
```

각 에이전트 파일의 YAML frontmatter에서:
- `name`: 식별자
- `description`: 언제 사용하는지
- `tools`: 사용 가능한 도구
- `model`: 사용 모델

## 강제 메커니즘

이 프로젝트는 다음 메커니즘으로 워크플로우를 강제합니다:

1. **Hook (PreToolUse)**: Write/Edit 시 `.claude/scripts/enforce-workflow.sh` 실행
2. **Agent Tool Restrictions**: 각 에이전트의 `disallowedTools` 필드
3. **Rules**: `.claude/rules/workflow/agent-workflow.md`

## 규칙

```yaml
강제_규칙: ".claude/rules/workflow/agent-workflow.md"
공용_원칙: ".claude/agents/_shared-principles.md"
프로젝트_규칙: ".claude/rules/"
```

## 로깅

모든 에이전트 실행은 SQLite에 기록됩니다.
스키마: `.claude/scripts/logging/schema.sql`
