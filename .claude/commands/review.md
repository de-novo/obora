---
description: 코드 리뷰 (동적 워크플로우)
allowed-tools: Task, Read, Glob, Grep
---

# Code Review - Dynamic Workflow

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
작업: 코드 리뷰

대상: $ARGUMENTS

사용 가능한 에이전트:
[디스커버리 결과 전달]

분석 후 워크플로우를 JSON으로 반환:
{
  \"analysis\": \"리뷰 범위 및 접근 방법\",
  \"workflow\": [
    {\"agent\": \"에이전트명\", \"task\": \"구체적 작업 내용\"},
    ...
  ]
}

고려사항:
- 리뷰 범위에 따라 에이전트 선택
- 보안 리뷰 필요시 security-auditor 포함
- 탐색 필요시 explorer 포함
")
```

### 3. 워크플로우 실행

planner가 반환한 workflow를 순차적으로 실행

## 중요

- planner가 리뷰 범위에 맞게 에이전트 선택
- 단순 리뷰: reviewer만
- 종합 리뷰: explorer + reviewer + security-auditor 등
