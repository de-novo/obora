---
description: Git 사용 규칙. 커밋 메시지, 브랜치 네이밍, PR 규칙.
globs:
  - "**/*"
---

# Git Conventions

일관된 Git 사용 규칙을 따릅니다.

## 커밋 메시지

### Conventional Commits 형식

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

| Type | 설명 |
|------|------|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `docs` | 문서 변경 |
| `style` | 포맷팅 (코드 동작 변경 없음) |
| `refactor` | 리팩토링 |
| `perf` | 성능 개선 |
| `test` | 테스트 추가/수정 |
| `chore` | 빌드, 설정 등 |
| `ci` | CI 설정 |

### 예시

```bash
# Good
feat(auth): add OAuth2 login support
fix(api): handle null response from server
docs(readme): update installation instructions
refactor(utils): extract date formatting logic
test(user): add unit tests for validation

# Bad
updated code
fix bug
WIP
asdf
```

### Subject 규칙

- 소문자로 시작
- 마침표 없음
- 명령형 사용 (add, fix, update)
- 50자 이내

```bash
# Good
feat(cart): add item quantity validation

# Bad
feat(cart): Added item quantity validation.
feat(cart): This commit adds item quantity validation
```

## 브랜치 네이밍

### 형식

```
<type>/<description>
```

### 예시

```bash
# Feature
feat/user-authentication
feat/payment-integration

# Bug fix
fix/login-redirect-loop
fix/cart-total-calculation

# Hotfix
hotfix/security-patch

# Release
release/v1.2.0

# Chore
chore/update-dependencies
```

### 금지

```bash
# Bad
my-branch
test
temp
john/feature
```

## 커밋 단위

### 작은 단위로 커밋

```bash
# Good - 논리적 단위
git commit -m "feat(user): add user model"
git commit -m "feat(user): add user repository"
git commit -m "feat(user): add user service"
git commit -m "feat(user): add user controller"

# Bad - 너무 큰 단위
git commit -m "feat(user): add user feature"  # 모든 변경 한 번에
```

### 커밋 전 확인

```bash
# 변경 사항 확인
git diff --staged

# 불필요한 파일 제외
git reset HEAD <file>
```

## PR/MR 규칙

### 제목

```
[TYPE] 간단한 설명
```

### 본문 포함 사항

- 변경 사항 요약
- 관련 이슈 링크
- 테스트 방법
- 스크린샷 (UI 변경 시)

## 금지 사항

- `main`/`master`에 직접 push
- Force push (공유 브랜치)
- 커밋에 민감 정보 포함
- 불필요한 파일 커밋 (node_modules, .env)
