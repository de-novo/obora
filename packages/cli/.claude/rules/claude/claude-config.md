---
globs:
  - ".claude/**/*"
  - "CLAUDE.md"
  - "CLAUDE.local.md"
  - "**/CLAUDE.md"
---

# Claude Configuration File Rules

Claude Code 설정 파일 수정 시 적용되는 규칙입니다.

## 필수: 최신 문서 참조

설정 파일을 수정하기 전에 **반드시** 다음 순서로 문서를 확인하세요.

### 1. llms.txt 조회
```
WebFetch: https://code.claude.com/docs/llms.txt
Prompt: Find all documentation URLs and identify which one covers [수정하려는 기능]
```

### 2. CHANGELOG 확인
```
WebFetch: https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
Prompt: Find recent changes, deprecated options, and breaking changes related to [수정하려는 기능]
```

### 3. 상세 문서 조회
```
WebFetch: [llms.txt에서 찾은 URL]
Prompt: Extract the complete current specification for [수정하려는 기능]
```

## 금지 사항

- 기억에 의존한 스펙/구조 작성 금지
- 문서 확인 없이 옵션/문법 가정 금지
- deprecated 옵션 사용 금지 (CHANGELOG 확인 필수)

## 검증

수정 후 Claude Code 명령으로 확인:
- `/memory`
- `/doctor`
- `/hooks`
- `/config`
