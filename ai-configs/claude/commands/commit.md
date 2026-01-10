# /commit

커밋 메시지를 생성하고 커밋을 수행합니다.

## 프로세스

1. `git status`로 변경사항 확인
2. `git diff --staged`로 스테이지된 변경 확인
3. Conventional Commits 형식으로 메시지 생성
4. 커밋 수행

## 커밋 메시지 형식

```
<type>(<scope>): <subject>

<body>
```

### Type
- `feat`: 새 기능
- `fix`: 버그 수정
- `docs`: 문서 변경
- `style`: 코드 스타일 (기능 변경 없음)
- `refactor`: 리팩토링
- `perf`: 성능 개선
- `test`: 테스트
- `chore`: 빌드/설정

### 예시
```
feat(auth): add Google OAuth login

- Add Google OAuth provider
- Create callback handler
- Update user model

Closes #123
```

## 규칙

- 제목은 50자 이내
- 제목은 명령형으로 작성 ("Add feature" not "Added feature")
- 본문은 72자에서 줄바꿈
- 본문에는 "무엇을", "왜" 설명
