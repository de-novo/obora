# CLI Commands Specification

> 버전: v3
> 패키지: @obora/cli

---

## 개요

obora-kit CLI는 워크플로우 기반 개발을 위한 명령어 인터페이스를 제공합니다.

### 명령어 목록

| 명령어 | 설명 | MVP |
|--------|------|-----|
| `obora init` | 프로젝트 초기화 | ✅ |
| `obora new` | 새 기능 폴더 생성 | ✅ |
| `obora plan` | AI로 스펙 생성 | ✅ |
| `obora run` | 워크플로우 실행 | ✅ |
| `obora status` | 실행 상태 확인 | ✅ |
| `obora done` | 완료 및 아카이브 | ✅ |
| `obora validate` | 워크플로우 검증 | ✅ |
| `obora lock clean` | 락 파일 정리 | ⬜ |
| `obora resume` | 중단된 워크플로우 복구 | ⬜ |
| `obora cancel` | 실행 중인 워크플로우 취소 | ⬜ |

---

## obora init

프로젝트에 obora-kit을 초기화합니다.

### 사용법

```bash
obora init [options]
```

### 옵션

| 옵션 | 단축 | 설명 | 기본값 |
|------|------|------|--------|
| `--minimal` | `-m` | 최소 설정으로 초기화 | `false` |
| `--workflow` | `-w` | 기본 워크플로우 선택 | `simple` |
| `--force` | `-f` | 기존 설정 덮어쓰기 | `false` |
| `--help` | `-h` | 도움말 표시 | - |

### 예시

```bash
# 기본 초기화
obora init

# 최소 설정으로 초기화 (Brownfield)
obora init --minimal

# standard 워크플로우로 초기화
obora init --workflow standard

# 기존 설정 덮어쓰기
obora init --force
```

### 동작

1. `.obora/` 폴더 생성
2. 기본 설정 파일 생성 (`config.yaml`)
3. 내장 워크플로우 복사 (`workflows/`)
4. 내장 에이전트 복사 (`agents/`)
5. DuckDB 파일 초기화 (`obora.db`)
6. `.gitignore`에 `obora.db` 추가

### 생성되는 구조

```
.obora/
├── config.yaml          # 전역 설정 (04-folder-structure.md 참조)
├── workflows/           # 워크플로우 정의
│   ├── simple.yaml
│   └── standard.yaml
├── agents/              # 에이전트 정의
│   ├── architect.md
│   ├── developer.md
│   └── tester.md
├── features/            # 진행 중인 기능 (빈 폴더)
├── archive/             # 완료된 기능 (빈 폴더)
└── obora.db             # DuckDB 파일
```

### config.yaml 기본 설정

> 상세 스키마: [[04-folder-structure.md#config.yaml]]

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
```

### 에러 케이스

| 에러 | 원인 | 해결 |
|------|------|------|
| `Already initialized` | `.obora/` 폴더 존재 | `--force` 옵션 사용 |
| `Permission denied` | 쓰기 권한 없음 | 권한 확인 |

### 종료 코드

| 코드 | 의미 |
|------|------|
| 0 | 성공 |
| 1 | 일반 에러 |
| 2 | 이미 초기화됨 |

---

## obora new

새 기능 작업을 위한 폴더를 생성합니다.

### 사용법

```bash
obora new <feature-name> [options]
```

### 인자

| 인자 | 필수 | 설명 |
|------|------|------|
| `feature-name` | ✅ | 기능 이름 (kebab-case 권장) |

### 옵션

| 옵션 | 단축 | 설명 | 기본값 |
|------|------|------|--------|
| `--workflow` | `-w` | 사용할 워크플로우 | `simple` |
| `--from-existing` | - | 기존 문서에서 시작 | `false` |
| `--template` | `-t` | 템플릿 선택 | `default` |
| `--help` | `-h` | 도움말 표시 | - |

### 예시

```bash
# 기본 생성
obora new login-feature

# standard 워크플로우로 생성
obora new user-auth --workflow standard

# 기존 문서 연결 (Brownfield)
obora new feature-x --from-existing
```

### 동작

1. `.obora/features/<feature-name>/` 폴더 생성
2. 템플릿 파일 복사 (`proposal.md`, `design.md`)
3. 워크플로우 참조 설정
4. DuckDB에 이벤트 기록

### 생성되는 구조

```
.obora/features/<feature-name>/
├── proposal.md          # 기획서 템플릿
├── design.md            # 설계서 템플릿
├── tasks.md             # 작업 목록 (선택)
└── context/             # 에이전트 출력 (자동 생성)
```

### 에러 케이스

| 에러 | 원인 | 해결 |
|------|------|------|
| `Feature already exists` | 동일 이름 폴더 존재 | 다른 이름 사용 |
| `Invalid feature name` | 잘못된 문자 포함 | kebab-case 사용 |
| `Not initialized` | `.obora/` 없음 | `obora init` 먼저 실행 |

### 종료 코드

| 코드 | 의미 |
|------|------|
| 0 | 성공 |
| 1 | 일반 에러 |
| 3 | 초기화 필요 |

---

## obora plan

AI를 사용하여 스펙 문서를 생성합니다.

### 사용법

```bash
obora plan [options]
```

### 옵션

| 옵션 | 단축 | 설명 | 기본값 |
|------|------|------|--------|
| `--feature` | `-f` | 대상 기능 이름 | 현재 기능 |
| `--prompt` | `-p` | 추가 컨텍스트 | - |
| `--interactive` | `-i` | 대화형 모드 | `false` |
| `--dry-run` | - | 실제 생성 없이 미리보기 | `false` |
| `--help` | `-h` | 도움말 표시 | - |

### 예시

```bash
# 현재 기능에 대해 스펙 생성
obora plan

# 특정 기능 지정
obora plan --feature login-feature

# 추가 컨텍스트 제공
obora plan --prompt "React + TypeScript 기반 로그인 폼"

# 대화형 모드
obora plan --interactive
```

### 동작

1. 기존 스펙 파일 확인
2. OpenClaw 에이전트 호출 (architect)
3. `proposal.md` 생성/업데이트
4. `design.md` 생성/업데이트
5. `tasks.md` 생성 (선택)

### 에러 케이스

| 에러 | 원인 | 해결 |
|------|------|------|
| `Feature not found` | 기능 폴더 없음 | `obora new` 먼저 실행 |
| `OpenClaw not available` | OpenClaw 연결 실패 | OpenClaw 상태 확인 |

### 종료 코드

| 코드 | 의미 |
|------|------|
| 0 | 성공 |
| 1 | 일반 에러 |
| 4 | OpenClaw 연결 실패 |

---

## obora run

워크플로우를 실행합니다.

### 사용법

```bash
obora run [options]
```

### 옵션

| 옵션 | 단축 | 설명 | 기본값 |
|------|------|------|--------|
| `--feature` | `-f` | 대상 기능 이름 | 현재 기능 |
| `--workflow` | `-w` | 사용할 워크플로우 | 설정값 |
| `--mode` | `-m` | 실행 모드 | `auto` |
| `--step` | `-s` | 특정 단계부터 시작 | 처음 |
| `--dry-run` | - | 실제 실행 없이 계획 확인 | `false` |
| `--verbose` | `-v` | 상세 출력 | `false` |
| `--help` | `-h` | 도움말 표시 | - |

### 모드

| 모드 | 설명 |
|------|------|
| `auto` | 모든 단계 자동 실행 |
| `supervised` | 각 단계 후 승인 요청 |
| `gated` | gate 표시된 단계에서만 승인 |

### 예시

```bash
# 기본 실행
obora run

# 특정 기능 실행
obora run --feature login-feature

# supervised 모드로 실행
obora run --mode supervised

# 특정 단계부터 시작
obora run --step implement

# 실행 계획만 확인
obora run --dry-run
```

### 동작

1. 스펙 검증 (Spec Validator)
2. 워크플로우 파싱 (Workflow Parser)
3. 의존성 분석 (Dependency Resolver)
4. 단계별 실행 (OpenClaw 에이전트)
5. 결과 기록 (Tracker)

### 실행 흐름

```
[obora run]
    ↓
스펙 검증 ─→ 실패 시 중단
    ↓
워크플로우 파싱
    ↓
의존성 분석 ─→ 순환 감지 시 중단
    ↓
┌─────────────────────────┐
│ 단계 실행 루프          │
│   ├─ 에이전트 호출      │
│   ├─ 결과 저장          │
│   ├─ 승인 대기 (모드별) │
│   └─ 다음 단계          │
└─────────────────────────┘
    ↓
완료 기록
```

### 에러 케이스

| 에러 | 원인 | 해결 |
|------|------|------|
| `Spec validation failed` | 필수 스펙 누락 | 스펙 파일 작성 |
| `Circular dependency` | 순환 의존성 | 워크플로우 수정 |
| `Already running` | 동일 기능 실행 중 | `obora status` 확인 |
| `Step failed` | 단계 실행 실패 | 로그 확인, 재시도 |

### 종료 코드

| 코드 | 의미 |
|------|------|
| 0 | 성공 |
| 1 | 일반 에러 |
| 5 | 스펙 검증 실패 |
| 6 | 순환 의존성 |
| 7 | 단계 실행 실패 |

---

## obora status

실행 상태를 확인합니다.

### 사용법

```bash
obora status [options]
```

### 옵션

| 옵션 | 단축 | 설명 | 기본값 |
|------|------|------|--------|
| `--feature` | `-f` | 특정 기능만 표시 | 전체 |
| `--format` | - | 출력 형식 | `default` |
| `--watch` | `-w` | 실시간 갱신 | `false` |
| `--help` | `-h` | 도움말 표시 | - |

### 출력 형식

| 형식 | 설명 |
|------|------|
| `default` | 사람 친화적 출력 |
| `json` | JSON 형식 |
| `minimal` | 한 줄 요약 |

### 예시

```bash
# 전체 상태 확인
obora status

# 특정 기능 상태
obora status --feature login-feature

# JSON 형식 출력
obora status --format json

# 실시간 갱신
obora status --watch
```

### 출력 예시 (default)

```
Feature: user-auth
Status:  running
Started: 2026-02-03 16:30:00
Workflow: standard

Steps:
  ✓ design    (completed, 2m 30s)
  → implement (running, 5m 10s...)
  ○ test      (pending)
  ○ review    (pending)

Progress: 1/4 (25%)
```

### 출력 예시 (json)

```json
{
  "feature": "user-auth",
  "status": "running",
  "started_at": "2026-02-03T16:30:00+09:00",
  "workflow": "standard",
  "current_step": "implement",
  "steps": [
    {"name": "design", "status": "completed", "duration": 150},
    {"name": "implement", "status": "running", "duration": null},
    {"name": "test", "status": "pending"},
    {"name": "review", "status": "pending"}
  ],
  "progress": 0.25
}
```

### 종료 코드

| 코드 | 의미 |
|------|------|
| 0 | 성공 |
| 1 | 일반 에러 |

---

## obora done

기능을 완료하고 아카이브합니다.

### 사용법

```bash
obora done [options]
```

### 옵션

| 옵션 | 단축 | 설명 | 기본값 |
|------|------|------|--------|
| `--feature` | `-f` | 대상 기능 이름 | 현재 기능 |
| `--commit` | `-c` | Git commit 생성 | `true` |
| `--message` | `-m` | 커밋 메시지 | 자동 생성 |
| `--no-archive` | - | 아카이브 건너뛰기 | `false` |
| `--help` | `-h` | 도움말 표시 | - |

### 예시

```bash
# 기본 완료
obora done

# 특정 기능 완료
obora done --feature login-feature

# 커스텀 커밋 메시지
obora done --message "feat: 로그인 기능 완료"

# 아카이브 없이 완료
obora done --no-archive
```

### 동작

1. 워크플로우 완료 확인
2. DuckDB에 완료 기록
3. `features/` → `archive/`로 이동
4. 날짜 접두사 추가 (`YYYY-MM-feature`)
5. `execution.log` 생성 (실행 요약)
6. Git commit 생성 (선택)

### 아카이브 구조

```
.obora/archive/2026-02-user-auth/
├── proposal.md
├── design.md
├── context/
│   ├── design-output.md
│   └── implement-output.md
└── execution.log        # 실행 요약
```

### 에러 케이스

| 에러 | 원인 | 해결 |
|------|------|------|
| `Workflow not completed` | 워크플로우 미완료 | `obora run` 완료 |
| `Feature not found` | 기능 폴더 없음 | 기능 이름 확인 |

### 종료 코드

| 코드 | 의미 |
|------|------|
| 0 | 성공 |
| 1 | 일반 에러 |
| 8 | 워크플로우 미완료 |

---

## obora validate

워크플로우 파일을 검증합니다.

### 사용법

```bash
obora validate [workflow] [options]
```

### 인자

| 인자 | 필수 | 설명 |
|------|------|------|
| `workflow` | ⬜ | 검증할 워크플로우 파일 경로 |

### 옵션

| 옵션 | 단축 | 설명 | 기본값 |
|------|------|------|--------|
| `--format` | - | 출력 형식 | `default` |
| `--verbose` | `-v` | 상세 출력 | `false` |
| `--strict` | - | 엄격 모드 | `false` |
| `--help` | `-h` | 도움말 표시 | - |

### 예시

```bash
# 기본 검증 (모든 워크플로우)
obora validate

# 특정 워크플로우 검증
obora validate workflows/custom.yaml

# JSON 출력 (CI용)
obora validate --format json

# 엄격 모드 (경고도 에러 처리)
obora validate --strict
```

### 검증 항목

1. **YAML 문법**: 파서 에러
2. **스키마 구조**: JSON Schema 검증
3. **순환 의존성**: DFS 알고리즘
4. **에이전트 존재**: Agent Registry 조회
5. **경로 유효성**: 파일 시스템 확인

### 출력 예시 (default)

```
$ obora validate

✗ Validation failed (3 errors)

  ERROR 1: Circular dependency
    File: workflows/feature.yaml
    Cycle: implement → test → review → implement
    Suggestion: Check inputs/outputs references

  ERROR 2: Agent not found
    File: workflows/feature.yaml:15
    Agent: 'frontend-dev'
    Available: architect, developer, tester, reviewer

  WARNING 1: Unreachable step
    File: workflows/feature.yaml:25
    Step: 'optional-review'
    Suggestion: Check dependencies

Run 'obora validate --help' for more options.
```

### 종료 코드

| 코드 | 의미 |
|------|------|
| 0 | 성공 |
| 1 | 검증 실패 |
| 2 | 경고 있음 (--strict 시 실패) |

---

## obora lock clean

락 파일을 정리합니다.

### 사용법

```bash
obora lock clean [options]
```

### 옵션

| 옵션 | 단축 | 설명 | 기본값 |
|------|------|------|--------|
| `--force` | `-f` | 모든 락 강제 정리 | `false` |
| `--feature` | - | 특정 기능 락만 정리 | 전체 |
| `--dry-run` | - | 실제 삭제 없이 확인 | `false` |
| `--help` | `-h` | 도움말 표시 | - |

### 예시

```bash
# stale 락만 정리
obora lock clean

# 모든 락 강제 정리
obora lock clean --force

# 특정 기능 락 정리
obora lock clean --feature login-feature

# 삭제 대상 확인만
obora lock clean --dry-run
```

### Stale Lock 감지 기준

1. `started_at`이 30분 초과
2. 락 파일의 `pid` 프로세스가 존재하지 않음
3. 호스트 이름이 다름 (분산 환경)

### 종료 코드

| 코드 | 의미 |
|------|------|
| 0 | 성공 |
| 1 | 일반 에러 |

---

## 전역 옵션

모든 명령어에 적용되는 옵션입니다.

| 옵션 | 단축 | 설명 |
|------|------|------|
| `--version` | `-V` | 버전 표시 |
| `--help` | `-h` | 도움말 표시 |
| `--config` | `-C` | 설정 파일 경로 |
| `--cwd` | - | 작업 디렉토리 |
| `--quiet` | `-q` | 조용한 모드 |
| `--debug` | `-d` | 디버그 모드 |

---

## 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `OBORA_HOME` | obora 홈 디렉토리 | `.obora/` |
| `OBORA_CONFIG` | 설정 파일 경로 | `.obora/config.yaml` |
| `OBORA_DEBUG` | 디버그 모드 | `false` |
| `OBORA_NO_COLOR` | 색상 출력 비활성화 | `false` |

---

## MVP vs Full 구현

### MVP

- [x] `obora init`
- [x] `obora new`
- [x] `obora plan`
- [x] `obora run` (auto 모드만)
- [x] `obora status`
- [x] `obora done`
- [x] `obora validate` (기본 검증)

### Full

- [ ] `obora run` (supervised, gated 모드)
- [ ] `obora lock clean`
- [ ] `obora resume`
- [ ] `obora cancel`
- [ ] `obora import` (기존 문서 연결)
- [ ] `obora export` (워크플로우 내보내기)
- [ ] `obora metrics` (통계 조회)

---

*마지막 수정: 2026-02-03*
