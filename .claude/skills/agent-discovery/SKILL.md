---
name: agent-discovery
description: 사용 가능한 에이전트 목록 조회. 워크플로우 설계, 에이전트 선택 시 사용. 병렬로 에이전트 메타데이터 수집.
allowed-tools: Glob, Read
user-invocable: false
---

# Agent Discovery

사용 가능한 모든 에이전트와 메타데이터를 빠르게 조회합니다.

## 사용 시점

- 워크플로우 설계 전 에이전트 목록 필요 시
- planner가 에이전트 선택 시
- 에이전트 역할 파악 필요 시

## 워크플로우

### 1. 에이전트 파일 탐색

```bash
Glob: .claude/agents/**/*.md
```

결과에서 `_shared-principles.md` 등 공용 파일 제외

### 2. 메타데이터 추출 (병렬)

각 에이전트 파일의 YAML frontmatter에서 추출:

```yaml
name: 에이전트 식별자 (subagent_type으로 사용)
description: 역할 및 사용 시점
tools: 사용 가능한 도구
model: 실행 모델 (opus, sonnet, haiku)
```

### 3. 출력 형식

```markdown
## 사용 가능한 에이전트

| Name | Description | Tools | Model |
|------|-------------|-------|-------|
| planner | 워크플로우 설계 | Read, Glob, Grep | opus |
| implementer | 새 기능 구현 | Read, Write, Edit, Bash, Grep, Glob | sonnet |
| reviewer | 코드 품질 검토 | Read, Glob, Grep | sonnet |
| ... | ... | ... | ... |
```

## 에이전트 카테고리

### Core
- `planner`: 워크플로우 설계
- `explorer`: 코드베이스 탐색

### Code
- `implementer`: 새 기능 구현
- `reviewer`: 코드 품질 검토
- `debugger`: 버그 분석 및 수정
- `refactorer`: 코드 리팩토링

### Test
- `test-writer`: 테스트 작성
- `test-runner`: 테스트 실행
- `coverage-analyzer`: 커버리지 분석

### Security
- `security-auditor`: 보안 취약점 검토
- `secret-scanner`: 시크릿 노출 검사
- `dependency-checker`: 의존성 취약점 검사

### DB
- `schema-designer`: 스키마 설계
- `query-writer`: 쿼리 작성
- `migration-helper`: 마이그레이션 지원

### Docs
- `doc-writer`: 문서 작성
- `api-documenter`: API 문서화
- `doc-validator`: 문서 검증

### Integration
- `commit-helper`: Git 커밋 자동화
- `pr-helper`: PR 생성 및 관리

### DevOps
- `ci-helper`: CI/CD 파이프라인 지원
- `docker-helper`: Docker 설정 지원
- `deploy-checker`: 배포 전 검증

## 주의사항

- 에이전트 목록은 동적으로 변경될 수 있음
- 항상 Glob으로 최신 목록 조회
- 하드코딩된 에이전트 목록 사용 금지
