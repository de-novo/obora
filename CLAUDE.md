# Claude Code Configuration

**모든 워크플로우는 동적으로 결정됩니다.**

## 워크플로우 개요

```
요청 → Phase 0 (분석) → Phase 1 (인터뷰)? → Phase 2 (설계) → Phase 3 (실행) → Phase 4 (검증) → Phase 5 (완료)
```

## Phase 0: 요청 분석

**Main Claude가 요청을 분석하여 워크플로우 유형 결정:**

```yaml
워크플로우_유형:
  Discovery:
    조건: 요구사항 정리만 필요
    트리거: "/interview" 또는 명시적 요청
    흐름: interviewer → 문서 출력

  QuickFix:
    조건: 명확한 버그/수정
    트리거: 단순 수정, 에러 수정
    흐름: fix → test → review

  Feature:
    조건: 새 기능 (명확한 요구사항)
    트리거: 구체적인 기능 요청
    흐름: planner → implement → test → review

  FullFeature:
    조건: 새 기능 (모호한 요구사항)
    트리거: 추상적인 기능 요청
    흐름: interviewer → planner → implement → test → review
```

### 판단 기준

```yaml
명확한_요청:
  - 구체적인 파일/위치 명시
  - 명확한 입력/출력 정의
  - 예: "src/auth/login.ts에서 비밀번호 검증 수정"

모호한_요청:
  - 추상적인 기능 설명
  - What만 있고 How가 없음
  - 예: "로그인 기능 개선해줘"
```

## Phase 0.5: 기존 인터뷰 조회 (토픽 매칭 + 확인)

**`/implement` 실행 시:**

```yaml
옵션:
  --interview <id>:  특정 인터뷰 사용
  --no-interview:    인터뷰 조회 건너뛰기
  (기본):            토픽 매칭 + 사용자 확인

토픽_매칭:
  1. 사용자 요청에서 핵심 키워드 추출
  2. DB에서 키워드 매칭 인터뷰 검색
  3. 발견 시 사용자에게 확인 요청
  4. 사용자 승인 후 요구사항 적용

다중_세션_안전:
  - 자동 적용 없음 (항상 사용자 확인)
  - 토픽 불일치 시 무시
  - 명시적 선택 지원
```

## Phase 1: 요구사항 발견 (조건부)

**조건: 기존 인터뷰 없음 AND 모호한 요청**

```yaml
주체: interviewer 에이전트
목적:
  - 모호한 요청 → 구체적 요구사항
  - 숨겨진 요구사항 발견
  - 엣지 케이스 식별
  - 우선순위 결정

출력: 요구사항 명세서 (FR/NFR/엣지케이스)
저장: DB에 자동 저장 (workflows.output)
```

## Phase 2: 워크플로우 설계

```yaml
주체: planner 에이전트
입력: 사용자 요청 또는 요구사항 명세서

사전_조건:
  1. 에이전트 디스커버리 (Glob → Read 병렬)
  2. 에이전트 목록 전달

출력:
  analysis: 작업 분석
  workflow: 에이전트 실행 순서
  feedback_loop: 피드백 설정
```

## Phase 3-5: 실행 → 검증 → 완료

```yaml
Phase_3:
  - 워크플로우 순차/병렬 실행
  - 결과 수집

Phase_4:
  - reviewer 검증
  - 이슈 수정 반복 (최대 3회)

Phase_5:
  - 결과 요약
  - 커밋 (선택)
```

## Commands

| Command | 유형 | 설명 |
|---------|------|------|
| `/interview <요청>` | Discovery | 요구사항 인터뷰 (Phase 1만 실행) |
| `/implement <설명>` | Feature/FullFeature | 새 기능 구현 |
| `/fix <버그>` | QuickFix/Feature | 버그 수정 |
| `/commit` | - | 커밋 (직접 실행) |
| `/review <대상>` | - | 코드 리뷰 (직접 실행) |

## 필수 규칙

```yaml
반드시_에이전트_통해_수행:
  - 모든 코드 변경 → 적절한 에이전트
  - 모든 Git 커밋 → commit-helper
  - 모든 리뷰 → reviewer

예외_허용:
  - 설정 파일 (.json, .yaml) 직접 수정 가능
  - 문서 파일 (.md, .txt) 직접 수정 가능
  - .claude/ 내부 파일 직접 수정 가능

모호한_요청_시:
  - Phase 1 (인터뷰) 필수 실행
  - 또는 AskUserQuestion으로 확인
  - 절대 추측하여 진행 금지
```

## 에이전트 디스커버리

```bash
Glob: .claude/agents/**/*.md
```

각 에이전트의 YAML frontmatter:
- `name`: 식별자 (subagent_type으로 사용)
- `description`: 언제 사용하는지
- `tools`: 사용 가능한 도구
- `model`: 실행 모델

## 세션 간 지속성

```yaml
저장:
  - 모든 작업 결과 → DB (~/.obora/dashboard.db)
  - Hook이 자동 처리

인터뷰_연계:
  세션1: /interview → 요구사항 명세서 → DB 저장
  세션2: /implement → DB 조회 → 요구사항 발견 → planner 전달

조회_스크립트:
  .claude/scripts/queries/get-recent-interview.sh
```

## 참조

```yaml
Rules: ".claude/rules/workflow/agent-workflow.md"
Agents: ".claude/agents/**/*.md"
Commands: ".claude/commands/*.md"
Scripts: ".claude/scripts/**/*.sh"
```
