---
description: 코드 리뷰 요청
allowed-tools: Task, Read, Glob, Grep
---

# Code Review Workflow

**코드 리뷰를 요청합니다.**

## 실행 절차

1. **에이전트 디스커버리**
   ```
   Glob ".claude/agents/**/*.md"
   ```

2. **Orchestrator 호출**
   ```
   Task(subagent_type="orchestrator", prompt="
   작업: 코드 리뷰

   대상: $ARGUMENTS

   워크플로우:
   1. reviewer로 코드 품질 검토
   2. 보안, 성능, 가독성 분석
   3. 개선 제안 제공
   ")
   ```

## 워크플로우

```
orchestrator
    ↓
에이전트 디스커버리
    ↓
reviewer (코드 리뷰)
    ↓
결과 보고
```

## 리뷰 항목

- 코드 품질 (가독성, 유지보수성)
- 보안 취약점
- 성능 이슈
- 베스트 프랙티스 준수

## 중요

- 리뷰만 수행, 코드 수정 없음
- 수정 필요 시 /fix 또는 /implement 사용
