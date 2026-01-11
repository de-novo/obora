---
description: 버그 수정 워크플로우 시작
allowed-tools: Task, Read, Bash, Glob, Grep
---

# Fix Bug Workflow

**버그 수정 워크플로우를 시작합니다.**

## 실행 절차

1. **에이전트 디스커버리**
   ```
   Glob ".claude/agents/**/*.md"
   ```

2. **Orchestrator 호출**
   ```
   Task(subagent_type="orchestrator", prompt="
   작업: 버그 수정

   버그 설명: $ARGUMENTS

   워크플로우:
   1. 디버깅 에이전트로 원인 분석
   2. 코드 수정
   3. reviewer로 리뷰
   4. commit-helper로 커밋
   ")
   ```

## 워크플로우

```
orchestrator
    ↓
에이전트 디스커버리
    ↓
debugger (원인 분석 + 수정)
    ↓
reviewer (코드 리뷰)
    ↓
commit-helper (커밋)
    ↓
완료
```

## 중요

- planner 생략 가능 (단순 버그)
- 복잡한 버그는 planner 포함
- 반드시 에이전트를 통해 수정
