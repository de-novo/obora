# /workflow - 동적 워크플로우 실행

obora 동적 워크플로우 시스템의 진입점입니다.

## 사용법

```
/workflow <작업 설명>
```

## 워크플로우 유형 자동 판단

사용자 요청을 분석하여 적절한 워크플로우를 자동 선택합니다:

| 유형 | 조건 | 전용 명령어 |
|------|------|------------|
| **implement** | 새 기능 구현 | `/obora:obora-implement` |
| **fix** | 버그 수정 | `/obora:obora-fix` |
| **review** | 코드 리뷰 | `/obora:obora-review` |
| **commit** | Git 커밋 | `/obora:obora-commit` |
| **interview** | 요구사항 수집 | `/obora:obora-interview` |

## 판단 기준

```yaml
implement:
  키워드: [구현, 추가, 만들어, 생성, 개발, feature, add, create]
  예시: "JWT 인증 미들웨어 구현해줘"

fix:
  키워드: [수정, 버그, 에러, 오류, 고쳐, fix, bug, error]
  예시: "로그인 버그 수정해줘"

review:
  키워드: [리뷰, 검토, 확인, review, check]
  예시: "변경사항 리뷰해줘"

commit:
  키워드: [커밋, commit, 저장]
  예시: "변경사항 커밋해줘"

interview:
  키워드: [요구사항, 인터뷰, 정리, 분석]
  예시: "로그인 기능 요구사항 정리해줘"
```

## 실행 절차

### 1. 요청 분석

$ARGUMENTS를 분석하여 워크플로우 유형 판단

### 2. 해당 워크플로우 실행

판단된 유형에 따라 해당 명령어의 로직 실행:

- **implement** → `.claude/commands/obora/obora-implement.md` 절차 따름
- **fix** → `.claude/commands/obora/obora-fix.md` 절차 따름
- **review** → `.claude/commands/obora/obora-review.md` 절차 따름
- **commit** → `.claude/commands/obora/obora-commit.md` 절차 따름

### 3. 결과 요약

워크플로우 완료 후 실행 결과 요약 출력

## 예시

```
/workflow JWT 인증 미들웨어 구현
→ implement 워크플로우 실행

/workflow 로그인 시 세션 유지 안되는 버그
→ fix 워크플로우 실행

/workflow 변경사항 검토해줘
→ review 워크플로우 실행
```

## 전용 명령어 직접 사용

특정 워크플로우를 직접 실행하려면:

```
/obora:obora-implement <기능 설명>
/obora:obora-fix <버그 설명>
/obora:obora-review [대상]
/obora:obora-commit [메시지]
/obora:obora-interview <요청>
```

## 참조

- 핵심 Skill: `.claude/skills/obora/obora-workflow/SKILL.md`
- 명령어 정의: `.claude/commands/obora/`
- 에이전트 정의: `.claude/agents/obora/`
