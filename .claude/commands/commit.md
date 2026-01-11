---
description: Git 커밋 워크플로우 시작
allowed-tools: Task, Read, Bash, Glob, Grep
---

# Git Commit Workflow

**커밋 워크플로우를 시작합니다.**

## 실행 절차

1. **에이전트 디스커버리**
   ```
   Glob ".claude/agents/**/*.md"
   ```

2. **Orchestrator 호출**
   ```
   Task(subagent_type="orchestrator", prompt="
   작업: Git 커밋

   절차:
   1. 변경사항 분석 (git status, git diff)
   2. Conventional Commits 형식 메시지 생성
   3. 커밋 실행

   $ARGUMENTS
   ")
   ```

## 워크플로우

```
orchestrator
    ↓
에이전트 디스커버리
    ↓
planner (워크플로우 설계)
    ↓
commit-helper (커밋 실행)
    ↓
완료
```

## 중요

- 반드시 에이전트를 통해 커밋
- 직접 git commit 금지
- Conventional Commits 형식 준수
