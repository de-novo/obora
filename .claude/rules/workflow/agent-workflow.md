# Agent Workflow 강제 규칙

## 핵심: 동적 워크플로우

```yaml
원칙:
  - 모든 워크플로우는 동적으로 결정
  - 하드코딩된 워크플로우 금지
  - planner가 매번 상황에 맞게 설계
```

## Claude Code 제한사항

```yaml
제한:
  - 서브에이전트는 다른 서브에이전트를 호출할 수 없음
  - Task tool은 Main Claude만 사용 가능

해결:
  - Main Claude가 직접 각 에이전트 호출
  - planner가 워크플로우 설계 후 Main Claude가 실행
```

## 절대 금지 사항

```yaml
직접_수행_금지:
  - Write/Edit 도구로 코드 파일(.ts, .tsx, .js, .jsx) 직접 수정
  - Git commit 직접 수행
  - 워크플로우 없이 대규모 변경

반드시_에이전트_통해_수행:
  - 모든 코드 변경 → 적절한 에이전트 (동적 선택)
  - 모든 Git 커밋 → commit-helper
  - 모든 리뷰 → reviewer
```

---

## 동적 워크플로우 실행 모델

### 1. 에이전트 디스커버리

```bash
Glob: .claude/agents/**/*.md
```

모든 에이전트의 name, description, tools 수집

### 2. planner 호출

```
Task(subagent_type="planner", prompt="
작업: [사용자 요청]

사용 가능한 에이전트:
- name1: description1
- name2: description2
...

워크플로우를 JSON으로 반환:
{
  \"analysis\": \"작업 분석\",
  \"workflow\": [
    {\"agent\": \"에이전트명\", \"task\": \"구체적 작업\"},
    ...
  ]
}
")
```

### 3. 워크플로우 실행

```
for step in planner.workflow:
    result = Task(subagent_type=step.agent, prompt=step.task)
    다음 단계에 result 전달
```

### 4. 피드백 루프

```
if reviewer 이슈 발견:
    해당 에이전트 재호출
    다시 reviewer 호출
    최대 3회 반복
```

---

## Commands

```yaml
/implement: 새 기능 구현 (동적)
/fix: 버그 수정 (동적)
/commit: 커밋 (동적)
/review: 코드 리뷰 (동적)
```

모든 커맨드는 planner를 통해 동적 워크플로우 생성

---

## 에이전트 선택 기준

planner가 다음을 고려하여 에이전트 선택:

```yaml
고려사항:
  - 작업 복잡도
  - 필요한 도구 (tools)
  - 에이전트 description 매칭
  - 병렬 실행 가능 여부
  - 피드백 루프 필요 여부
```

---

## 참조

```yaml
에이전트: ".claude/agents/**/*.md"
커맨드: ".claude/commands/*.md"
공용_원칙: ".claude/agents/_shared-principles.md"
```
