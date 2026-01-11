# Claude Code Configuration

**중요: 모든 요청은 워크플로우를 따라야 합니다.**

## 워크플로우

```
사용자 요청
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

## 로깅

모든 에이전트 실행은 SQLite에 기록됩니다.
스키마: `.claude/scripts/logging/schema.sql`

## 규칙

프로젝트 규칙: `.claude/rules/`

## 금지 사항

- 워크플로우 없이 직접 처리
- 에이전트 이름/목록 하드코딩
- 정적 에이전트 매핑
- 피드백 루프 없는 대규모 변경
