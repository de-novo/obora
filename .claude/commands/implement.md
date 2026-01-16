---
description: 새 기능 구현 (동적 워크플로우)
allowed-tools: Task, Read, Bash, Glob, Grep, AskUserQuestion
---

# Implement Feature - Dynamic Workflow

## 옵션

```yaml
--interview <id>:   특정 인터뷰 결과 사용 (workflow ID)
--no-interview:     인터뷰 조회 건너뛰기
(기본):             토픽 매칭 + 사용자 확인
```

## Phase 0: 요청 분석 및 기존 인터뷰 조회

### Step 1: 옵션 파싱

```yaml
$ARGUMENTS 분석:
  "--no-interview" 포함:
    - 인터뷰 조회 건너뛰기
    - Step 3으로 직행

  "--interview <id>" 포함:
    - 해당 ID로 워크플로우 직접 조회
    - 요구사항 명세서 추출
    - Step 3으로 직행

  옵션_없음:
    - Step 2 진행 (토픽 매칭)
```

### Step 2: 토픽 매칭 + 사용자 확인

**1. 토픽 추출 및 DB 조회:**

```bash
# 토픽을 추출하여 매칭 조회
# 예: "/implement 대시보드 기능" → 토픽 = "대시보드"
./.claude/scripts/queries/get-recent-interview.sh "$(pwd)" "<추출된_토픽>"
```

**2. 인터뷰 발견 시 사용자 확인 (AskUserQuestion):**

```yaml
인터뷰_발견:
  질문: "관련 인터뷰 결과를 발견했습니다. 사용할까요?"
  옵션:
    - "사용": 해당 요구사항으로 진행
    - "무시": 인터뷰 없이 진행
    - "목록 보기": 다른 인터뷰 선택

  예시_메시지: |
    24시간 내 관련 인터뷰 발견:
    - 주제: "대시보드 기능"
    - 생성: 2시간 전

    이 요구사항을 사용할까요?

인터뷰_없음:
  - Step 3 진행
```

**3. 목록 선택 시:**

```bash
# 후보 목록 조회
./.claude/scripts/queries/get-recent-interview.sh "$(pwd)" "" "list"
```

사용자가 선택한 인터뷰 ID로 요구사항 조회

### Step 3: 요청 명확성 판단

```yaml
요구사항_있음 (Step 2에서 확보):
  → Phase 2로 직행 (requirements 변수에 저장)

요구사항_없음:
  명확한_요청:
    - 구체적인 파일/위치 명시
    - 명확한 입력/출력 정의
    - 예: "src/auth/login.ts에서 비밀번호 검증 수정"
    → Feature 유형 (Phase 2로 직행)

  모호한_요청:
    - 추상적인 기능 설명
    - What만 있고 How가 없음
    - 예: "로그인 기능 개선해줘"
    → FullFeature 유형 (Phase 1 필수)
```

---

## Phase 1: 요구사항 발견 (조건부)

**조건:**
- 기존 인터뷰 결과 없음 AND
- 모호한 요청으로 판단됨

```
Task(subagent_type="interviewer", prompt="
요구사항 인터뷰 진행:

사용자 요청: $ARGUMENTS

다음 단계로 진행:
1. 코드베이스 맥락 파악
2. 핵심 요구사항 도출 (AskUserQuestion 사용)
3. 세부사항 탐색
4. 엣지 케이스 발견
5. 우선순위 결정
6. 요구사항 명세서 작성

출력: 구조화된 요구사항 명세서 (# 요구사항 명세서: 로 시작)
")
```

**인터뷰 결과는 자동으로 DB에 저장됩니다.**

---

## Phase 2: 워크플로우 설계

### 1. 에이전트 디스커버리

```bash
Glob: .claude/agents/**/*.md
```

모든 에이전트 파일을 병렬로 Read하여 메타데이터 수집

### 2. 요구사항 컨텍스트 결정

```yaml
requirements_source:
  1. DB에서 조회한 최근 인터뷰 결과 (Phase 0에서 발견)
  2. Phase 1에서 방금 진행한 인터뷰 결과
  3. 없음 (명확한 요청이라 불필요)

planner_input:
  - requirements가 있으면: 요구사항 명세서 전체 전달
  - requirements가 없으면: 사용자 원래 요청만 전달
```

### 3. planner 호출

```
Task(subagent_type="planner", prompt="
작업 요청: $ARGUMENTS

## 요구사항 명세서 (있는 경우)
${requirements || "없음 - 사용자 요청을 직접 분석하세요"}

사용 가능한 에이전트:
[디스커버리 결과 전달]

워크플로우 설계:
{
  \"analysis\": \"작업 분석 내용\",
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
    \"max_iterations\": 3
  }
}

필수:
- 요구사항 명세서가 있으면 그 내용을 정확히 반영
- 코드 구현 작업 시 테스트 단계 포함
- feedback_loop.enabled=true 설정
")
```

### 3. 워크플로우 검증

```yaml
검증:
  - 테스트 단계 포함 여부
  - feedback_loop.enabled = true
  - critical 필드 설정

실패_시: planner 재호출
```

---

## Phase 3: 워크플로우 실행

```python
results = []
executed = set()

for step in workflow:
    if step.agent in executed:
        continue

    # 병렬 실행 가능한 에이전트 수집
    parallel_agents = [step]
    if step.parallel_with:
        for name in step.parallel_with:
            parallel_step = find_step(workflow, name)
            if parallel_step:
                parallel_agents.append(parallel_step)

    # 실행
    if len(parallel_agents) > 1:
        # 병렬 실행
        for p_step in parallel_agents:
            result = Task(subagent_type=p_step.agent, ...)
            results.append(result)
            executed.add(p_step.agent)
    else:
        # 순차 실행
        result = Task(subagent_type=step.agent, prompt=f"""
{step.task}

이전 단계 결과:
{format_results(results)}
""")

        if result.failed and step.critical:
            break

        results.append(result)
        executed.add(step.agent)
```

---

## Phase 4: 피드백 루프

```python
if feedback_loop.enabled:
    max_iterations = feedback_loop.max_iterations or 3
    iteration = 0

    while iteration < max_iterations:
        review_result = Task(subagent_type="reviewer", prompt=f"""
전체 워크플로우 결과 리뷰:
{format_all_results(results)}

이슈 발견 시:
{{
  "issues": [...]
}}
""")

        if not review_result.issues:
            break

        critical_issues = [i for i in review_result.issues
                          if i.severity == "critical"]

        if not critical_issues:
            break

        for issue in critical_issues:
            fix_result = Task(
                subagent_type=issue.responsible_agent,
                prompt=f"수정 요청: {issue.description}"
            )
            results.append(fix_result)

        iteration += 1
```

---

## Phase 5: 결과 요약

```markdown
## 워크플로우 실행 결과

### 워크플로우 유형
[Feature | FullFeature]

### 실행된 단계
1. ✅ [에이전트]: [작업 요약]
2. ✅ [에이전트]: [작업 요약]
...

### 피드백 루프
- 반복 횟수: N/3
- 발견된 이슈: N개 (수정됨)

### 최종 상태
- 구현: ✅
- 테스트: ✅
- 리뷰: ✅
```

---

## 워크플로우 유형별 흐름

| 유형 | 조건 | 흐름 |
|------|------|------|
| **Feature** | 명확한 요청 | planner → impl → test → review |
| **FullFeature** | 모호한 요청 | **interviewer** → planner → impl → test → review |

---

## 원칙

- 모호한 요청 시 반드시 Phase 1 (인터뷰) 실행
- 하드코딩된 워크플로우 없음
- planner가 매번 동적으로 결정
- 테스트 및 피드백 루프 필수
