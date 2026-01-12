# Claude Code Configuration

**중요: 모든 워크플로우는 동적으로 결정됩니다.**

## 핵심 원칙

```yaml
제한사항:
  - 서브에이전트는 다른 서브에이전트를 호출할 수 없음
  - Task tool은 Main Claude만 사용 가능

해결책:
  - Main Claude가 직접 각 에이전트를 호출
  - planner가 동적으로 워크플로우 설계
  - 하드코딩된 워크플로우 없음
```

## 절대 금지 사항

```yaml
직접_수행_금지:
  - Write/Edit 도구로 코드 파일(.ts, .tsx, .js, .jsx) 직접 수정
  - Git commit 직접 수행
  - 워크플로우 없이 대규모 변경

반드시_에이전트_통해_수행:
  - 모든 코드 변경 → 적절한 에이전트 (동적 선택)
  - 모든 Git 커밋 → commit-helper
  - 모든 리뷰 → reviewer
```

## 동적 워크플로우 실행

### 1. 에이전트 디스커버리

```bash
Glob: .claude/agents/**/*.md
```

모든 에이전트의 name, description, tools 파악

### 2. planner 호출 (워크플로우 설계)

```
Task(subagent_type="planner", prompt="
작업: [사용자 요청]

사용 가능한 에이전트:
[디스커버리 결과 - name: description]

출력 형식:
{
  \"analysis\": \"작업 분석 내용\",
  \"workflow\": [
    {\"agent\": \"에이전트명\", \"task\": \"구체적 작업\"},
    ...
  ],
  \"feedback_loop\": {
    \"enabled\": true,
    \"reviewer\": \"reviewer\",
    \"max_iterations\": 3
  }
}

필수 필드: analysis, workflow
선택 필드: feedback_loop (코드 수정 작업 시만)
")
```

### 3. 워크플로우 실행

planner가 반환한 workflow 배열을 순차적으로 실행:

```
for each step in workflow:
    Task(subagent_type=step.agent, prompt=step.task)
    결과를 다음 단계에 전달
```

### 4. 피드백 루프 (Main Claude 실행)

```yaml
피드백_루프_실행:
  조건: planner가 feedback_loop.enabled=true로 설정 시
  절차:
    1. 워크플로우 실행 완료 후 reviewer 자동 호출
    2. reviewer 이슈 발견 시:
       - 해당 에이전트 재호출 (이슈 수정)
       - 다시 reviewer 호출 (재검증)
    3. max_iterations(기본값: 3)까지 반복
    4. 이슈 없음 또는 max_iterations 도달 시 종료

  실행_주체: Main Claude
  설정_주체: planner (feedback_loop 필드)
```

## Commands

| Command | 용도 |
|---------|------|
| `/implement <설명>` | 새 기능 구현 (동적 워크플로우) |
| `/fix <버그>` | 버그 수정 (동적 워크플로우) |
| `/commit` | 커밋 (commit-helper 직접) |
| `/review <대상>` | 코드 리뷰 (reviewer 직접) |

## 에이전트 디스커버리 정보

각 에이전트 파일의 YAML frontmatter:
- `name`: 식별자 (subagent_type으로 사용)
- `description`: 언제 사용하는지 (planner가 이걸 보고 선택)
- `tools`: 사용 가능한 도구
- `model`: 사용 모델

## 강제 메커니즘

```yaml
Hook: ".claude/settings.json" (PreToolUse → Write|Edit)
Script: ".claude/scripts/enforce-workflow.sh"
Rules: ".claude/rules/workflow/agent-workflow.md"
```
