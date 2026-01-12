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

각 에이전트의 name, description, tools 수집

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
    {
      \"agent\": \"에이전트명\",
      \"task\": \"구체적 작업 내용\",
      \"parallel_with\": []
    }
  ],
  \"feedback_loop\": {
    \"enabled\": false
  }
}

고려사항:
- 리뷰 범위에 따라 에이전트 선택
- 보안 리뷰 필요시 security-auditor 포함
- 탐색 필요시 explorer 포함
- 리뷰는 read-only이므로 feedback_loop 불필요
- 여러 리뷰어 병렬 실행 가능 (parallel_with 활용)
")
```

### 3. 워크플로우 실행 (병렬 지원)

```python
results = []
executed = set()

for step in workflow:
    if step.agent in executed:
        continue

    # 병렬 실행 가능한 리뷰어들
    parallel_agents = [step]
    if step.parallel_with:
        for p_name in step.parallel_with:
            p_step = find_step(workflow, p_name)
            if p_step:
                parallel_agents.append(p_step)

    # 병렬 실행 (리뷰어들은 독립적으로 실행 가능)
    if len(parallel_agents) > 1:
        for p_step in parallel_agents:
            result = Task(subagent_type=p_step.agent, prompt=f"""
{p_step.task}

리뷰 대상: $ARGUMENTS
""")
            results.append(result)
            executed.add(p_step.agent)
    else:
        result = Task(subagent_type=step.agent, prompt=f"""
{step.task}

리뷰 대상: $ARGUMENTS
이전 리뷰 결과: {format_results(results)}
""")
        results.append(result)
        executed.add(step.agent)
```

### 4. 결과 통합

```
## 코드 리뷰 결과

### 실행된 리뷰
- reviewer: 코드 품질 ✅
- security-auditor: 보안 검토 ✅ (병렬)

### 발견된 이슈

#### Critical (즉시 수정 필요)
- [C1] 파일:라인 - 설명

#### Warning (수정 권장)
- [W1] 파일:라인 - 설명

#### Suggestion (선택적)
- [S1] 파일:라인 - 설명

### 통과 항목
- ✅ 네이밍 컨벤션
- ✅ 에러 핸들링
```

## 에러 핸들링

```yaml
리뷰_실패_시:
  - 파일 접근 실패: 경로 확인 후 재시도
  - 에이전트 실패: 다른 접근 방식으로 리뷰 계속
  - 부분 실패 허용 (일부 리뷰 결과라도 제공)
```

## 중요 원칙

- planner가 리뷰 범위에 맞게 에이전트 선택
- **병렬 실행**으로 리뷰 속도 향상 (reviewer + security-auditor 동시)
- 코드 수정 없음 (read-only)
- 단순 리뷰: reviewer만
- 종합 리뷰: explorer + reviewer + security-auditor 등
