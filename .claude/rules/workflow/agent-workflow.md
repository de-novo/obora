---
description: 동적 워크플로우 실행 규칙. 에이전트 호출, 워크플로우 설계, 피드백 루프에 적용.
globs:
  - "**/*"
---

# Agent Workflow 강제 규칙

## 핵심 원칙

```yaml
동적_워크플로우:
  - 모든 워크플로우는 실행 시점에 동적으로 결정
  - 하드코딩된 에이전트 순서 금지
  - 워크플로우 설계 담당 에이전트가 매번 최적 워크플로우 설계
  - 상황에 따라 유연하게 조정
```

## Claude Code 제한사항

```yaml
제한:
  - 서브에이전트는 다른 서브에이전트를 호출할 수 없음
  - Task tool은 Main Claude만 사용 가능

해결:
  - Main Claude가 직접 각 에이전트 호출
  - 워크플로우 설계 담당 에이전트가 설계 후 Main Claude가 실행
```

---

## 필수 실행 순서

### 1. 에이전트 디스커버리 (병렬 실행 필수)

작업 시작 시 사용 가능한 모든 에이전트를 동적으로 탐색합니다.

**중요: Main Claude가 직접 병렬로 수행 (planner에게 위임하지 않음)**

```bash
# Step 1: 에이전트 파일 목록 조회
Glob: .claude/agents/**/*.md

# Step 2: 모든 에이전트 파일 병렬 읽기 (단일 메시지에 여러 Read 도구 호출)
Read: .claude/agents/core/planner.md     # 병렬
Read: .claude/agents/core/explorer.md    # 병렬
Read: .claude/agents/code/implementer.md # 병렬
... (모든 에이전트 파일 동시 읽기)
```

각 에이전트의 YAML frontmatter에서 추출:
- `name`: 에이전트 식별자 (subagent_type으로 사용)
- `description`: 역할 및 사용 시점
- `tools`: 사용 가능한 도구
- `model`: 실행 모델

**출력 형식 (planner에게 전달):**

```markdown
## 사용 가능한 에이전트

| Name | Description | Tools | Model |
|------|-------------|-------|-------|
| planner | 워크플로우 설계 | Read, Glob, Grep | opus |
| implementer | 새 기능 구현 | Read, Write, Edit, Bash, Grep, Glob | sonnet |
| reviewer | 코드 품질 검토 | Read, Glob, Grep | sonnet |
| ... | ... | ... | ... |
```

### 2. 워크플로우 설계

수집된 에이전트 정보를 바탕으로 워크플로우 설계 담당 에이전트에게 설계를 위임합니다.

```
Task(subagent_type=워크플로우_설계_담당_에이전트, prompt="
작업 요청: [사용자 요청]

사용 가능한 에이전트:
- name1: description1
- name2: description2
...

다음 형식으로 워크플로우 설계:
{
  \"analysis\": \"작업 분석 및 전략\",
  \"workflow\": [
    {
      \"agent\": \"에이전트명\",
      \"task\": \"구체적 작업 설명\",
      \"reason\": \"선택 이유\"
    }
  ],
  \"validation\": \"검증 전략\",
  \"feedback_loop\": {
    \"enabled\": true,
    \"max_iterations\": 3
  }
}

필수 필드: analysis, workflow
선택 필드: feedback_loop (코드 수정 작업 시), validation
")
```

**워크플로우 설계 시 고려사항:**
- 작업의 복잡도와 범위
- 각 에이전트의 역할과 도구
- 병렬 처리 가능 여부
- 피드백 루프 필요성
- **테스트 및 검증 전략 (필수)**

### 3. 워크플로우 순차 실행

설계된 워크플로우를 순차적으로 실행합니다.

```
results = []

for step in workflow:
    # 이전 단계 결과를 컨텍스트로 전달
    context = {
        "previous_results": results,
        "current_step": step,
        "remaining_steps": len(workflow) - current_index
    }

    # 에이전트 실행
    result = Task(
        subagent_type=step.agent,
        prompt=f"{step.task}\n\nContext: {context}"
    )

    results.append(result)

    # 실패 시 워크플로우 중단 여부 판단
    if result.failed and step.critical:
        break
```

### 4. 피드백 루프

검증 단계에서 이슈 발견 시 자동으로 수정 및 재검증을 수행합니다.

```yaml
피드백_루프_실행:
  조건: 워크플로우 설계 시 feedback_loop.enabled=true로 설정된 경우
  절차:
    1. 워크플로우 실행 완료 후 검증 담당 에이전트 자동 호출
    2. 이슈 발견 시:
       - 해당 에이전트 재호출 (이슈 수정)
       - 다시 검증 담당 에이전트 호출 (재검증)
    3. max_iterations(기본값: 3)까지 반복
    4. 이슈 없음 또는 max_iterations 도달 시 종료

  실행_주체: Main Claude
  설정_주체: 워크플로우 설계 담당 에이전트 (feedback_loop 필드)
```

**상세 의사코드:**

```
max_iterations = 3
iteration = 0

while iteration < max_iterations:
    # 검증 실행
    review_result = Task(subagent_type=검증_담당_에이전트, ...)

    if review_result.issues.empty:
        break

    # 이슈 수정
    for issue in review_result.issues:
        fix_result = Task(
            subagent_type=issue.responsible_agent,
            prompt=f"수정 요청: {issue.description}"
        )

    iteration += 1

if iteration >= max_iterations:
    warn("최대 반복 횟수 도달. 수동 확인 필요.")
```

**피드백 루프 제한:**

```yaml
최대_반복: 3회

반복_기준:
  - 1회: 경미한 이슈 (스타일, 네이밍)
  - 2회: 중간 이슈 (로직 개선)
  - 3회: 주요 이슈 (아키텍처 변경)

초과_시:
  - 사용자에게 보고
  - 수동 검토 요청
  - 워크플로우 재설계 고려
```

---

## 금지 사항 (절대 위반 불가)

### 1. 코드 직접 수정 금지

```yaml
절대_금지:
  - Main Claude가 코드 파일 직접 Write/Edit
  - 워크플로우 없이 .ts, .tsx, .js, .jsx, .py 파일 수정
  - "간단해 보여서" 워크플로우 생략

위반_시:
  - 즉시 작업 중단
  - 워크플로우 재시작
```

### 2. 워크플로우 설계 생략 금지

```yaml
금지:
  - Main Claude가 직접 워크플로우 하드코딩
  - 에이전트 순서를 미리 결정
  - planner 호출 없이 바로 구현 에이전트 호출
  - "이전에 비슷한 작업 했으니까" 생략
```

### 3. 예외 남용 금지

```yaml
금지:
  - "단순 수정이라서" 예외 적용
  - "파일 하나니까" 예외 적용
  - "빨리 해야 해서" 예외 적용
  - 복잡도 과소평가

원칙:
  - 의심스러우면 전체 워크플로우 실행
  - 예외는 정말 예외적인 경우만
```

### 테스트 단계 생략 금지

모든 구현 작업은 반드시 테스트 단계를 포함해야 합니다.

```yaml
필수_포함:
  - 새 기능 구현 → 테스트 작성
  - 버그 수정 → 회귀 테스트
  - 리팩토링 → 기존 테스트 검증

워크플로우_설계_책임:
  - 테스트 단계가 빠진 워크플로우 거부
  - 적절한 테스트 전략 포함
```

### 검증을 마지막에만 수행 금지

검증은 각 주요 변경 후 즉시 수행되어야 합니다.

```yaml
좋은_예:
  - 구현 → 검증 → 수정 → 테스트 → 검증

나쁜_예:
  - 구현 → 테스트 → 문서 → 검증 (맨 마지막에만)

원칙:
  - 조기 피드백으로 큰 수정 방지
  - 각 단계별 품질 검증
  - 누적 이슈 최소화
```

---

## 워크플로우 필수 조건 (절대 우회 불가)

**다음 조건 중 하나라도 해당되면 반드시 전체 워크플로우 실행:**

```yaml
필수_워크플로우_트리거:
  파일_기준:
    - 코드 파일 수정 (.ts, .tsx, .js, .jsx, .py 등)
    - 2개 이상 파일 수정
    - 스키마/타입 파일 수정
    - 테스트 파일 수정

  작업_기준:
    - 새 기능 구현
    - 버그 수정
    - 리팩토링
    - API 변경
    - 데이터베이스 변경
    - 의존성 추가/변경

  복잡도_기준:
    - 20줄 이상 변경
    - 여러 컴포넌트/모듈 영향
    - 타입 시스템 영향
```

### 판단 흐름도

```
코드 파일 수정 필요?
  ├─ Yes → 전체 워크플로우 필수
  └─ No
       └─ 설정/문서 파일만?
            ├─ Yes → 직접 수정 가능
            └─ No → 전체 워크플로우 필수
```

### 자기 점검 질문

작업 시작 전 반드시 확인:

```yaml
체크리스트:
  - [ ] 코드 파일(.ts, .tsx 등)을 수정하는가?
  - [ ] 2개 이상의 파일을 수정하는가?
  - [ ] 새로운 기능을 추가하는가?
  - [ ] 기존 로직을 변경하는가?
  - [ ] 타입/인터페이스를 변경하는가?

하나라도_Yes: 전체 워크플로우 실행
모두_No: 예외 규칙 적용 가능
```

---

## 예외 상황 (매우 제한적)

### 직접 수정 허용 (코드 외 파일만)

```yaml
허용:
  - .claude/ 디렉토리 내부 파일
  - 설정 파일 (.json, .yaml, .yml) - 단순 값 변경만
  - 문서 파일 (.md, .txt)

금지:
  - 코드 파일 (.ts, .tsx, .js, .jsx, .py 등)
  - 스키마 파일
  - 테스트 파일
```

### 단순 질문/탐색 (Read-Only)

```yaml
예외_케이스:
  - 코드 읽기만 수행
  - 정보 검색/조회
  - 구조 파악
  - 문서 열람

필수_조건:
  - Write/Edit 도구 사용 금지
  - 코드 변경 없음
  - Git 작업 없음
```

### 명시적 커맨드 (코드 변경 없는 경우만)

```yaml
직접_실행:
  /commit:
    - 이미 변경된 코드를 커밋만 수행
    - 새 코드 작성 불가

  /review:
    - 기존 코드 검증만 수행
    - 코드 수정 불가

중요:
  - 코드 변경이 필요하면 반드시 전체 워크플로우 실행
```

---

## 워크플로우 품질 지표

```yaml
성공_기준:
  - 설계된 워크플로우 사용
  - 모든 변경에 테스트 포함
  - 조기 검증으로 이슈 최소화
  - 피드백 루프 3회 이내
  - 검증 단계를 각 주요 변경 후 수행

실패_신호:
  - 워크플로우 설계 없이 직접 에이전트 호출
  - 테스트 생략
  - 검증을 맨 마지막에만 수행
  - 피드백 루프 무한 반복
```

**구현 작업 체크리스트:**

```yaml
체크리스트:
  - [ ] 에이전트 디스커버리 수행
  - [ ] 워크플로우 설계 에이전트 호출
  - [ ] 구현 단계 포함
  - [ ] 테스트 단계 포함
  - [ ] 검증 단계 포함
  - [ ] 피드백 루프 준비
  - [ ] 커밋 단계 포함 (선택)
```

---

## Commands

```yaml
/implement: 새 기능 구현 (동적 워크플로우)
/fix: 버그 수정 (동적 워크플로우)
/commit: 커밋 (커밋 담당 에이전트 직접 호출)
/review: 코드 리뷰 (검증 담당 에이전트 직접 호출)
```

**모든 커맨드는 워크플로우 설계 담당 에이전트를 통해 동적 워크플로우 생성**
(단, `/commit`과 `/review`는 단순 작업 시 직접 호출 가능)

---

## 에이전트 선택 기준

워크플로우 설계 담당 에이전트가 다음을 고려하여 에이전트 선택:

```yaml
고려사항:
  - 작업 복잡도
  - 필요한 도구 (tools)
  - 에이전트 description 매칭
  - 병렬 실행 가능 여부
  - 피드백 루프 필요 여부
  - 테스트 전략
  - 검증 전략
```

---

## 참조

```yaml
에이전트: ".claude/agents/**/*.md"
커맨드: ".claude/commands/*.md"
공용_원칙: ".claude/agents/_shared-principles.md"
```
