# Folder Structure Specification

> 버전: v3
> 패키지: @obora/core

---

## 개요

obora-kit은 `.obora/` 폴더에 모든 설정과 데이터를 저장합니다.

### 설계 원칙

| 원칙 | 적용 |
|------|------|
| **SSOT** | 파일(정의) + DB(기록) 분리 |
| **Traceable** | 모든 작업 기록 보존 |
| **Brownfield** | 기존 프로젝트에 영향 최소화 |

---

## .obora/ 전체 구조

```
.obora/
├── config.yaml              # 전역 설정
├── obora.db                 # DuckDB (실행 기록)
├── workflows/               # 워크플로우 정의
│   ├── simple.yaml
│   ├── standard.yaml
│   ├── review.yaml
│   ├── bugfix.yaml
│   └── custom/              # 커스텀 워크플로우
│       └── my-workflow.yaml
├── agents/                  # 에이전트 정의
│   ├── architect.md
│   ├── developer.md
│   ├── tester.md
│   ├── reviewer.md
│   └── custom/              # 커스텀 에이전트
│       └── my-agent.md
├── features/                # 진행 중인 기능
│   └── <feature-name>/
│       ├── proposal.md
│       ├── design.md
│       ├── tasks.md
│       └── context/
│           ├── design-output.md
│           └── implement-output.md
├── archive/                 # 완료된 기능
│   └── <YYYY-MM>-<feature-name>/
│       ├── proposal.md
│       ├── design.md
│       ├── context/
│       └── execution.log
├── locks/                   # 락 파일
│   └── <feature>.lock
├── snapshots/               # 스냅샷 (복구용)
│   └── <run-id>/
│       ├── state.json
│       └── context/
└── templates/               # 템플릿
    ├── proposal.md
    └── design.md
```

---

## 폴더별 상세

### config.yaml

전역 설정 파일입니다.

```yaml
# .obora/config.yaml
version: "3"

# 기본 워크플로우
default_workflow: simple

# 스펙 검증 설정
spec_first:
  required:
    - proposal.md
    - design.md
  on_missing: block    # block | warn | allow

# 동시성 제어
concurrency:
  feature_lock: true
  lock_timeout: 30s
  on_conflict: error   # error | wait
  max_wait: 300s

# 알림 설정
notifications:
  enabled: true
  channels:
    telegram:
      chat_id: "7986044327"
      on_failure: true
      on_success: false

# OpenClaw 연동
openclaw:
  default_model: "zai/glm-4.7"
  timeout: 300000      # 5분
```

---

## features/ 상세

진행 중인 기능 작업 폴더입니다.

### 구조

```
.obora/features/<feature-name>/
├── proposal.md          # 기획서 (필수)
├── design.md            # 설계서 (필수)
├── tasks.md             # 작업 목록 (선택)
├── notes.md             # 메모 (선택)
└── context/             # 에이전트 출력 (자동 생성)
    ├── design-output.md
    ├── implement-output.md
    └── test-output.md
```

### 파일 설명

| 파일 | 필수 | 설명 | 생성 시점 |
|------|------|------|----------|
| `proposal.md` | ✅ | 기획서, 변경사항 제안 | `obora new` |
| `design.md` | ✅ | 기술 설계서 | `obora new` |
| `tasks.md` | ⬜ | 작업 목록 | `obora plan` |
| `notes.md` | ⬜ | 자유 형식 메모 | 수동 |
| `context/` | ⬜ | 에이전트 출력물 | `obora run` |

### proposal.md 템플릿

```markdown
# Feature: <feature-name>

## 개요
<!-- 이 기능이 무엇인지 한 줄로 설명 -->

## 배경
<!-- 왜 이 기능이 필요한지 -->

## 목표
<!-- 이 기능으로 달성하려는 것 -->

## 범위
### 포함
- 

### 제외
- 

## 성공 기준
- 
```

### design.md 템플릿

```markdown
# Design: <feature-name>

## 아키텍처
<!-- 전체 구조 설명 -->

## 컴포넌트
<!-- 주요 컴포넌트 설명 -->

## 데이터 흐름
<!-- 데이터가 어떻게 흐르는지 -->

## API
<!-- API 설계 (해당시) -->

## 엣지 케이스
<!-- 고려해야 할 엣지 케이스 -->

## 의존성
<!-- 외부 의존성 -->
```

### context/ 폴더

에이전트가 생성한 출력물이 저장됩니다.

```
context/
├── design-output.md       # architect 에이전트 출력
├── implement-output.md    # developer 에이전트 출력
├── test-output.md         # tester 에이전트 출력
└── review-output.md       # reviewer 에이전트 출력
```

**파일 이름 규칙:**
- `<step-name>-output.md`
- 워크플로우 step 이름과 매칭

---

## archive/ 상세

완료된 기능이 아카이브됩니다.

### 구조

```
.obora/archive/<YYYY-MM>-<feature-name>/
├── proposal.md          # 기획서
├── design.md            # 설계서
├── tasks.md             # 작업 목록 (있는 경우)
├── context/             # 에이전트 출력물
│   ├── design-output.md
│   ├── implement-output.md
│   └── test-output.md
└── execution.log        # 실행 요약
```

### 명명 규칙

```
<YYYY-MM>-<feature-name>

예시:
- 2026-02-user-auth
- 2026-02-login-feature
- 2026-01-dark-mode
```

### execution.log 형식

```
# Execution Log: user-auth
# Generated: 2026-02-03T18:30:00+09:00

## Summary
- Workflow: standard
- Mode: gated
- Started: 2026-02-03T16:30:00+09:00
- Completed: 2026-02-03T18:30:00+09:00
- Duration: 2h 0m
- Status: success

## Steps
| Step | Agent | Status | Duration | Retries |
|------|-------|--------|----------|---------|
| design | architect | success | 15m | 0 |
| implement | developer | success | 1h 20m | 1 |
| test | tester | success | 20m | 0 |
| review | reviewer | success | 5m | 0 |

## Metrics
- Total retries: 1
- Gate approvals: 1

## Files
- proposal.md (1.2KB)
- design.md (2.5KB)
- context/design-output.md (3.1KB)
- context/implement-output.md (15.2KB)
- context/test-output.md (2.8KB)
- context/review-output.md (1.5KB)
```

---

## workflows/ 상세

워크플로우 정의 파일이 저장됩니다.

### 구조

```
.obora/workflows/
├── simple.yaml          # 내장: 3단계 기본
├── standard.yaml        # 내장: 4단계 표준
├── review.yaml          # 내장: 코드 리뷰 중심
├── bugfix.yaml          # 내장: 버그 수정용
└── custom/              # 커스텀 워크플로우
    └── my-workflow.yaml
```

### 내장 워크플로우

| 파일 | 단계 수 | 설명 |
|------|---------|------|
| `simple.yaml` | 3 | 설계 → 구현 → 테스트 |
| `standard.yaml` | 4 | 설계 → 구현 → 테스트 → 리뷰 |
| `review.yaml` | 2 | 구현 → 리뷰 (설계 건너뛰기) |
| `bugfix.yaml` | 3 | 분석 → 수정 → 검증 |

### 커스텀 워크플로우 추가

```bash
# 직접 생성
vim .obora/workflows/custom/my-workflow.yaml

# 또는 명령어로 생성 (Full 버전)
obora workflow create my-workflow
```

---

## agents/ 상세

에이전트 정의 파일이 저장됩니다.

### 구조

```
.obora/agents/
├── architect.md         # 내장: 아키텍처 설계
├── developer.md         # 내장: 코드 구현
├── tester.md            # 내장: 테스트 및 검증
├── reviewer.md          # 내장: 코드 리뷰
├── general.md           # 내장: 범용 작업
└── custom/              # 커스텀 에이전트
    └── my-agent.md
```

### 내장 에이전트

| 파일 | ID | 역할 |
|------|-----|------|
| `architect.md` | architect | 아키텍처 설계 |
| `developer.md` | developer | 코드 구현 |
| `tester.md` | tester | 테스트 및 검증 |
| `reviewer.md` | reviewer | 코드 리뷰 |
| `general.md` | general | 범용 작업 |

### 커스텀 에이전트 추가

```bash
# 직접 생성
vim .obora/agents/custom/frontend-dev.md

# 또는 명령어로 생성 (Full 버전)
obora agent create frontend-dev
```

---

## locks/ 상세

동시성 제어를 위한 락 파일입니다.

### 구조

```
.obora/locks/
└── <feature>.lock
```

### 락 파일 형식

```json
{
  "feature": "user-auth",
  "run_id": "abc123",
  "pid": 12345,
  "started_at": "2026-02-03T17:00:00+09:00",
  "hostname": "dev-machine"
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `feature` | string | 기능 이름 |
| `run_id` | string | 실행 ID |
| `pid` | number | 프로세스 ID |
| `started_at` | ISO8601 | 시작 시간 |
| `hostname` | string | 호스트 이름 |

---

## snapshots/ 상세

복구를 위한 스냅샷이 저장됩니다.

### 구조

```
.obora/snapshots/<run-id>/
├── state.json           # 상태 정보
└── context/             # 컨텍스트 복사본
    ├── design-output.md
    └── implement-output.md
```

### state.json 형식

```json
{
  "run_id": "abc123",
  "feature": "user-auth",
  "workflow": "standard",
  "current_step": "implement",
  "step_index": 1,
  "completed_steps": ["design"],
  "pending_steps": ["test", "review"],
  "created_at": "2026-02-03T17:30:00+09:00"
}
```

---

## 마이그레이션 정책

### features → archive 이동

`obora done` 실행 시:

1. 워크플로우 완료 확인
2. 폴더 이름에 날짜 접두사 추가
3. `features/` → `archive/`로 이동
4. `execution.log` 생성
5. DuckDB 기록 업데이트

```bash
# 이동 전
.obora/features/user-auth/

# 이동 후
.obora/archive/2026-02-user-auth/
```

### 수동 마이그레이션

```bash
# features에서 archive로 수동 이동
obora done --feature user-auth

# 특정 날짜로 아카이브
obora done --feature user-auth --date 2026-01-15
```

---

## Git 관리 범위

### .gitignore 권장 설정

```gitignore
# obora-kit
.obora/obora.db           # DuckDB (실행 기록)
.obora/locks/             # 락 파일
.obora/snapshots/         # 스냅샷

# 선택적 제외
# .obora/features/*/context/   # 에이전트 출력 (큰 경우)
```

### Git 관리 대상

| 폴더/파일 | Git 관리 | 이유 |
|-----------|----------|------|
| `config.yaml` | ✅ | 팀 공유 설정 |
| `workflows/` | ✅ | 워크플로우 정의 |
| `agents/` | ✅ | 에이전트 정의 |
| `features/` | ✅ | 진행 중 작업 |
| `archive/` | ✅ | 완료된 작업 기록 |
| `templates/` | ✅ | 템플릿 |
| `obora.db` | ❌ | 로컬 실행 기록 |
| `locks/` | ❌ | 임시 락 파일 |
| `snapshots/` | ❌ | 복구용 임시 데이터 |

### context/ 관리 전략

```gitignore
# 옵션 1: 모든 context 포함 (기본)
# 에이전트 출력물도 버전 관리

# 옵션 2: context 제외
.obora/features/*/context/
.obora/archive/*/context/

# 옵션 3: 큰 파일만 제외
.obora/**/context/*.log
.obora/**/context/*.tmp
```

---

## Brownfield 적용

기존 프로젝트에 obora-kit을 적용하는 방법입니다.

### Phase 1: 최소 설정

```bash
cd existing-project
obora init --minimal
```

생성되는 구조:
```
.obora/
├── config.yaml
├── obora.db
├── workflows/
│   └── simple.yaml
└── agents/
    └── general.md
```

### Phase 2: 기존 문서 연결

```bash
# 기존 문서를 obora 형식으로 연결
obora import docs/SPEC.md --as proposal
obora import docs/DESIGN.md --as design
```

### Phase 3: 점진적 적용

```bash
# 새 기능부터 obora 사용
obora new new-feature

# 기존 기능은 필요시 마이그레이션
obora migrate old-feature --from docs/old-feature/
```

---

## 엣지 케이스

### 폴더 이름 충돌

```bash
# 동일 이름 기능 생성 시도
obora new user-auth
# ERROR: Feature 'user-auth' already exists

# 해결: 다른 이름 사용
obora new user-auth-v2
```

### 아카이브 이름 충돌

같은 달에 동일 이름 기능 완료 시:

```
.obora/archive/
├── 2026-02-user-auth/       # 첫 번째
└── 2026-02-user-auth-2/     # 두 번째 (자동 suffix)
```

### 대용량 context 파일

```yaml
# config.yaml
archive:
  max_context_size: 10MB    # 초과 시 경고
  compress: true            # 아카이브 시 압축
```

---

## MVP vs Full

### MVP

- [x] 기본 폴더 구조
- [x] config.yaml
- [x] workflows/ (내장만)
- [x] agents/ (내장만)
- [x] features/
- [x] archive/
- [x] obora.db

### Full

- [ ] locks/
- [ ] snapshots/
- [ ] templates/ 커스터마이징
- [ ] 압축 아카이브
- [ ] 대용량 파일 처리

---

*마지막 수정: 2026-02-03*
