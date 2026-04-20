# Obora Operator Guide

Updated: 2026-04-18

이 문서는 현재 obora-kit을 "운영자 관점"에서 빠르게 쓰기 위한 짧은 가이드입니다.
상세 기능 인벤토리는 `docs/current-capabilities.md`, 지원/비지원 범위 구분은 `docs/support-scope.md`를 참고하고, 이 문서는 실제 운영 흐름만 남깁니다.

---

## 1. 가장 먼저 쓰는 흐름

새 프로젝트를 바로 실행 가능한 상태까지 가져가는 최소 경로:

```bash
obora quickstart my-project
cd my-project
obora doctor
obora validate judge.yaml
obora judge --dry-run
obora judge
```

각 명령의 역할:

- `quickstart`
  - 최소 judge-mode 프로젝트 생성
- `doctor`
  - config/auth/provider/model readiness 확인
- `validate judge.yaml`
  - one-file workflow shape/field 검증
- `judge --dry-run`
  - 실행 직전 preview
- `judge`
  - 실제 실행

---

## 2. 실무에서 자주 쓰는 명령 묶음

### 2.1 준비 상태 확인

```bash
obora doctor
obora models openai
obora auth list
```

언제 쓰나:

- 왜 실행이 안 되는지 볼 때
- 어떤 provider/model ref를 써야 하는지 확인할 때
- 저장된 auth 상태를 확인할 때

### 2.2 workflow 파일 점검

```bash
obora validate workflow.yaml
obora expand --json -- workflow.yaml
obora --json run workflow.yaml --dry-run --dump-expanded-workflow --show-stop-semantics
```

언제 쓰나:

- 파일 구조가 맞는지 먼저 보고 싶을 때
- one-file workflow가 내부적으로 어떻게 확장되는지 확인할 때
- 실행 직전 resolved preview를 보고 싶을 때

### 2.3 실제 실행

```bash
obora run workflow.yaml
obora judge
obora test workflow.yaml
```

언제 쓰나:

- 일반 workflow 실행
- judge-mode 짧은 평가 실행
- workflow test surface 실행

---

## 3. 운영 중 보는 명령

### 3.1 전체 상태 보기

```bash
obora status
```

보는 것:

- persisted runs 요약
- 최근 실행 상태
- DLQ 요약

### 3.2 실행 이력 보기

```bash
obora runs list
obora runs list --status failed
obora inspect <runId>
```

보는 것:

- 최근 실행 목록
- 실패/중단 실행 필터
- 특정 실행 상세

### 3.3 중단 실행 이어서 처리

```bash
obora resume <runId>
```

언제 쓰나:

- suspended run을 재개할 때

### 3.4 DLQ 처리

```bash
obora dlq list
obora dlq inspect <entryId>
obora dlq summary
obora dlq resolve <entryId> --status reviewed --actor cto --note "checked"
```

언제 쓰나:

- unrecoverable failure를 triage할 때
- 수동 검토 완료 상태를 기록할 때

### 3.5 artifact / audit 확인

```bash
obora artifact list <runId>
obora artifact get <runId> <artifactName> --output ./artifact.out
obora audit query <runId>
obora audit tail <runId>
```

언제 쓰나:

- 결과 산출물 파일을 확인/다운로드할 때
- 실행 timeline, event, step 흐름을 볼 때

---

## 4. 운영자 기준 추천 순서

문제가 생겼을 때는 아래 순서가 가장 안전합니다.

### A. 실행 전 문제

```bash
obora doctor
obora validate workflow.yaml
obora run workflow.yaml --dry-run
```

### B. 실행 후 상태 확인

```bash
obora status
obora runs list
obora inspect <runId>
```

### C. 실패 triage

```bash
obora dlq list
obora dlq inspect <entryId>
obora audit query <runId>
```

### D. 중단 실행 재개

```bash
obora resume <runId>
```

---

## 5. 지금 live가 아닌 것

아래는 현재 top-level live operator command로 보지 않습니다.

- `obora new`
- `obora done`
- `obora skills`
- `obora dashboard`

의미:

- 문서/코드 흔적이 있어도 현재 운영 명령으로 간주하지 않음
- `dashboard`는 package capability는 있으나 live CLI surface는 아님
- `agents`는 이제 read-only `list/show`만 live이고 mutation은 아직 defer 상태임

관련 문서:

- `docs/current-capabilities.md`
- `docs/deferred-surface-revival-criteria.md`
- `docs/legacy-cli-surface-audit.md`

---

## 6. 운영자용 짧은 치트시트

### 프로젝트 시작

```bash
obora quickstart demo
cd demo
obora doctor
obora validate judge.yaml
obora judge --dry-run
obora judge
```

### 일반 workflow 점검/실행

```bash
obora validate workflow.yaml
obora expand --json -- workflow.yaml
obora run workflow.yaml --dry-run
obora run workflow.yaml
```

### 운영 확인

```bash
obora status
obora runs list
obora inspect <runId>
obora dlq list
obora audit query <runId>
```

### 복구/후처리

```bash
obora resume <runId>
obora artifact list <runId>
obora artifact get <runId> <artifactName> --output ./artifact.out
obora dlq resolve <entryId> --status reviewed --actor cto --note "checked"
```
