# 구조 개선 계획

현재 Agent/Skill/Command 구조의 문제점과 개선 방안을 정리합니다.

## 현재 상태

### 수량

| 유형 | 현재 | 권장 | 비고 |
|------|------|------|------|
| Agent | 30개 | 10-12개 | 60% 축소 |
| Skill | 5개 → 10개 | 10개 | ✅ 확장 완료 |
| Command | 5개 | 5개 | 유지 |
| Rule | 28개 | 20개 | 정리 + obora 분리 |

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

### 5. 네임스페이스 충돌 위험

```yaml
문제:
  - 일반적인 이름 사용 (planner, reviewer, implementer 등)
  - 사용자의 기존 에이전트/스킬과 충돌 가능
  - 다른 프레임워크의 에이전트와 혼동

충돌_가능_이름:
  - planner        # 매우 일반적
  - explorer       # Claude 기본 제공과 유사
  - reviewer       # 일반적
  - implementer    # 일반적
  - debugger       # 일반적
  - test-writer    # 일반적
  - commit-helper  # 일반적

해결:
  - obora- prefix 적용
  - 명확한 네임스페이스 분리
```

---

## 개선 방안

### Phase 0: 네임스페이스 정리 (obora- prefix)

#### 왜 필요한가?

```yaml
문제_시나리오:
  1. 사용자가 이미 "planner" 에이전트를 가지고 있음
  2. obora-kit 설치
  3. 두 개의 planner가 충돌
  4. 예측 불가능한 동작

해결:
  - 모든 obora 에이전트/스킬에 "obora-" prefix 적용
  - 명확한 식별 가능
  - 다른 도구와 공존 가능
```

#### 네이밍 변환 규칙

| 현재 | 변경 후 | 비고 |
|------|---------|------|
| `planner` | `obora-planner` | 핵심 |
| `explorer` | `obora-explorer` | 핵심 |
| `interviewer` | `obora-interviewer` | 핵심 |
| `implementer` | `obora-implementer` | 코드 |
| `reviewer` | `obora-reviewer` | 코드 |
| `debugger` | `obora-debugger` | 코드 |
| `test-writer` | `obora-test-writer` | 테스트 |
| `test-runner` | `obora-test-runner` | 테스트 |
| `commit-helper` | `obora-commit` | 통합 |
| `pr-helper` | `obora-pr` | 통합 |
| `db-helper` | `obora-db` | 인프라 |
| `ops-helper` | `obora-ops` | 인프라 |

#### Skill 네이밍

| 현재 | 변경 후 | 비고 |
|------|---------|------|
| `agent-discovery` | `obora-agent-discovery` | 유지 |
| `claude-management` | 유지 | Claude 전용이므로 |
| `get-date` | `obora-date` | 단순화 |
| `vercel-react-best-practices` | 유지 | Vercel 네임스페이스 |
| `web-design-guidelines` | 유지 | Vercel 네임스페이스 |

#### Command 네이밍

| 현재 | 변경 후 | 비고 |
|------|---------|------|
| `/implement` | `/obora-implement` 또는 `/oi` | 단축키 제공 |
| `/fix` | `/obora-fix` 또는 `/of` | 단축키 제공 |
| `/review` | `/obora-review` 또는 `/or` | 단축키 제공 |
| `/commit` | `/obora-commit` 또는 `/oc` | 단축키 제공 |
| `/interview` | `/obora-interview` | |

#### 예외 사항

```yaml
prefix_불필요:
  - Vercel Skills (이미 네임스페이스 있음)
  - claude-management (Claude 전용)
  - 외부에서 가져온 스킬

prefix_필요:
  - obora-kit 자체 정의 에이전트
  - obora-kit 자체 정의 스킬
  - obora-kit 자체 정의 커맨드
```

### 폴더 구조 vs Prefix 비교

#### 옵션 A: Prefix만 사용 (현재 제안)

```
.claude/agents/
├── core/
│   ├── obora-planner.md     # obora 에이전트
│   ├── my-planner.md        # 사용자 에이전트
│   └── ...
```

**장점**: 기존 구조 유지, 단순
**단점**: 같은 폴더에 혼재, 관리 어려움

#### 옵션 B: obora/ 서브폴더 사용 (권장)

```
.claude/
├── agents/
│   ├── obora/              # obora 전용 폴더
│   │   ├── planner.md
│   │   ├── implementer.md
│   │   └── ...
│   └── custom/             # 사용자 에이전트
│       └── my-agent.md
├── skills/
│   ├── obora/              # obora 전용 폴더
│   │   ├── agent-discovery/
│   │   └── ...
│   └── custom/             # 사용자 스킬
└── commands/
    ├── obora/              # obora 전용 폴더
    │   ├── implement.md
    │   └── ...
    └── custom/             # 사용자 커맨드
```

**장점**:
- 명확한 분리 (obora vs 사용자)
- 관리 용이
- 업데이트 시 충돌 없음
- prefix 없이도 구분 가능

**단점**:
- 기존 구조 변경 필요

#### 옵션 C: obora/ 폴더 + prefix 조합 (최종 권장)

```
.claude/
├── agents/
│   └── obora/
│       ├── obora-planner.md      # prefix 유지 (호출 시 명확)
│       ├── obora-implementer.md
│       └── ...
├── skills/
│   └── obora/
│       ├── obora-agent-discovery/
│       └── ...
└── commands/
    └── obora/
        ├── obora-implement.md    # /obora-implement 또는 /oi
        └── ...
```

**장점**:
- 폴더로 물리적 분리 (관리 용이)
- prefix로 호출 시 명확한 식별
- 사용자 에이전트와 완전 분리
- 업데이트/삭제 용이

**채택**: 옵션 C (폴더 + prefix 조합)

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
name: obora-implement
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

### 역할별 폴더 구조 설계

obora/ 폴더 내부를 **역할/성격별**로 그룹화하여 관리 효율성을 높입니다.

#### 카테고리 분류 기준

```yaml
core/:
  역할: 워크플로우 제어/조정
  특성: 다른 에이전트를 선택하거나 정보를 수집
  실행_순서: 항상 먼저 (선행 단계)
  에이전트:
    - obora-planner: 워크플로우 설계
    - obora-explorer: 코드베이스 탐색
    - obora-interviewer: 요구사항 발견

code/:
  역할: 코드 변경/분석
  특성: 소스 코드를 직접 수정하거나 검토
  실행_순서: 중간 (핵심 작업)
  에이전트:
    - obora-implementer: 새 기능 구현
    - obora-reviewer: 코드 품질 검토
    - obora-debugger: 버그 수정 + 리팩토링

test/:
  역할: 테스트 관련
  특성: 테스트 코드 작성/실행
  실행_순서: 구현 후 (검증 단계)
  에이전트:
    - obora-test-writer: 테스트 코드 작성
    - obora-test-runner: 테스트 실행 + 커버리지

integration/:
  역할: 외부 시스템 연동
  특성: Git, 이슈 트래커 등 외부 도구 조작
  실행_순서: 마지막 (완료 단계)
  에이전트:
    - obora-commit: Git 커밋 생성
    - obora-pr: PR 생성 + 이슈 트래커 연동

infra/:
  역할: 인프라/환경 관련
  특성: DB, CI/CD, 보안 등 인프라 작업
  실행_순서: 상황에 따라
  에이전트:
    - obora-db: DB 스키마/쿼리/마이그레이션
    - obora-ops: CI/CD + Docker + 보안
```

#### 워크플로우와 폴더 매핑

```
┌─────────────────────────────────────────────────────────────────┐
│                        워크플로우 흐름                           │
└─────────────────────────────────────────────────────────────────┘

    ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
    │  core/   │ ──▶ │  code/   │ ──▶ │  test/   │ ──▶ │integration│
    │          │     │          │     │          │     │          │
    │ planner  │     │implement │     │  writer  │     │  commit  │
    │ explorer │     │ reviewer │     │  runner  │     │    pr    │
    │interviewer│    │ debugger │     │          │     │          │
    └──────────┘     └──────────┘     └──────────┘     └──────────┘
         │                │                                  │
         │                │                                  │
         │                ▼                                  │
         │          ┌──────────┐                             │
         └────────▶ │  infra/  │ ◀───────────────────────────┘
                    │          │
                    │    db    │   (상황에 따라 다양한 단계에서 호출)
                    │   ops    │
                    └──────────┘
```

#### 그룹화의 장점

```yaml
검색_용이:
  - 코드 관련 에이전트 → code/ 폴더 확인
  - 테스트 관련 에이전트 → test/ 폴더 확인

워크플로우_이해:
  - core/ → code/ → test/ → integration/ 순서 직관적
  - 각 단계에서 어떤 에이전트를 사용할 수 있는지 명확
  - planner가 워크플로우 설계 시 카테고리별로 선택

유지보수:
  - 관련 에이전트를 함께 수정/검토
  - 카테고리별 일관성 유지 용이

확장성:
  - 새 에이전트 추가 시 적절한 카테고리에 배치
  - 카테고리별 권한/도구 제한 가능

planner_효율:
  - 카테고리별로 에이전트 목록 제공
  - "코드 구현 필요 → code/ 중 선택" 형태로 결정 단순화
```

### Agents (12개, obora/ 폴더 + prefix)

```
.claude/agents/
├── obora/                          # obora 전용 폴더
│   ├── core/                       # 워크플로우 제어
│   │   ├── obora-planner.md        # 워크플로우 설계
│   │   ├── obora-explorer.md       # 코드베이스 탐색
│   │   └── obora-interviewer.md    # 요구사항 발견
│   ├── code/                       # 코드 작업
│   │   ├── obora-implementer.md    # 코드 구현
│   │   ├── obora-reviewer.md       # 코드 리뷰
│   │   └── obora-debugger.md       # 디버깅 + 리팩토링
│   ├── test/                       # 테스트
│   │   ├── obora-test-writer.md    # 테스트 작성
│   │   └── obora-test-runner.md    # 테스트 실행 + 커버리지
│   ├── integration/                # 외부 연동
│   │   ├── obora-commit.md         # Git 커밋
│   │   └── obora-pr.md             # PR + 이슈 트래커
│   └── infra/                      # 인프라
│       ├── obora-db.md             # DB 스키마/쿼리/마이그레이션
│       └── obora-ops.md            # CI/CD + Docker + 보안
└── custom/                         # 사용자 에이전트 (선택)
    └── ...
```

### Skills (10개, obora/ 폴더)

```
.claude/skills/
├── obora/                          # obora 전용 폴더
│   ├── obora-security/             # 보안 점검 체크리스트 ✅ 생성됨
│   ├── obora-docs-guide/           # 문서 작성 가이드 ✅ 생성됨
│   ├── obora-api-docs/             # API 문서화 패턴 ✅ 생성됨
│   ├── obora-typescript/           # TS 패턴/컨벤션 ✅ 생성됨
│   ├── obora-testing/              # 테스트 패턴 ✅ 생성됨
│   ├── obora-agent-discovery/      # 에이전트 탐색 (이동 예정)
│   └── obora-date/                 # 날짜 조회 (이동 예정)
├── claude-management/              # Claude 설정 (외부)
├── vercel-react-best-practices/    # React 최적화 (외부 - Vercel)
└── web-design-guidelines/          # UI 가이드 (외부 - Vercel)
```

#### 생성된 Skill 요약

| 스킬 | 설명 | 적용 시점 |
|------|------|-----------|
| `obora-security` | OWASP Top 10, 코드 보안 패턴 | 코드 리뷰, 보안 감사 시 |
| `obora-docs-guide` | SSOT 원칙, 문서 구조, 중복 방지 | 문서 작성/검토 시 |
| `obora-api-docs` | OpenAPI, TSDoc, REST API 형식 | API 문서화 시 |
| `obora-typescript` | 타입 설계, 에러 처리, 코드 스타일 | TS 코드 작성/리뷰 시 |
| `obora-testing` | 단위/통합/E2E, 모킹, AAA 패턴 | 테스트 작성/리뷰 시 |

### Commands (5개, obora/ 폴더 + prefix + 단축키)

```
.claude/commands/
├── obora/                          # obora 전용 폴더
│   ├── obora-implement.md          # /obora-implement 또는 /oi
│   ├── obora-fix.md                # /obora-fix 또는 /of
│   ├── obora-review.md             # /obora-review 또는 /or
│   ├── obora-commit.md             # /obora-commit 또는 /oc
│   └── obora-interview.md          # /obora-interview
└── custom/                         # 사용자 커맨드 (선택)
    └── ...
```

### 단축키 시스템

```yaml
# settings.json 또는 CLAUDE.md에서 alias 정의
aliases:
  /oi: /obora-implement
  /of: /obora-fix
  /or: /obora-review
  /oc: /obora-commit

# 사용 예시
/oi 로그인 기능 추가    # = /obora-implement 로그인 기능 추가
/oc                     # = /obora-commit
```

---

## 마이그레이션 단계

### Step 0: 네임스페이스 적용 (폴더 + prefix)

```bash
# 1. obora 폴더 생성
mkdir -p .claude/agents/obora/core
mkdir -p .claude/agents/obora/code
mkdir -p .claude/agents/obora/test
mkdir -p .claude/agents/obora/integration
mkdir -p .claude/agents/obora/infra
mkdir -p .claude/skills/obora
mkdir -p .claude/commands/obora

# 2. Agent 이동 + 이름 변경
mv .claude/agents/core/planner.md .claude/agents/obora/core/obora-planner.md
mv .claude/agents/core/explorer.md .claude/agents/obora/core/obora-explorer.md
mv .claude/agents/discovery/interviewer.md .claude/agents/obora/core/obora-interviewer.md
mv .claude/agents/code/implementer.md .claude/agents/obora/code/obora-implementer.md
# ... 모든 에이전트

# 3. 파일 내 name 필드 업데이트
# name: planner → name: obora-planner

# 4. Skill 이동 + 이름 변경 (obora 자체 정의만)
mv .claude/skills/agent-discovery .claude/skills/obora/obora-agent-discovery
mv .claude/skills/get-date .claude/skills/obora/obora-date

# 5. Command 이동 + 이름 변경
mv .claude/commands/implement.md .claude/commands/obora/obora-implement.md
mv .claude/commands/fix.md .claude/commands/obora/obora-fix.md
# ... 모든 커맨드

# 6. 기존 폴더 정리 (이동 후 빈 폴더 삭제)
rm -rf .claude/agents/core .claude/agents/code .claude/agents/discovery ...
```

### Step 1: 즉시 실행 가능

```bash
# 1. 중복 폴더 삭제
rm -rf .claude/agents/obora/

# 2. Command에 name 추가 (각 파일 수정)
# name: obora-implement 형태로
```

### Step 2: Agent 통합 (점진적)

```yaml
우선순위:
  1. db/ 3개 → obora-db 통합
  2. devops/ + security/ → obora-ops 통합
  3. docs/ 4개 → Skill 변환 + obora-doc-writer만 유지
  4. 나머지 통합 (refactorer → obora-debugger에 흡수 등)
```

### Step 3: Skill 확장

```yaml
순서:
  1. docs 에이전트 → obora-docs Skill 변환
  2. 신규 Skill 추가 (obora-typescript 등)
  3. 기존 rules 중 Skill 승격 검토
```

### Step 4: 단축키 설정

```yaml
# CLAUDE.md에 추가
aliases:
  /oi: /obora-implement
  /of: /obora-fix
  /or: /obora-review
  /oc: /obora-commit
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

### Phase 0 (네임스페이스) ✅ 완료

- [x] Agent 파일명에 `obora-` prefix 추가
- [x] Agent 내 `name` 필드 업데이트
- [x] Skill 폴더명에 `obora-` prefix 추가 (자체 정의만)
- [x] Command 파일명에 `obora-` prefix 추가
- [x] 관련 참조 코드 업데이트 (CLAUDE.md, workflow)
- [x] custom/ 폴더 생성 (사용자 에이전트 지원)

### Phase 1 (즉시 정리) ✅ 완료

- [x] 기존 `obora/` 폴더 삭제 (중복)
- [x] Command 파일에 `name` 필드 추가
- [x] 문서 업데이트

### Phase 2 (Agent 통합)

- [ ] `db/` → `obora-db` 통합
- [ ] `devops/` + `security/` → `obora-ops` 통합
- [ ] `docs/` → Skill 변환 + `obora-doc-writer` 유지
- [ ] 기타 통합 (refactorer → obora-debugger 등)

### Phase 3 (Skill 확장) ✅ 완료

- [x] `obora-security` Skill 생성 (보안 점검 체크리스트, OWASP Top 10)
- [x] `obora-docs-guide` Skill 생성 (문서 작성 가이드, SSOT 원칙)
- [x] `obora-api-docs` Skill 생성 (API 문서화 패턴, OpenAPI/TSDoc)
- [x] `obora-typescript` Skill 생성 (TS 패턴, 타입 설계)
- [x] `obora-testing` Skill 생성 (테스트 패턴, AAA/BDD)

---

## 결론

```
핵심 개선:
1. obora/ 폴더 + obora- prefix 조합 (최종 채택)
2. 물리적 분리 (obora vs 사용자/외부)
3. Agent 60% 축소 (30 → 12)
4. Skill 확장 (5 → 10) ✅ 완료
5. Rule 정리 + obora 분리 (28 → 20)
6. 역할 명확화 (Agent=실행, Skill=지식, Rule=자동 제약)
7. 단축키 시스템 (/oi, /of, /or, /oc)

우선순위:
Phase 0 → 완료 (폴더 구조 + 네임스페이스) ✅
Phase 1 → 완료 (중복 제거, 필드 통일) ✅
Phase 2 → 단기 (Agent 통합)
Phase 3 → 완료 (Skill 확장) ✅
Phase 4 → 완료 (Rules 정리) ✅
```

## 네이밍 컨벤션 요약

```yaml
폴더_구조:
  obora_기본:
    .claude/agents/obora/    # obora 에이전트
    .claude/skills/obora/    # obora 스킬
    .claude/commands/obora/  # obora 커맨드
    .claude/rules/obora/     # obora 규칙

  사용자_확장:
    .claude/agents/          # 루트에 직접 추가 가능
    .claude/agents/my-folder/ # 폴더로 그룹화 가능
    .claude/skills/          # 루트에 직접 추가 가능
    .claude/commands/        # 루트에 직접 추가 가능

에이전트_디스커버리:
  검색: ".claude/agents/**/*.md"
  제외: "_shared-principles.md" (공용 원칙)
  결과: obora 에이전트 + 사용자 에이전트 모두 발견

파일_네이밍:
  obora_에이전트: obora-{역할}.md  # prefix로 구분
  사용자_에이전트: {자유}.md        # 자유 네이밍
  Skill: {name}/SKILL.md
  Command: {name}.md
  Rule: {카테고리}/{규칙명}.md

name_필드:
  Agent: name: obora-planner
  Skill: name: obora-agent-discovery
  Command: name: obora-implement

호출:
  Agent: Task(subagent_type="obora-planner")
  Command: /obora-implement 또는 /oi

외부_리소스:
  - 원래 폴더에 유지 (obora/ 밖)
  - 예: vercel-react-best-practices, claude-management
```

## 장점 요약

```yaml
사용자_관점:
  - obora 에이전트와 자신의 에이전트 명확히 구분
  - 업데이트 시 충돌 없음
  - 원하지 않으면 obora/ 폴더만 삭제

유지보수_관점:
  - obora 리소스 일괄 관리 용이
  - 버전 관리 명확
  - 외부 리소스와 분리

확장성:
  - 다른 프레임워크/도구와 공존 가능
  - agent-agnostic 비전과 일치
```

---

## Rules 관리

### Rule vs Skill 구분

```yaml
Rule:
  정의: 파일 패턴에 따라 **자동으로** 적용되는 제약/가이드라인
  특징:
    - paths/globs로 대상 파일 지정
    - 수동 호출 불가
    - 항상 백그라운드에서 적용
    - 짧고 간결한 원칙
  예시:
    - "모든 *.ts 파일에서 any 사용 금지"
    - ".claude/agents/**에서 다른 에이전트 참조 금지"

Skill:
  정의: 명시적으로 또는 상황에 따라 **선택적으로** 적용되는 지식
  특징:
    - user-invocable: true로 슬래시 명령어 가능
    - 에이전트에 skills: 필드로 주입 가능
    - 상세한 참조 지식 (체크리스트, 패턴, 예시)
  예시:
    - "OWASP Top 10 보안 체크리스트"
    - "TypeScript 타입 설계 패턴"
```

### 핵심 차이

| 구분 | Rule | Skill |
|------|------|-------|
| 적용 방식 | 자동 (파일 패턴) | 선택적 (호출/주입) |
| 내용 | 짧은 원칙/금지사항 | 상세한 지식/패턴 |
| 호출 | 불가 | `/skill-name` 가능 |
| 주입 | 불가 | `skills:` 필드로 가능 |
| 예시 크기 | 1-2페이지 | 5-10페이지 |

### 현재 Rules 현황

```
.claude/rules/
├── agents/      (1)  obora 전용 - agent-independence
├── api/         (2)  일반 - api-design, database
├── claude/      (2)  Claude 전용 - claude-config, claude-docs
├── codebase/    (16) 일반 - solid, dry, testing, security, ...
├── shared/      (2)  obora 전용 - dynamic-date, no-duplicate-docs
├── web/         (4)  일반 - nextjs, tanstack-query, ...
└── workflow/    (1)  obora 전용 - agent-workflow

총 28개 (obora 전용: 4개, 일반: 24개)
```

### 문제점

```yaml
1_네임스페이스_없음:
  문제: obora rules가 사용자 rules와 같은 위치
  영향: 관리 어려움, 충돌 가능

2_Skill과_중복:
  문제:
    - security.md (Rule) ↔ obora-security (Skill)
    - testing.md (Rule) ↔ obora-testing (Skill)
  영향: 어디를 참조해야 하는지 혼란

3_소유권_혼재:
  obora_전용:
    - agents/agent-independence.md
    - workflow/agent-workflow.md
    - shared/dynamic-date.md
    - shared/no-duplicate-docs.md
  일반_모범사례:
    - codebase/*.md (16개)
    - api/*.md (2개)
    - web/*.md (4개)

4_Frontmatter_불일치:
  - paths vs globs (같은 역할, 다른 이름)
  - description 유무 불일치
```

### 개선 방안

#### 옵션 A: obora/ 서브폴더 분리 (권장)

```
.claude/rules/
├── obora/                          # obora 전용 규칙
│   ├── workflow/
│   │   └── agent-workflow.md       # 워크플로우 규칙
│   ├── agents/
│   │   └── agent-independence.md   # 에이전트 독립성
│   └── shared/
│       ├── dynamic-date.md         # 동적 날짜
│       └── no-duplicate-docs.md    # 중복 문서 금지
│
├── codebase/                       # 일반 코딩 규칙 (유지)
│   ├── solid.md
│   ├── dry-kiss-yagni.md
│   └── ...
├── api/                            # API 규칙 (유지)
├── web/                            # Web 규칙 (유지)
└── claude/                         # Claude 설정 (유지)
```

**장점:**
- 에이전트/스킬과 일관된 구조
- obora 규칙 일괄 관리 가능
- 사용자 규칙과 명확히 분리

#### 옵션 B: Rule → Skill 병합 (중복 제거)

```yaml
병합_대상:
  codebase/security.md → obora-security Skill에 병합
  codebase/testing.md → obora-testing Skill에 병합

Rule_유지 (짧은 원칙만):
  security.md: "민감정보 하드코딩 금지" (1줄)
  testing.md: "AAA 패턴 사용" (1줄)

Skill (상세 지식):
  obora-security: OWASP Top 10 전체, 체크리스트, 패턴
  obora-testing: AAA/BDD 패턴, 모킹, 예시 코드
```

### 권장 구조

```
.claude/rules/
├── obora/                          # obora 전용 규칙 (4개)
│   ├── workflow/
│   │   └── agent-workflow.md
│   ├── agents/
│   │   └── agent-independence.md
│   └── shared/
│       ├── dynamic-date.md
│       └── no-duplicate-docs.md
│
├── codebase/                       # 일반 코딩 규칙 (정리 후 10개)
│   ├── solid.md
│   ├── dry-kiss-yagni.md
│   ├── clean-code.md
│   ├── error-handling.md
│   ├── type-safety.md
│   ├── naming-conventions.md
│   ├── imports.md
│   ├── env-config.md
│   ├── git-conventions.md
│   └── no-hardcode.md
│
├── api/                            # API 규칙 (유지)
│   ├── api-design.md
│   └── database.md
│
├── web/                            # Web 규칙 (유지)
│   ├── nextjs.md
│   ├── tanstack-query.md
│   ├── performance.md
│   └── accessibility.md
│
└── claude/                         # Claude 설정 (유지)
    ├── claude-config.md
    └── claude-docs.md
```

### Rule/Skill 역할 분담

```yaml
Rule_역할 (짧은 원칙):
  - 파일 패턴에 자동 적용
  - 위반 시 즉시 피드백
  - 1-2페이지 이내
  예시:
    - "any 사용 금지"
    - "하드코딩 금지"
    - "AAA 패턴 사용"

Skill_역할 (상세 지식):
  - 필요 시 참조
  - 체크리스트, 패턴, 예시
  - 5-10페이지
  예시:
    - OWASP Top 10 전체 체크리스트
    - TypeScript 타입 설계 패턴
    - 테스트 AAA/BDD 상세 예시

중복_제거:
  security.md (Rule):
    "민감정보 하드코딩 금지, 입력 검증 필수"
  obora-security (Skill):
    "상세한 OWASP Top 10, 코드 패턴, 체크리스트"
    → Rule은 원칙만, Skill은 상세 참조
```

### Rules 체크리스트

#### Phase 4 (Rules 정리) ✅ 완료

- [x] obora/ 서브폴더 생성
- [x] obora 전용 규칙 이동 (4개)
  - [x] agents/agent-independence.md → obora/agents/
  - [x] workflow/agent-workflow.md → obora/workflow/
  - [x] shared/dynamic-date.md → obora/shared/
  - [x] shared/no-duplicate-docs.md → obora/shared/
- [x] codebase/ 정리 (중복 제거)
  - [x] security.md: Skill과 역할 분리 (원칙만 유지)
  - [x] testing.md: Skill과 역할 분리 (원칙만 유지)
- [x] Frontmatter 통일 (globs 사용)
- [x] 기존 폴더 정리 (빈 폴더 삭제)
