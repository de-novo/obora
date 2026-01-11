---
description: Git 커밋 (동적 워크플로우)
allowed-tools: Task, Read, Bash, Glob, Grep
---

# Git Commit - Dynamic Workflow

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
작업: Git 커밋

추가 요청: $ARGUMENTS

사용 가능한 에이전트:
[디스커버리 결과 전달]

분석 후 워크플로우를 JSON으로 반환:
{
  \"analysis\": \"커밋 작업 분석\",
  \"workflow\": [
    {\"agent\": \"에이전트명\", \"task\": \"구체적 작업 내용\"},
    ...
  ]
}

일반적으로 commit-helper만 필요하지만,
상황에 따라 다른 에이전트 추가 가능
")
```

### 3. 워크플로우 실행

planner가 반환한 workflow를 순차적으로 실행

## 중요

- planner가 상황에 맞게 워크플로우 결정
- 단순 커밋: commit-helper만
- 복잡한 상황: 추가 에이전트 가능
