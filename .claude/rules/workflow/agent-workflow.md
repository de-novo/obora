# Agent Workflow 강제 규칙

## 절대 금지 사항

```yaml
직접_수행_금지:
  - Write/Edit 도구로 코드 파일(.ts, .tsx, .js, .jsx) 직접 수정
  - Git commit 직접 수행
  - 워크플로우 없이 대규모 변경

Agent_통해_수행:
  - 모든 코드 변경 → 개발 에이전트 (description 기반 동적 선택)
  - 모든 Git 커밋 → 커밋 담당 에이전트
  - 모든 리뷰 → 리뷰 담당 에이전트
```

---

## 에이전트 선택 (Dynamic Discovery)

**하드코딩된 에이전트 목록 사용 금지**

```yaml
선택_방식:
  1. Glob ".claude/agents/**/*.md"로 모든 에이전트 탐색
  2. 각 에이전트의 frontmatter.description 분석
  3. 작업 내용에 맞는 에이전트 선택

에이전트_정의_위치: ".claude/agents/**/*.md"
```

---

## 워크플로우 실행 모델

### Planner 중앙 제어

```yaml
실행_흐름:
  1. 메인 Claude가 Task(planner)로 계획 요청
  2. Planner가 에이전트 동적 탐색 후 워크플로우 설계
  3. 메인 Claude가 워크플로우에 따라 에이전트 순차/병렬 실행
  4. 각 에이전트는 자신의 결과 반환
  5. 모든 단계 완료 시 워크플로우 종료
```

### 워크플로우 유형

```yaml
implement: "planner → 개발자 → reviewer → committer"
fix: "개발자 → reviewer → committer"
commit: "committer"
review: "reviewer"
explore: "explorer (커밋 불필요)"
```

---

## Commands (워크플로우 트리거)

```yaml
/implement: 새 기능 구현 워크플로우 시작
/fix: 버그 수정 워크플로우 시작
/commit: 커밋 워크플로우 시작
/review: 코드 리뷰 요청
```

---

## 체크리스트

작업 완료 전 확인:

- [ ] 에이전트를 동적으로 탐색했는가?
- [ ] 워크플로우를 따랐는가?
- [ ] 에이전트를 통해 코드를 수정했는가?
- [ ] 에이전트를 통해 커밋했는가?
- [ ] 빌드/타입체크를 확인했는가?

---

## 참조

```yaml
에이전트: ".claude/agents/**/*.md"
커맨드: ".claude/commands/*.md"
공용_원칙: ".claude/agents/_shared-principles.md"
```
