---
description: 버그 수정 (동적 워크플로우)
allowed-tools: Task, Read, Bash, Glob, Grep
---

# Fix Bug - Dynamic Workflow

**planner가 동적으로 워크플로우를 설계합니다.**

## 실행 절차

### 1. 에이전트 디스커버리

```
Glob ".claude/agents/**/*.md"
```

각 에이전트의 name, description 수집

### 2. planner 호출 (동적 워크플로우 설계)

```
Task(subagent_type="planner", prompt="
작업: 버그 수정

버그 설명: $ARGUMENTS

사용 가능한 에이전트:
[디스커버리 결과 전달]

분석 후 워크플로우를 JSON으로 반환:
{
  \"analysis\": \"버그 분석 및 접근 방법\",
  \"workflow\": [
    {\"agent\": \"에이전트명\", \"task\": \"구체적 작업 내용\"},
    ...
  ]
}

주의:
- 버그 복잡도에 따라 에이전트 선택
- 단순 버그: 최소 에이전트
- 복잡한 버그: 탐색 + 수정 + 리뷰
")
```

### 3. 워크플로우 실행

planner가 반환한 workflow를 순차적으로 실행:

```
for each step in workflow:
    result = Task(subagent_type=step.agent, prompt=step.task)
    다음 단계에 result 전달
```

### 4. 피드백 루프 (필요시)

reviewer 이슈 발견 시 해당 에이전트 재호출

## 중요

- 하드코딩된 워크플로우 없음
- planner가 버그 복잡도 분석 후 결정
- 단순 버그는 적은 에이전트, 복잡한 버그는 더 많은 에이전트
