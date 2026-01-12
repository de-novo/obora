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

각 에이전트의 name, description, tools 수집

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
    {
      \"agent\": \"에이전트명\",
      \"task\": \"구체적 작업 내용\",
      \"critical\": true,
      \"parallel_with\": []
    }
  ],
  \"feedback_loop\": {
    \"enabled\": true,
    \"reviewer\": \"reviewer\",
    \"max_iterations\": 3
  },
  \"requires_test\": true
}

필수사항:
- 버그 수정 후 회귀 테스트 단계 포함 (test-runner 또는 test-writer)
- feedback_loop.enabled=true 설정
- debugger 에이전트로 원인 분석 권장
")
```

### 3. 워크플로우 검증

planner 출력 검증:

```
if (workflow에 테스트 관련 에이전트 없음):
    에러: "회귀 테스트 단계 누락. 버그 수정 후 테스트 필수"
    planner 재호출

if (feedback_loop.enabled !== true):
    경고: "피드백 루프 비활성화됨"
```

### 4. 워크플로우 실행 (병렬/순차)

```python
results = []
executed = set()

for step in workflow:
    if step.agent in executed:
        continue

    # 병렬 실행 처리
    parallel_agents = [step]
    if step.parallel_with:
        for p_name in step.parallel_with:
            p_step = find_step(workflow, p_name)
            if p_step:
                parallel_agents.append(p_step)

    if len(parallel_agents) > 1:
        # 병렬 실행
        for p_step in parallel_agents:
            result = Task(subagent_type=p_step.agent, prompt=f"""
{p_step.task}

이전 결과: {format_results(results)}
""")
            results.append(result)
            executed.add(p_step.agent)
    else:
        # 순차 실행
        result = Task(subagent_type=step.agent, prompt=f"""
{step.task}

이전 결과: {format_results(results)}
""")

        # 에러 핸들링
        if result.failed and step.critical:
            에러 보고 및 중단
            break

        results.append(result)
        executed.add(step.agent)
```

### 5. 피드백 루프 실행

```python
if feedback_loop.enabled:
    iteration = 0
    max_iterations = feedback_loop.max_iterations or 3

    while iteration < max_iterations:
        review_result = Task(subagent_type=feedback_loop.reviewer, prompt=f"""
버그 수정 결과 리뷰:

{format_all_results(results)}

확인 사항:
- 버그가 실제로 수정되었는가
- 새로운 버그가 도입되지 않았는가
- 테스트가 통과하는가

이슈 형식:
{{
  "issues": [
    {{
      "severity": "critical|warning|suggestion",
      "description": "이슈 설명",
      "responsible_agent": "수정할 에이전트"
    }}
  ]
}}
""")

        if not review_result.issues or len(review_result.issues) == 0:
            break

        # Critical 이슈 수정
        critical_issues = [i for i in review_result.issues if i.severity == "critical"]
        if not critical_issues:
            break

        for issue in critical_issues:
            fix_result = Task(subagent_type=issue.responsible_agent, prompt=f"""
수정 요청: {issue.description}
컨텍스트: {format_results(results)}
""")
            results.append(fix_result)

        iteration += 1

    if iteration >= max_iterations:
        경고: "최대 반복 도달. 수동 확인 필요."
```

### 6. 결과 요약

```
## 버그 수정 결과

### 실행된 에이전트
- debugger: 원인 분석 ✅
- implementer: 버그 수정 ✅
- test-runner: 회귀 테스트 ✅
- reviewer: 검증 ✅

### 피드백 루프
- 반복: 1/3
- 이슈: 0

### 최종 상태
- 버그 수정: ✅
- 회귀 테스트: ✅
```

## 에러 핸들링 정책

```yaml
버그_수정_실패_시:
  1. 디버깅 정보 수집 (debugger 재호출)
  2. 다른 접근 방식 시도 (planner 재호출)
  3. 3회 실패 시 사용자에게 보고

롤백_정책:
  - 수정 전 원본 코드 기록
  - 실패 시 git checkout으로 복구
```

## 중요 원칙

- planner가 버그 복잡도 분석 후 워크플로우 결정
- **회귀 테스트 필수**
- **피드백 루프로 수정 검증**
- Critical 에러 시 즉시 중단
