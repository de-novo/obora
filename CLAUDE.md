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
  1. 에이전트 디스커버리 (스크립트 실행)
  2. 스킬 디스커버리 (스크립트 실행)
  3. 에이전트 + 스킬 목록 planner에게 전달

출력:
  analysis: 작업 분석
  workflow: 에이전트 실행 순서 (각 단계별 skills 포함)
  feedback_loop: 피드백 설정

워크플로우_단계_형식:
  agent: 에이전트명
  task: 구체적 작업 내용
  skills: [관련 스킬 목록]  # 선택적, 빈 배열 가능
```

## Phase 3-5: 실행 → 검증 → 완료

```yaml
Phase_3:
  - 워크플로우 순차/병렬 실행
  - 각 단계 실행 전 skills 로드 (Read로 SKILL.md 내용 읽기)
  - 에이전트 호출 시 스킬 내용 prompt에 포함
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
| `/obora-workflow <요청>` | Auto | 자동 워크플로우 판단 및 실행 |
| `/obora-interview <요청>` | Discovery | 요구사항 인터뷰 (Phase 1만 실행) |
| `/obora-implement <설명>` | Feature/FullFeature | 새 기능 구현 |
| `/obora-fix <버그>` | QuickFix/Feature | 버그 수정 |
| `/obora-commit` | - | 커밋 (직접 실행) |
| `/obora-review <대상>` | - | 코드 리뷰 (직접 실행) |

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
# 스크립트로 에이전트 목록 조회 (name, description, path만)
.claude/skills/obora/obora-agent-discovery/scripts/discover-agents.sh
```

**추출 정보:**
- `name`: 식별자 (subagent_type으로 사용)
- `description`: 언제 사용하는지
- `path`: 파일 경로

**세부 내용(프롬프트, 지침)은 실행 시점에 로드** → 컨텍스트 절약

## 스킬 디스커버리

```bash
# 스크립트로 스킬 목록 조회 (name, description, path만)
.claude/skills/obora/obora-skill-discovery/scripts/discover-skills.sh
```

**추출 정보:**
- `name`: 스킬 식별자
- `description`: 어떤 상황에서 사용하는지
- `path`: 스킬 폴더 경로

**스킬 선택:**
- planner가 각 워크플로우 단계에 적합한 스킬 선택
- obora 스킬 + 사용자 정의 스킬 모두 고려
- Main Claude가 스킬 내용 로드 후 에이전트에 전달

## 세션 간 지속성

```yaml
저장:
  - 모든 작업 결과 → DB (~/.obora/dashboard.db)
  - Hook이 자동 처리

인터뷰_연계:
  세션1: /interview → 요구사항 명세서 → DB 저장
  세션2: /implement → DB 조회 → 요구사항 발견 → planner 전달

조회_스크립트:
  .claude/scripts/obora/queries/get-recent-interview.sh
```

## 워크플로우 제목 자동 업데이트

작업 완료 후 워크플로우 제목이 의미없으면 자동 업데이트합니다.

```yaml
컨텍스트: ~/.obora/workflow-context.json
스킬: .claude/skills/obora/obora-workflow-title/SKILL.md
스크립트: .claude/scripts/obora/workflow/update-workflow.sh <id> title "<제목>"
```

## CLI 명령어

```bash
# 프로젝트 초기화 (에셋 자동 동기화)
obora init

# 에셋 동기화 (업데이트 시)
obora sync              # 전체 동기화
obora sync -t skills    # 스킬만 동기화
obora sync -t settings  # 설정(훅)만 동기화
obora sync -f           # 강제 덮어쓰기
obora sync -l           # 사용 가능한 에셋 목록
```

## 참조

```yaml
Rules: ".claude/rules/"
Agents: ".claude/agents/obora/"
Commands: ".claude/commands/obora/"
Skills: ".claude/skills/obora/"
Scripts: ".claude/scripts/obora/"
```
