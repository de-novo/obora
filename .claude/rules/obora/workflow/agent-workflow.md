---
description: 동적 워크플로우 실행 규칙. 요구사항 발견, 워크플로우 설계, 에이전트 실행, 피드백 루프에 적용.
globs:
  - "**/*"
---

# Agent Workflow 규칙

## 워크플로우 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                        사용자 요청                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 0: 요청 분석 (Main Claude)                                │
│  - 요청 명확성 판단                                              │
│  - 워크플로우 유형 결정                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            │                                   │
            ▼ (모호)                            ▼ (명확)
┌───────────────────────┐             ┌───────────────────────┐
│  Phase 1: 요구사항     │             │  Phase 2로 직행        │
│  interviewer          │             │                       │
└───────────────────────┘             └───────────────────────┘
            │                                   │
            └─────────────────┬─────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 2: 워크플로우 설계 (planner)                              │
│  - 에이전트 선택                                                 │
│  - 실행 순서 결정                                                │
│  - 병렬/순차 판단                                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 3: 워크플로우 실행                                        │
│  - 에이전트 순차/병렬 실행                                       │
│  - 결과 수집                                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 4: 피드백 루프                                            │
│  - reviewer 검증                                                 │
│  - 이슈 수정 반복                                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 5: 완료                                                   │
│  - 결과 요약                                                     │
│  - 커밋 (선택)                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 0: 요청 분석

**주체: Main Claude**

사용자 요청을 분석하여 워크플로우 유형을 결정합니다.

### 명확성 판단 기준

```yaml
명확한_요청:
  - 구체적인 파일/위치 명시
  - 명확한 입력/출력 정의
  - 기술적 요구사항 포함
  - 예: "src/auth/login.ts에서 비밀번호 검증 로직 수정"

모호한_요청:
  - 추상적인 기능 설명
  - What만 있고 How가 없음
  - 비즈니스 요구사항만 있음
  - 예: "로그인 기능 개선해줘"

판단_불가:
  - 여러 해석 가능
  - 범위가 불명확
  - 사용자 의도 파악 어려움
```

### 워크플로우 유형 결정

```yaml
유형_선택:
  Discovery:
    조건: 요구사항 정리만 필요
    트리거: "/interview" 또는 명시적 요청
    흐름: interviewer → 문서 출력

  QuickFix:
    조건: 명확한 버그/수정
    트리거: 단순 수정, 타입 에러, 린트 에러
    흐름: debugger/implementer → test → review

  Feature:
    조건: 새 기능 (명확한 요구사항)
    트리거: 구체적인 기능 요청
    흐름: planner → implement → test → review

  FullFeature:
    조건: 새 기능 (모호한 요구사항)
    트리거: 추상적인 기능 요청
    흐름: interviewer → planner → implement → test → review
```

### 판단 흐름

```
요청 수신
    │
    ├─ "/interview" 명령? ─────────────────→ Discovery
    │
    ├─ 구체적인 버그/에러? ────────────────→ QuickFix
    │
    ├─ 요구사항이 명확한가?
    │       │
    │       ├─ Yes ───────────────────────→ Feature
    │       │
    │       └─ No ────────────────────────→ FullFeature
    │
    └─ 판단 불가 ──→ AskUserQuestion으로 확인 또는 FullFeature
```

---

## Phase 1: 요구사항 발견 (선택적)

**주체: obora-interviewer 에이전트**
**조건: Phase 0에서 모호한 요청으로 판단 시**

### 목적

- 모호한 요청을 구체적인 요구사항으로 변환
- 숨겨진 요구사항 발견
- 엣지 케이스 식별
- 우선순위 결정

### 실행

```
Task(subagent_type="obora-interviewer", prompt="
요구사항 인터뷰 진행:

사용자 요청: [원래 요청]

다음 단계로 진행:
1. 코드베이스 맥락 파악
2. 핵심 요구사항 도출 (AskUserQuestion 사용)
3. 세부사항 탐색
4. 엣지 케이스 발견
5. 우선순위 결정
6. 요구사항 명세서 작성

출력: 구조화된 요구사항 명세서
")
```

### 출력 형식

```markdown
# 요구사항 명세서: [기능명]

## 개요
- 목적: [비즈니스 목적]
- 사용자: [대상 사용자]
- 트리거: [기능 실행 조건]

## 기능 요구사항 (FR)
- FR-001: [기능] - [우선순위]
- FR-002: [기능] - [우선순위]

## 비기능 요구사항 (NFR)
- NFR-001: [요구사항]

## 엣지 케이스
- EC-001: [상황] → [처리]

## 제약사항
- [기술적/비즈니스 제약]

## 관련 기존 코드
- path/to/file.ts: [설명]
```

### Phase 1 완료 후

- Discovery 유형: 여기서 종료, 문서 출력
- FullFeature 유형: Phase 2로 진행 (요구사항 명세서 전달)

---

## Phase 2: 워크플로우 설계

**주체: obora-planner 에이전트**

### 사전 조건: 에이전트 디스커버리

Main Claude가 수행:

```bash
# 스크립트로 에이전트 목록 조회 (name, description, path만)
.claude/skills/obora/obora-agent-discovery/scripts/discover-agents.sh
```

**출력 예시:**
```yaml
agents:
  - name: "obora-planner"
    description: "워크플로우 설계. 작업 분석, 에이전트 선택, 실행 순서 결정."
    path: "obora/core/obora-planner.md"
  - name: "obora-implementer"
    description: "코드 구현. 새 기능, 수정, 리팩토링."
    path: "obora/code/obora-implementer.md"
  - name: "my-custom-agent"
    description: "사용자 정의 에이전트."
    path: "my-custom-agent.md"
```

**세부 내용(프롬프트, 지침)은 실행 시점에 로드** → 컨텍스트 절약

### planner 호출

```
Task(subagent_type="obora-planner", prompt="
작업 요청: [사용자 요청 또는 요구사항 명세서]

사용 가능한 에이전트:
[에이전트 목록 - name: description]

워크플로우 설계:
{
  \"analysis\": \"작업 분석\",
  \"workflow\": [
    {
      \"agent\": \"에이전트명\",
      \"task\": \"구체적 작업\",
      \"critical\": true,
      \"parallel_with\": []
    }
  ],
  \"feedback_loop\": {
    \"enabled\": true,
    \"max_iterations\": 3
  }
}
")
```

### 워크플로우 검증

```yaml
필수_검증:
  - 코드 변경 시 테스트 단계 포함?
  - 코드 변경 시 feedback_loop.enabled = true?
  - critical 필드 설정?

실패_시:
  - planner 재호출
  - 누락된 단계 추가 요청
```

---

## Phase 3: 워크플로우 실행

**주체: Main Claude**

### 순차 실행

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
        for name in step.parallel_with:
            parallel_step = find_step(workflow, name)
            if parallel_step:
                parallel_agents.append(parallel_step)

    # 실행 (병렬 또는 순차)
    if len(parallel_agents) > 1:
        # 병렬 실행: 동시에 여러 Task 호출
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

        # Critical 실패 시 중단
        if result.failed and step.critical:
            break

        results.append(result)
        executed.add(step.agent)
```

---

## Phase 4: 피드백 루프

**주체: Main Claude**
**조건: feedback_loop.enabled = true**

### 실행

```python
max_iterations = feedback_loop.max_iterations or 3
iteration = 0

while iteration < max_iterations:
    # 리뷰 실행
    review_result = Task(subagent_type="obora-reviewer", prompt=f"""
전체 워크플로우 결과 리뷰:
{format_all_results(results)}

이슈 발견 시:
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
""")

    # 이슈 없으면 종료
    if not review_result.issues:
        break

    # Critical 이슈만 수정
    critical_issues = [i for i in review_result.issues
                       if i.severity == "critical"]

    if not critical_issues:
        # Warning만 있으면 보고 후 종료
        break

    # 이슈 수정
    for issue in critical_issues:
        fix_result = Task(
            subagent_type=issue.responsible_agent,
            prompt=f"수정 요청: {issue.description}"
        )
        results.append(fix_result)

    iteration += 1

if iteration >= max_iterations:
    warn("최대 반복 횟수 도달. 수동 확인 필요.")
```

### 제한

```yaml
최대_반복: 3회
초과_시:
  - 사용자에게 보고
  - 수동 검토 요청
```

---

## Phase 5: 완료

### 결과 요약

```markdown
## 워크플로우 실행 결과

### 워크플로우 유형
[Discovery | QuickFix | Feature | FullFeature]

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

### 커밋 (선택)

사용자가 커밋 요청 시 obora-commit-helper 호출

---

## 워크플로우 유형별 요약

| 유형 | 트리거 | 흐름 | Phase 1 |
|------|--------|------|---------|
| **Discovery** | /interview | interviewer → 문서 | ✅ 필수 |
| **QuickFix** | 명확한 버그 | fix → test → review | ❌ 생략 |
| **Feature** | 구체적 기능 | planner → impl → test → review | ❌ 생략 |
| **FullFeature** | 모호한 기능 | **interviewer** → planner → impl → test → review | ✅ 필수 |

---

## 금지 사항

### 코드 직접 수정 금지

```yaml
절대_금지:
  - Main Claude가 코드 파일 직접 Write/Edit
  - 워크플로우 없이 코드 수정
  - "간단해 보여서" 워크플로우 생략

위반_시:
  - 즉시 작업 중단
  - 워크플로우 재시작
```

### 워크플로우 생략 금지

```yaml
금지:
  - planner 호출 없이 구현 에이전트 호출
  - 테스트 단계 생략
  - 피드백 루프 생략 (코드 변경 시)

예외:
  - /commit: 커밋만 수행
  - /review: 리뷰만 수행
  - /interview: 인터뷰만 수행
```

### Phase 1 임의 생략 금지

```yaml
금지:
  - 모호한 요청인데 인터뷰 생략
  - 사용자 의도 추측하여 진행
  - "아마 이걸 원하는 것 같다" 가정

원칙:
  - 의심스러우면 인터뷰 진행
  - 또는 AskUserQuestion으로 확인
```

---

## 예외 상황

### 직접 수정 허용

```yaml
허용:
  - .claude/ 디렉토리 내부 파일
  - 설정 파일 (.json, .yaml) - 단순 값 변경
  - 문서 파일 (.md, .txt)

금지:
  - 코드 파일
  - 스키마 파일
  - 테스트 파일
```

### 단순 질문/탐색

```yaml
허용:
  - 코드 읽기만 수행
  - 정보 검색/조회
  - 구조 파악

조건:
  - Write/Edit 사용 금지
  - 코드 변경 없음
```

---

## Commands

| Command | 단축키 | 설명 |
|---------|--------|------|
| `/obora-interview <요청>` | - | 요구사항 인터뷰 (Phase 1만 실행) |
| `/obora-implement <설명>` | `/oi` | 새 기능 구현 |
| `/obora-fix <버그>` | `/of` | 버그 수정 |
| `/obora-commit` | `/oc` | 커밋 (직접 실행) |
| `/obora-review <대상>` | `/or` | 코드 리뷰 (직접 실행) |

---

## 참조

```yaml
에이전트: ".claude/agents/**/*.md"      # obora + 사용자 모두
커맨드: ".claude/commands/**/*.md"      # obora + 사용자 모두
공용_원칙: ".claude/agents/obora/_shared-principles.md"
```
