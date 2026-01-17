---
name: claude-management
description: Set up and manage Claude Code configuration for projects. Use when setting up CLAUDE.md, creating skills, configuring hooks, rules, MCP servers, or managing Claude Code settings. Always fetches latest documentation from official sources.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebFetch
user-invocable: true
---

# Claude Code Configuration Management

Claude Code 설정을 관리할 때 **항상 최신 공식 문서를 참조**합니다.

## 핵심 원칙: 동적 문서 참조

**절대 기억에 의존하지 말고, 항상 최신 문서를 fetch하세요.**

스펙, 구조, 옵션은 수시로 변경될 수 있습니다.

## Step 1: llms.txt 조회 (필수)

모든 Claude 설정 작업 전에 먼저 실행:

```
WebFetch: https://code.claude.com/docs/llms.txt
Prompt: List all available documentation pages with their URLs and descriptions
```

이 파일에서 필요한 문서의 최신 URL을 확인합니다.

## Step 2: CHANGELOG 확인 (권장)

최신 기능/변경사항 확인:

```
WebFetch: https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
Prompt: Extract recent changes related to [topic]. Focus on new features, breaking changes, and deprecated options.
```

## Step 3: 상세 문서 조회

llms.txt에서 찾은 URL로 상세 문서 조회:

| 주제 | llms.txt에서 찾을 키워드 |
|------|------------------------|
| CLAUDE.md | "memory" |
| Skills | "skills" |
| Rules | "memory" (rules section) |
| Hooks | "hooks" |
| Settings | "settings" |
| MCP | "mcp" |
| Permissions | "iam" |
| Subagents | "sub-agents" |

```
WebFetch: [URL from llms.txt]
Prompt: Extract complete specification for [specific feature needed]
```

## Step 4: 프로젝트에 적용

1. 기존 설정 파일 확인 (있다면)
2. 문서에서 확인한 최신 스펙으로 생성/수정
3. 검증 명령 실행

## 검증 명령

설정 후 다음 명령으로 확인:
- `/memory` - 로드된 메모리 파일 확인
- `/doctor` - 설정 문제 진단
- `/hooks` - 등록된 훅 확인
- `/config` - 현재 설정 확인

## 주의사항

- **하드코딩 금지**: 구조, 옵션, 문법을 기억에 의존하지 마세요
- **항상 fetch**: 간단한 작업이라도 문서 확인
- **CHANGELOG 확인**: deprecated 옵션, breaking changes 주의
- **버전 확인**: 사용자의 Claude Code 버전에 따라 지원 기능 다를 수 있음

## 예시 워크플로우

### "Skills 만들어줘" 요청 시:

1. llms.txt fetch → skills.md URL 찾기
2. CHANGELOG fetch → skills 관련 최신 변경사항 확인
3. skills.md fetch → 현재 스펙 (frontmatter 필드, 옵션 등) 확인
4. 프로젝트 분석 → 필요한 스킬 파악
5. 최신 스펙에 맞춰 스킬 생성
6. `/memory` 명령으로 로드 확인

### "Hooks 설정해줘" 요청 시:

1. llms.txt fetch → hooks.md URL 찾기
2. CHANGELOG fetch → hooks 관련 최신 변경사항 확인
3. hooks.md fetch → 현재 스펙 (이벤트 종류, 설정 형식 등) 확인
4. settings.md fetch → settings.json 형식 확인
5. 최신 스펙에 맞춰 hooks 설정
6. `/hooks` 명령으로 등록 확인

## 문서 URL이 변경된 경우

llms.txt에서 URL을 찾을 수 없다면:
1. 유사한 키워드로 재검색
2. llms.txt 전체 내용 확인
3. 사용자에게 문서 변경 가능성 안내
