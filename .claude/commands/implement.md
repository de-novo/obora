---
description: 새 기능 구현 워크플로우 시작
allowed-tools: Task, Read, Bash, Glob, Grep
---

# Implement Feature Workflow

**새 기능 구현 워크플로우를 시작합니다.**

## 실행 절차

1. **에이전트 디스커버리**
   ```
   Glob ".claude/agents/**/*.md"
   ```

2. **Orchestrator 호출**
   ```
   Task(subagent_type="orchestrator", prompt="
   작업: 새 기능 구현

   요청: $ARGUMENTS

   워크플로우:
   1. planner로 구현 계획 수립
   2. 적합한 개발 에이전트 선택 (동적 탐색)
   3. 코드 구현
   4. reviewer로 코드 리뷰
   5. commit-helper로 커밋
   ")
   ```

## 워크플로우

```
orchestrator
    ↓
에이전트 디스커버리
    ↓
planner (구현 계획)
    ↓
개발 에이전트 (코드 작성)
    ↓
reviewer (코드 리뷰)
    ↓
commit-helper (커밋)
    ↓
완료
```

## 중요

- 반드시 워크플로우를 따를 것
- 직접 코드 수정 금지
- 에이전트를 통해서만 수정
