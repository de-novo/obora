# 구조 개선 계획

현재 Agent/Skill/Command 구조의 문제점과 개선 방안을 정리합니다.

## 현재 상태

### 수량

| 유형 | 현재 | 권장 | 비고 |
|------|------|------|------|
| Agent | 30개 | 10-12개 | 60% 축소 |
| Skill | 5개 | 8-10개 | 확장 |
| Command | 5개 | 5개 | 유지 |

### Agent 카테고리별 현황

```
.claude/agents/
├── core/        (2) planner, explorer
├── code/        (4) debugger, implementer, refactorer, reviewer
├── db/          (3) migration-helper, query-writer, schema-designer
├── devops/      (3) ci-helper, deploy-checker, docker-helper
├── discovery/   (1) interviewer
├── docs/        (4) api-documenter, doc-gc, doc-validator, doc-writer
├── integration/ (4) commit-helper, jira-helper, linear-helper, pr-helper
├── obora/       (2) explorer, planner ← 중복!
├── security/    (3) dependency-checker, secret-scanner, security-auditor
└── test/        (3) coverage-analyzer, test-runner, test-writer
```

---

## 문제점 분석

### 1. 중복 에이전트

```yaml
문제:
  - obora/planner ↔ core/planner (중복)
  - obora/explorer ↔ core/explorer (중복)

원인:
  - obora CLI용 단순화 버전 생성
  - 정리되지 않음

해결:
  - obora/ 폴더 삭제
  - core/만 유지
```

### 2. 과도한 세분화

```yaml
문제:
  - 사용 빈도 낮은 에이전트 다수
  - 유지보수 부담
  - planner 선택 복잡도 증가

예시:
  docs/:
    - api-documenter (API 문서화)
    - doc-gc (문서 정리)
    - doc-validator (문서 검증)
    - doc-writer (문서 작성)
    → 4개 → 1개로 통합 가능?

  security/:
    - dependency-checker
    - secret-scanner
    - security-auditor
    → 3개 → 1개로 통합 가능?
```

### 3. Agent vs Skill 혼동

```yaml
현재_Skill이지만_Agent로_분류:
  - explorer: 정보 조회만 → Skill 성격
  - doc-validator: 검증만 → Skill 성격

현재_Agent이지만_Skill로_변환_가능:
  - 결과물 생성 없는 조회/분석 에이전트
```

### 4. Command 필드 불일치

```yaml
문제:
  - Command에 name 필드 없음
  - Agent는 tools, Command는 allowed-tools

해결:
  - Command에 name 추가
  - 필드명 통일 검토
```

---

## 개선 방안

### Phase 1: 즉시 정리

#### 1.1 중복 제거

```bash
# obora/ 폴더 삭제 (core/와 중복)
rm -rf .claude/agents/obora/
```

#### 1.2 Command에 name 추가

```yaml
# 변경 전
---
description: 새 기능 구현
allowed-tools: Task, Read, Bash
---

# 변경 후
---
name: implement
description: 새 기능 구현
allowed-tools: Task, Read, Bash
---
```

### Phase 2: Agent 통합/축소

#### 권장 구조 (30개 → 12개)

```
.claude/agents/
├── core/           (3) → 유지
│   ├── planner.md
│   ├── explorer.md
│   └── interviewer.md     ← discovery/에서 이동
│
├── code/           (3) → 통합
│   ├── implementer.md     ← 유지 (핵심)
│   ├── reviewer.md        ← 유지 (핵심)
│   └── debugger.md        ← 유지 (refactorer 흡수)
│
├── test/           (2) → 통합
│   ├── test-writer.md     ← 유지
│   └── test-runner.md     ← coverage-analyzer 흡수
│
├── integration/    (2) → 통합
│   ├── commit-helper.md   ← 유지
│   └── pr-helper.md       ← jira/linear 흡수 (옵션)
│
└── infra/          (2) → 신규 (db+devops+security 통합)
    ├── db-helper.md       ← db/ 3개 통합
    └── ops-helper.md      ← devops+security 통합
```

#### 제거/통합 대상

| 현재 | 처리 | 이유 |
|------|------|------|
| `obora/` (2개) | 삭제 | core/와 중복 |
| `refactorer` | debugger에 흡수 | 역할 유사 |
| `coverage-analyzer` | test-runner에 흡수 | 테스트 관련 통합 |
| `jira-helper` | pr-helper에 옵션화 | 선택적 기능 |
| `linear-helper` | pr-helper에 옵션화 | 선택적 기능 |
| `docs/` (4개) | Skill로 변환 | 조회/검증 성격 |
| `db/` (3개) | db-helper로 통합 | 역할 유사 |
| `devops/` (3개) | ops-helper로 통합 | 역할 유사 |
| `security/` (3개) | ops-helper에 통합 | 인프라 관련 |

### Phase 3: Skill 확장

#### docs 에이전트 → Skill 변환

```yaml
현재_Agent:
  - doc-writer
  - doc-validator
  - doc-gc
  - api-documenter

변환_후_Skill:
  - documentation-guide     # 문서 작성 가이드 (지식)
  - api-documentation      # API 문서화 패턴 (지식)

남은_Agent:
  - doc-writer만 유지 (실제 파일 생성)
```

#### 신규 Skill 후보

```yaml
추가_검토:
  - typescript-patterns    # TS 패턴/컨벤션
  - testing-patterns       # 테스트 패턴
  - git-conventions        # Git 규칙 (현재 rules에서 승격)
```

---

## 목표 구조

### Agents (12개)

```
.claude/agents/
├── core/
│   ├── planner.md         # 워크플로우 설계
│   ├── explorer.md        # 코드베이스 탐색
│   └── interviewer.md     # 요구사항 발견
├── code/
│   ├── implementer.md     # 코드 구현
│   ├── reviewer.md        # 코드 리뷰
│   └── debugger.md        # 디버깅 + 리팩토링
├── test/
│   ├── test-writer.md     # 테스트 작성
│   └── test-runner.md     # 테스트 실행 + 커버리지
├── integration/
│   ├── commit-helper.md   # Git 커밋
│   └── pr-helper.md       # PR + 이슈 트래커
└── infra/
    ├── db-helper.md       # DB 스키마/쿼리/마이그레이션
    └── ops-helper.md      # CI/CD + Docker + 보안
```

### Skills (10개)

```
.claude/skills/
├── agent-discovery/            # 에이전트 탐색 (유지)
├── claude-management/          # Claude 설정 (유지)
├── get-date/                   # 날짜 조회 (유지)
├── vercel-react-best-practices/  # React 최적화 (유지)
├── web-design-guidelines/      # UI 가이드 (유지)
├── documentation-guide/        # 문서 작성 가이드 (신규)
├── api-documentation/          # API 문서화 패턴 (신규)
├── typescript-patterns/        # TS 패턴 (신규)
├── testing-patterns/           # 테스트 패턴 (신규)
└── security-checklist/         # 보안 체크리스트 (신규)
```

### Commands (5개, 유지)

```
.claude/commands/
├── implement.md    # 기능 구현
├── fix.md          # 버그 수정
├── review.md       # 코드 리뷰
├── commit.md       # 커밋
└── interview.md    # 인터뷰
```

---

## 마이그레이션 단계

### Step 1: 즉시 실행 가능

```bash
# 1. 중복 폴더 삭제
rm -rf .claude/agents/obora/

# 2. Command에 name 추가 (각 파일 수정)
```

### Step 2: Agent 통합 (점진적)

```yaml
우선순위:
  1. db/ 3개 → db-helper 통합
  2. devops/ + security/ → ops-helper 통합
  3. docs/ 4개 → Skill 변환 + doc-writer만 유지
  4. 나머지 통합 (refactorer, coverage-analyzer 등)
```

### Step 3: Skill 확장

```yaml
순서:
  1. docs 에이전트 → Skill 변환
  2. 신규 Skill 추가 (documentation-guide 등)
  3. 기존 rules 중 Skill 승격 검토
```

---

## 예상 효과

### 정량적

| 지표 | 현재 | 목표 | 개선율 |
|------|------|------|--------|
| Agent 수 | 30 | 12 | -60% |
| 중복 제거 | 2 | 0 | 100% |
| planner 선택 복잡도 | 30개 중 선택 | 12개 중 선택 | -60% |

### 정성적

```yaml
개선_효과:
  - planner 결정 단순화 (선택지 감소)
  - 에이전트 역할 명확화
  - 유지보수 용이
  - Skill 재사용성 향상
  - 신규 프로젝트 적용 용이
```

---

## 체크리스트

### Phase 1 (즉시)

- [ ] `obora/` 폴더 삭제
- [ ] Command 파일에 `name` 필드 추가
- [ ] 문서 업데이트

### Phase 2 (Agent 통합)

- [ ] `db/` → `db-helper` 통합
- [ ] `devops/` + `security/` → `ops-helper` 통합
- [ ] `docs/` → Skill 변환 + `doc-writer` 유지
- [ ] 기타 통합 (refactorer, coverage-analyzer 등)

### Phase 3 (Skill 확장)

- [ ] `documentation-guide` Skill 생성
- [ ] `api-documentation` Skill 생성
- [ ] 추가 Skill 검토 및 생성

---

## 결론

```
핵심 개선:
1. 중복 제거 (obora/ 삭제)
2. Agent 60% 축소 (30 → 12)
3. Skill 확장 (5 → 10)
4. 역할 명확화 (Agent=실행, Skill=지식)

우선순위:
Phase 1 → 즉시 (중복 제거, 필드 통일)
Phase 2 → 단기 (Agent 통합)
Phase 3 → 중기 (Skill 확장)
```
