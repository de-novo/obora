---
description: 새 기능 구현 (동적 워크플로우)
allowed-tools: Task, Read, Bash, Glob, Grep
---

# Implement Feature - Dynamic Workflow

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
작업: 새 기능 구현

요청: $ARGUMENTS

사용 가능한 에이전트:
[디스커버리 결과 전달]

분석 후 워크플로우를 JSON으로 반환:
{
  \"analysis\": \"작업 분석 내용\",
  \"workflow\": [
    {
      \"agent\": \"에이전트명\",
      \"task\": \"구체적 작업 내용\",
      \"critical\": true,
      \"parallel_with\": [\"다른에이전트\"]
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
- 코드 구현 작업 시 테스트 단계 반드시 포함 (test-writer 또는 test-runner)
- feedback_loop.enabled=true 설정
- critical 필드로 실패 시 중단 여부 표시
- parallel_with로 병렬 실행 가능한 에이전트 표시
")
```

### 3. 워크플로우 검증

planner 출력 검증:

```
if (workflow에 테스트 관련 에이전트 없음 && 코드 변경 작업):
    에러: "테스트 단계 누락. 워크플로우 재설계 필요"
    planner 재호출

if (feedback_loop.enabled !== true && 코드 변경 작업):
    경고: "피드백 루프 비활성화됨. 품질 검증 없이 진행"
```

### 4. 워크플로우 실행 (병렬/순차)

```python
results = []
executed = set()

for step in workflow:
    # 이미 병렬 실행된 경우 스킵
    if step.agent in executed:
        continue

    # 병렬 실행 가능한 에이전트 수집
    parallel_agents = [step]
    if step.parallel_with:
        for parallel_name in step.parallel_with:
            parallel_step = find_step(workflow, parallel_name)
            if parallel_step:
                parallel_agents.append(parallel_step)

    # 병렬 실행 (동시에 Task 호출)
    if len(parallel_agents) > 1:
        parallel_results = []
        for p_step in parallel_agents:
            result = Task(subagent_type=p_step.agent, prompt=f"""
{p_step.task}

이전 단계 결과:
{format_results(results)}
""")
            parallel_results.append(result)
            executed.add(p_step.agent)
        results.extend(parallel_results)

    # 순차 실행
    else:
        result = Task(subagent_type=step.agent, prompt=f"""
{step.task}

이전 단계 결과:
{format_results(results)}
""")

        # 에러 핸들링
        if result.failed:
            if step.critical:
                # Critical 실패 시 워크플로우 중단
                에러 보고 및 중단
                break
            else:
                # Non-critical 실패 시 경고 후 계속
                경고: "{step.agent} 실패, 계속 진행"

        results.append(result)
        executed.add(step.agent)
```

### 5. 피드백 루프 실행

```python
if feedback_loop.enabled:
    iteration = 0
    max_iterations = feedback_loop.max_iterations or 3

    while iteration < max_iterations:
        # 리뷰 실행
        review_result = Task(subagent_type=feedback_loop.reviewer, prompt=f"""
전체 워크플로우 결과 리뷰:

{format_all_results(results)}

이슈 발견 시 다음 형식으로 반환:
{{
  "issues": [
    {{
      "severity": "critical|warning|suggestion",
      "file": "파일경로",
      "description": "이슈 설명",
      "responsible_agent": "수정할 에이전트"
    }}
  ]
}}

이슈 없으면: {{"issues": []}}
""")

        # 이슈 없으면 루프 종료
        if not review_result.issues or len(review_result.issues) == 0:
            break

        # Critical 이슈만 수정 (iteration 절약)
        critical_issues = [i for i in review_result.issues if i.severity == "critical"]

        if not critical_issues:
            # Critical 없으면 warning만 보고하고 종료
            경고: "Warning/Suggestion 이슈 발견, 수동 확인 권장"
            break

        # 이슈 수정
        for issue in critical_issues:
            fix_result = Task(subagent_type=issue.responsible_agent, prompt=f"""
수정 요청:
- 파일: {issue.file}
- 이슈: {issue.description}
- 심각도: {issue.severity}

이전 작업 컨텍스트:
{format_results(results)}
""")
            results.append(fix_result)

        iteration += 1

    if iteration >= max_iterations:
        경고: "최대 반복 횟수({max_iterations}) 도달. 수동 확인 필요."
```

### 6. 결과 요약

```
## 워크플로우 실행 결과

### 실행된 에이전트
- explorer: 구조 파악 ✅
- implementer: 코드 작성 ✅
- test-writer: 테스트 작성 ✅
- reviewer: 코드 리뷰 ✅

### 피드백 루프
- 반복 횟수: 1/3
- 발견된 이슈: 2 (수정됨)

### 최종 상태
- 구현 완료: ✅
- 테스트 통과: ✅
- 리뷰 통과: ✅
```

## 에러 핸들링 정책

```yaml
에러_분류:
  TRANSIENT: # 일시적 에러 (네트워크, 타임아웃)
    action: 재시도 (최대 2회)

  VALIDATION: # 검증 실패 (타입 에러, 린트 에러)
    action: 해당 에이전트 재호출로 수정

  CRITICAL: # 심각한 에러 (파일 없음, 권한 없음)
    action: 워크플로우 중단, 사용자 보고

  UNKNOWN: # 알 수 없는 에러
    action: 로그 기록 후 계속 진행 시도

롤백_정책:
  - Git 변경사항은 커밋 전까지 스테이징 안 함
  - 실패 시 git checkout으로 복구 가능
  - 중요 파일 백업 후 수정 (선택적)
```

## 중요 원칙

- 하드코딩된 워크플로우 없음
- planner가 매번 동적으로 결정
- **테스트 단계 필수** (코드 변경 시)
- **피드백 루프 필수** (코드 변경 시)
- 병렬 실행으로 효율성 향상
- Critical 에러 시 즉시 중단
