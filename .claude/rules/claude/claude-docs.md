---
globs:
  - ".claude/**/*.md"
  - "CLAUDE.md"
  - "CLAUDE.local.md"
---

# Claude Documentation Rules

Claude 관련 문서(CLAUDE.md, skills, rules 등) 작성 시 적용되는 규칙입니다.

## 핵심 원칙: 정적 상태 금지

Claude 관련 문서에는 **정적인 상태를 포함하지 않습니다**.

## 금지 항목

### 1. 현재 구조/스펙 하드코딩
```markdown
# 금지 예시
.claude/
├── skills/
├── rules/
└── settings.json
```

### 2. 현재 지원 옵션 나열
```markdown
# 금지 예시
- allowed-tools: Read, Write, Bash, ...
- hooks events: PreToolUse, PostToolUse, ...
```

### 3. 현재 파일 목록
```markdown
# 금지 예시
Available skills:
- claude-management
- code-review
```

### 4. 버전별 기능 매핑
```markdown
# 금지 예시
v2.1.0: context fork 지원
v2.0.0: hooks 추가
```

## 이유

- 스펙은 수시로 변경됨
- 하드코딩된 정보는 빠르게 outdated됨
- deprecated 옵션 사용 위험
- 새 기능 누락 가능성

## 대신 사용할 것

동적 문서 참조 워크플로우:

```
1. WebFetch: https://code.claude.com/docs/llms.txt
2. WebFetch: https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
3. WebFetch: [llms.txt에서 찾은 상세 문서 URL]
```

## 허용되는 내용

- 문서 참조 워크플로우
- 검증 명령어 (`/memory`, `/doctor` 등)
- 핵심 URL (llms.txt, CHANGELOG)
- 일반적인 원칙/가이드라인
