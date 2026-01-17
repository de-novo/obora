---
name: obora-commit
description: Git 커밋 (동적 워크플로우)
allowed-tools: Task, Read, Bash, Glob, Grep
---
name: obora-commit

# Git Commit - Dynamic Workflow

**planner가 동적으로 워크플로우를 설계합니다.**

## 실행 절차

### 1. 에이전트 디스커버리

```
Glob ".claude/agents/**/*.md"
```

각 에이전트의 name, description, tools 수집

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
    {
      \"agent\": \"에이전트명\",
      \"task\": \"구체적 작업 내용\",
      \"critical\": true
    }
  ],
  \"feedback_loop\": {
    \"enabled\": false
  }
}

커밋 작업 특성:
- 일반적으로 commit-helper만 필요
- 민감 정보 검사 필요시 secret-scanner 추가
- 커밋은 되돌리기 어려우므로 critical=true 권장
")
```

### 3. 워크플로우 실행

```python
results = []

for step in workflow:
    result = Task(subagent_type=step.agent, prompt=f"""
{step.task}

이전 결과: {format_results(results)}
""")

    # 에러 핸들링
    if result.failed:
        if step.critical:
            # 커밋 실패는 즉시 중단 (데이터 무결성)
            에러: "커밋 실패. 변경사항 확인 필요."
            break
        else:
            경고: "{step.agent} 실패, 계속 진행"

    results.append(result)
```

### 4. 결과 확인

```
## 커밋 결과

### 실행된 에이전트
- secret-scanner: 민감정보 검사 ✅ (선택적)
- commit-helper: 커밋 생성 ✅

### 커밋 정보
- 해시: abc1234
- 메시지: feat(auth): add OAuth2 support
- 파일: 3개 변경

### 다음 단계
- PR 생성: /pr 또는 pr-helper 사용
```

## 에러 핸들링

```yaml
커밋_실패_시:
  pre-commit_hook_실패:
    - 훅 에러 메시지 분석
    - 자동 수정 가능하면 수정 후 재시도
    - 불가능하면 사용자에게 보고

  충돌_발생:
    - 충돌 파일 목록 제공
    - 자동 해결 시도 안 함 (사용자 판단 필요)

  권한_에러:
    - Git 설정 확인 안내
    - 워크플로우 중단
```

## 중요 원칙

- planner가 상황에 맞게 워크플로우 결정
- **민감 정보 검사** 권장 (secret-scanner)
- 커밋 실패 시 즉시 중단 (critical)
- force push 금지
- main/master 직접 커밋 주의
