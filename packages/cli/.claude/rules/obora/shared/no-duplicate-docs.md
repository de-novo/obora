---
description: 문서 중복 방지 규칙. 기존 문서 확인 필수, 부적합 시 사용자 확인 후 진행.
globs:
  - "**/*.md"
---

# No Duplicate Documents Rule

문서 파일(.md) 생성 및 관리 시 적용되는 중복 방지 규칙입니다.

## 핵심 원칙

**Single Source of Truth (단일 진실 원천)**

- 동일한 주제의 문서는 하나만 유지합니다
- 문서 생성보다 기존 문서 확장을 우선합니다
- 중복 발견 시 즉시 통합합니다

## 새 문서 생성 전 필수 절차

### 1. 기존 문서 확인

```bash
# 관련 문서 검색
Glob: **/*.md
Grep: (키워드) in **/*.md
```

### 2. 중복 여부 판단

다음 질문에 답해봅니다:

- 동일한 주제를 다루는 문서가 이미 있는가?
- 기존 문서에 섹션을 추가하면 해결되는가?
- 참조/링크로 연결 가능한가?

### 3. 기존 문서 확장 우선

```markdown
# 기존 문서에 추가할 수 있다면
Edit: 기존 문서에 새 섹션 추가

# 정말 새 문서가 필요한 경우에만
Write: 새 문서 생성
```

### 4. 부적합한 요청 시 사용자 확인

기존 문서가 있고 요청이 적합하지 않다고 판단되면 **반드시 사용자에게 확인**합니다.

```yaml
확인_필요_상황:
  - 유사한 문서가 이미 존재
  - 기존 문서에 추가하는 것이 더 적합해 보임
  - 요청된 문서명이 기존 문서와 중복/혼동 가능
  - 문서 분리 기준에 부합하지 않음

확인_방법:
  - AskUserQuestion 도구 사용
  - 기존 문서 경로와 내용 요약 제시
  - 선택지 제공: 기존 문서 확장 vs 새 문서 생성

확인_없이_진행_금지:
  - 임의로 새 문서 생성
  - 임의로 기존 문서에 추가
  - 사용자 의도 추측하여 진행
```

**예시:**

```
사용자: "워크플로우 실행 규칙 문서 만들어줘"

발견: .claude/rules/workflow/agent-workflow.md (동적 워크플로우 규칙)

→ 사용자에게 확인:
  "기존에 agent-workflow.md가 있습니다.
   1) 기존 문서에 내용 추가
   2) 별도 문서로 분리
   어떤 방식을 원하시나요?"
```

## 문서 분리 기준

다음 경우에만 새 문서 생성이 적절합니다:

### 허용되는 분리

- **명확히 다른 목적**: API 문서 vs 사용자 가이드
- **다른 대상 독자**: 개발자 vs 엔드유저
- **다른 생명주기**: 릴리즈 노트 vs 아키텍처 문서
- **명시적 요청**: 사용자가 구체적으로 분리 요청

### 예시

```
# Good - 목적이 다름
/docs/api/authentication.md      (API 스펙)
/docs/guides/authentication.md   (사용 가이드)

# Good - 대상이 다름
/docs/developer/setup.md         (개발 환경 구성)
/docs/user/getting-started.md    (사용자 시작 가이드)

# Bad - 내용 중복
/docs/api/user-create.md
/docs/api/user-register.md       (create와 중복)

# Bad - 불필요한 분리
/docs/config-options.md
/docs/configuration-guide.md     (통합 가능)
```

## 금지 사항

### 1. 유사 주제로 새 파일 생성

```markdown
# 금지
/docs/error-handling.md
/docs/handling-errors.md          (같은 주제)

# 대신
/docs/error-handling.md           (하나만 유지)
```

### 2. 내용 복사 후 약간 수정

```markdown
# 금지
/docs/setup-macos.md
/docs/setup-linux.md
/docs/setup-windows.md
(90% 동일한 내용 반복)

# 대신
/docs/setup.md
## macOS
## Linux
## Windows
```

### 3. 참조 없이 독립적인 중복

```markdown
# 금지
/docs/deployment.md
/guides/how-to-deploy.md          (서로 참조 없음)

# 대신
/docs/deployment.md
(또는 한 문서에서 다른 문서 참조)
```

## 중복 발견 시 처리

### 1. 평가

```
- 어느 문서가 더 최신인가?
- 어느 문서가 더 완전한가?
- 어느 위치가 더 적절한가?
```

### 2. 통합

```markdown
# 선택된 문서에 내용 병합
Edit: 메인 문서에 누락된 내용 추가

# 중복 문서 삭제
Bash: git rm 중복-문서.md
```

### 3. 링크 업데이트

```bash
# 중복 문서를 참조하는 곳 찾기
Grep: "중복-문서.md" in **/*.md

# 새 위치로 링크 업데이트
Edit: 참조 문서들의 링크 수정
```

## 문서 구조 원칙

### 계층적 구조

```
/docs/
  ├── README.md                   (개요 + 다른 문서 링크)
  ├── getting-started.md
  ├── api/
  │   └── README.md               (API 개요 + 하위 문서 링크)
  └── guides/
      └── README.md               (가이드 개요 + 하위 문서 링크)
```

### 명확한 책임

```
각 문서는 하나의 명확한 책임을 가집니다:

- getting-started.md → 시작 방법만
- configuration.md → 설정 옵션만
- api-reference.md → API 스펙만
```

## 검증 방법

### 문서 생성 전 체크리스트

```markdown
- [ ] Glob/Grep으로 기존 문서 검색 완료
- [ ] 기존 문서에 추가 가능 여부 검토
- [ ] 분리 기준에 부합하는지 확인
- [ ] 사용자가 명시적으로 새 문서 요청했는가
```

### 정기 검토

```bash
# 유사한 파일명 찾기
find . -name "*.md" | sort

# 내용 중복 검사
Grep: (주요 키워드) in **/*.md
```

## 예외 사항

다음 경우 중복이 허용됩니다:

- **템플릿 문서**: 복사하여 사용하는 템플릿
- **다국어 문서**: README.md, README.ko.md
- **버전별 문서**: v1-migration.md, v2-migration.md
- **자동 생성 문서**: CHANGELOG.md (자동), RELEASES.md (수동)

## 요약

```yaml
원칙:
  - Single Source of Truth
  - 문서 생성보다 확장 우선
  - 중복 발견 시 즉시 통합

절차:
  1. 기존 문서 검색 (Glob/Grep)
  2. 중복 여부 판단
  3. 기존 문서 확장 또는 새 문서 생성

금지:
  - 유사 주제 새 파일
  - 내용 복사 후 수정
  - 참조 없는 독립 중복

예외:
  - 명확히 다른 목적
  - 다른 대상 독자
  - 사용자 명시적 요청
```
