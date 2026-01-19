<!-- obora -->
# Obora Workflow System

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
    트리거: "/obora-interview" 또는 명시적 요청
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
```

## Phase 3-5: 실행 → 검증 → 완료

```yaml
Phase_3:
  - 워크플로우 순차/병렬 실행
  - 각 단계 실행 전 skills 로드
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
| `/obora-interview <요청>` | Discovery | 요구사항 인터뷰 |
| `/obora-implement <설명>` | Feature | 새 기능 구현 |
| `/obora-fix <버그>` | QuickFix | 버그 수정 |
| `/obora-commit` | - | 커밋 |
| `/obora-review <대상>` | - | 코드 리뷰 |

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

## 에이전트/스킬 디스커버리

```bash
# 에이전트 목록 조회
.claude/skills/obora/obora-agent-discovery/scripts/discover-agents.sh

# 스킬 목록 조회
.claude/skills/obora/obora-skill-discovery/scripts/discover-skills.sh
```

## CLI 명령어

```bash
obora init              # 프로젝트 초기화
obora sync              # 에셋 동기화
obora sync -f           # 강제 덮어쓰기
```
<!-- /obora -->
