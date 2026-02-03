# Status YAML Specification

> 버전: v3
> 패키지: @obora/core (status-tracker)

---

## 개요

`status.yaml`은 각 피처의 워크플로우 실행 상태를 추적하는 파일입니다.

### 파일 위치

```
.obora/features/<feature-name>/status.yaml
```

### 역할

- 현재 실행 상태 추적
- 단계별 진행 상황 기록
- 실행 이력 관리
- 복구 및 재개 지원

---

## 전체 스키마

```yaml
# 메타데이터
version: "1.0"                    # 필수: 스키마 버전
feature_id: <string>              # 필수: 피처 이름
workflow: <string>                # 필수: 사용 중인 워크플로우

# 실행 상태
run_id: <string>                  # 선택: 현재 실행 ID (없으면 미실행)
status: <status-enum>             # 필수: 전체 상태
current_step: <string>            # 선택: 현재 실행 중인 단계

# 타임스탬프
created_at: <datetime>            # 필수: 피처 생성 시간
started_at: <datetime>            # 선택: 실행 시작 시간
completed_at: <datetime>          # 선택: 완료 시간
updated_at: <datetime>            # 필수: 마지막 업데이트

# 단계별 상태
steps:
  - name: <string>                # 필수: 단계 이름
    status: <step-status-enum>    # 필수: 단계 상태
    started_at: <datetime>        # 선택: 시작 시간
    completed_at: <datetime>      # 선택: 완료 시간
    duration_ms: <number>         # 선택: 소요 시간 (ms)
    retry_count: <number>         # 선택: 재시도 횟수
    error: <string>               # 선택: 에러 메시지
    output_file: <string>         # 선택: 출력 파일 경로

# 실행 이력
history:
  - timestamp: <datetime>         # 필수: 이벤트 시간
    event: <event-enum>           # 필수: 이벤트 유형
    step: <string>                # 선택: 관련 단계
    details: <object>             # 선택: 추가 정보
```

---

## 타입 정의

### status (전체 상태)

| 값 | 설명 |
|------|------|
| `pending` | 생성됨, 실행 전 |
| `running` | 실행 중 |
| `completed` | 성공적으로 완료 |
| `failed` | 실패 (재시도 소진) |
| `blocked` | 외부 요인으로 차단 |
| `paused` | 일시 정지 (resume 가능) |
| `cancelled` | 사용자에 의해 취소 |

### step-status (단계 상태)

| 값 | 설명 |
|------|------|
| `pending` | 대기 중 |
| `running` | 실행 중 |
| `completed` | 완료 |
| `failed` | 실패 |
| `skipped` | 건너뜀 (optional 또는 조건부) |
| `waiting` | 승인 대기 (gated) |

### event (이벤트 유형)

| 값 | 설명 |
|------|------|
| `feature_created` | 피처 생성 |
| `workflow_started` | 워크플로우 시작 |
| `workflow_completed` | 워크플로우 완료 |
| `workflow_failed` | 워크플로우 실패 |
| `workflow_paused` | 워크플로우 일시 정지 |
| `workflow_resumed` | 워크플로우 재개 |
| `workflow_cancelled` | 워크플로우 취소 |
| `step_started` | 단계 시작 |
| `step_completed` | 단계 완료 |
| `step_failed` | 단계 실패 |
| `step_skipped` | 단계 건너뜀 |
| `step_retry` | 단계 재시도 |
| `gate_waiting` | 승인 대기 시작 |
| `gate_approved` | 승인됨 |
| `gate_rejected` | 거부됨 |

### datetime

ISO 8601 형식의 타임스탬프입니다.

```yaml
# 형식
created_at: "2026-02-03T16:30:00+09:00"

# 또는 UTC
created_at: "2026-02-03T07:30:00Z"
```

---

## 필수/선택 필드

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `version` | string | ✅ | "1.0" | 스키마 버전 |
| `feature_id` | string | ✅ | - | 피처 이름 |
| `workflow` | string | ✅ | - | 워크플로우 이름 |
| `run_id` | string | ⬜ | - | 실행 ID |
| `status` | enum | ✅ | "pending" | 전체 상태 |
| `current_step` | string | ⬜ | - | 현재 단계 |
| `created_at` | datetime | ✅ | - | 생성 시간 |
| `started_at` | datetime | ⬜ | - | 시작 시간 |
| `completed_at` | datetime | ⬜ | - | 완료 시간 |
| `updated_at` | datetime | ✅ | - | 업데이트 시간 |
| `steps` | array | ✅ | [] | 단계 목록 |
| `history` | array | ⬜ | [] | 이벤트 이력 |

---

## 예시

### 초기 상태 (obora new 직후)

```yaml
version: "1.0"
feature_id: user-auth
workflow: simple
status: pending
created_at: "2026-02-03T16:30:00+09:00"
updated_at: "2026-02-03T16:30:00+09:00"
steps:
  - name: design
    status: pending
  - name: implement
    status: pending
  - name: test
    status: pending
history:
  - timestamp: "2026-02-03T16:30:00+09:00"
    event: feature_created
    details:
      workflow: simple
      created_by: cli
```

### 실행 중 상태

```yaml
version: "1.0"
feature_id: user-auth
workflow: simple
run_id: "run-2026-02-03-001"
status: running
current_step: implement
created_at: "2026-02-03T16:30:00+09:00"
started_at: "2026-02-03T16:35:00+09:00"
updated_at: "2026-02-03T16:42:30+09:00"
steps:
  - name: design
    status: completed
    started_at: "2026-02-03T16:35:00+09:00"
    completed_at: "2026-02-03T16:37:30+09:00"
    duration_ms: 150000
    output_file: context/design-output.md
  - name: implement
    status: running
    started_at: "2026-02-03T16:37:30+09:00"
    retry_count: 0
  - name: test
    status: pending
history:
  - timestamp: "2026-02-03T16:30:00+09:00"
    event: feature_created
  - timestamp: "2026-02-03T16:35:00+09:00"
    event: workflow_started
    details:
      run_id: "run-2026-02-03-001"
      mode: auto
  - timestamp: "2026-02-03T16:35:00+09:00"
    event: step_started
    step: design
  - timestamp: "2026-02-03T16:37:30+09:00"
    event: step_completed
    step: design
    details:
      duration_ms: 150000
  - timestamp: "2026-02-03T16:37:30+09:00"
    event: step_started
    step: implement
```

### 실패 상태

```yaml
version: "1.0"
feature_id: user-auth
workflow: simple
run_id: "run-2026-02-03-001"
status: failed
current_step: implement
created_at: "2026-02-03T16:30:00+09:00"
started_at: "2026-02-03T16:35:00+09:00"
updated_at: "2026-02-03T16:50:00+09:00"
steps:
  - name: design
    status: completed
    started_at: "2026-02-03T16:35:00+09:00"
    completed_at: "2026-02-03T16:37:30+09:00"
    duration_ms: 150000
    output_file: context/design-output.md
  - name: implement
    status: failed
    started_at: "2026-02-03T16:37:30+09:00"
    completed_at: "2026-02-03T16:50:00+09:00"
    retry_count: 3
    error: "E4001: Agent timeout after 3 retries"
  - name: test
    status: pending
history:
  - timestamp: "2026-02-03T16:37:30+09:00"
    event: step_started
    step: implement
  - timestamp: "2026-02-03T16:42:00+09:00"
    event: step_retry
    step: implement
    details:
      attempt: 1
      reason: timeout
  - timestamp: "2026-02-03T16:46:00+09:00"
    event: step_retry
    step: implement
    details:
      attempt: 2
      reason: timeout
  - timestamp: "2026-02-03T16:50:00+09:00"
    event: step_failed
    step: implement
    details:
      error: "E4001: Agent timeout after 3 retries"
  - timestamp: "2026-02-03T16:50:00+09:00"
    event: workflow_failed
    details:
      failed_step: implement
```

### 완료 상태

```yaml
version: "1.0"
feature_id: user-auth
workflow: simple
run_id: "run-2026-02-03-001"
status: completed
created_at: "2026-02-03T16:30:00+09:00"
started_at: "2026-02-03T16:35:00+09:00"
completed_at: "2026-02-03T17:00:00+09:00"
updated_at: "2026-02-03T17:00:00+09:00"
steps:
  - name: design
    status: completed
    started_at: "2026-02-03T16:35:00+09:00"
    completed_at: "2026-02-03T16:37:30+09:00"
    duration_ms: 150000
    output_file: context/design-output.md
  - name: implement
    status: completed
    started_at: "2026-02-03T16:37:30+09:00"
    completed_at: "2026-02-03T16:50:00+09:00"
    duration_ms: 750000
    output_file: context/implement-output.md
  - name: test
    status: completed
    started_at: "2026-02-03T16:50:00+09:00"
    completed_at: "2026-02-03T17:00:00+09:00"
    duration_ms: 600000
    output_file: context/test-output.md
history:
  - timestamp: "2026-02-03T17:00:00+09:00"
    event: step_completed
    step: test
  - timestamp: "2026-02-03T17:00:00+09:00"
    event: workflow_completed
    details:
      total_duration_ms: 1500000
      steps_count: 3
```

---

## TypeScript 타입 정의

```typescript
/** 전체 상태 */
type WorkflowStatus = 
  | 'pending' 
  | 'running' 
  | 'completed' 
  | 'failed' 
  | 'blocked' 
  | 'paused' 
  | 'cancelled';

/** 단계 상태 */
type StepStatus = 
  | 'pending' 
  | 'running' 
  | 'completed' 
  | 'failed' 
  | 'skipped' 
  | 'waiting';

/** 이벤트 유형 */
type EventType =
  | 'feature_created'
  | 'workflow_started'
  | 'workflow_completed'
  | 'workflow_failed'
  | 'workflow_paused'
  | 'workflow_resumed'
  | 'workflow_cancelled'
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'step_skipped'
  | 'step_retry'
  | 'gate_waiting'
  | 'gate_approved'
  | 'gate_rejected';

/** 단계 상태 정보 */
interface StepState {
  name: string;
  status: StepStatus;
  started_at?: string;      // ISO 8601
  completed_at?: string;    // ISO 8601
  duration_ms?: number;
  retry_count?: number;
  error?: string;
  output_file?: string;
}

/** 이벤트 기록 */
interface HistoryEvent {
  timestamp: string;        // ISO 8601
  event: EventType;
  step?: string;
  details?: Record<string, unknown>;
}

/** status.yaml 전체 스키마 */
interface StatusYaml {
  version: '1.0';
  feature_id: string;
  workflow: string;
  run_id?: string;
  status: WorkflowStatus;
  current_step?: string;
  created_at: string;       // ISO 8601
  started_at?: string;      // ISO 8601
  completed_at?: string;    // ISO 8601
  updated_at: string;       // ISO 8601
  steps: StepState[];
  history?: HistoryEvent[];
}
```

---

## JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://obora.dev/schemas/status.yaml.json",
  "title": "Obora Status YAML",
  "type": "object",
  "required": ["version", "feature_id", "workflow", "status", "created_at", "updated_at", "steps"],
  "properties": {
    "version": {
      "type": "string",
      "const": "1.0"
    },
    "feature_id": {
      "type": "string",
      "pattern": "^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$"
    },
    "workflow": {
      "type": "string"
    },
    "run_id": {
      "type": "string"
    },
    "status": {
      "type": "string",
      "enum": ["pending", "running", "completed", "failed", "blocked", "paused", "cancelled"]
    },
    "current_step": {
      "type": "string"
    },
    "created_at": {
      "type": "string",
      "format": "date-time"
    },
    "started_at": {
      "type": "string",
      "format": "date-time"
    },
    "completed_at": {
      "type": "string",
      "format": "date-time"
    },
    "updated_at": {
      "type": "string",
      "format": "date-time"
    },
    "steps": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "status"],
        "properties": {
          "name": { "type": "string" },
          "status": {
            "type": "string",
            "enum": ["pending", "running", "completed", "failed", "skipped", "waiting"]
          },
          "started_at": { "type": "string", "format": "date-time" },
          "completed_at": { "type": "string", "format": "date-time" },
          "duration_ms": { "type": "number", "minimum": 0 },
          "retry_count": { "type": "integer", "minimum": 0 },
          "error": { "type": "string" },
          "output_file": { "type": "string" }
        }
      }
    },
    "history": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["timestamp", "event"],
        "properties": {
          "timestamp": { "type": "string", "format": "date-time" },
          "event": {
            "type": "string",
            "enum": [
              "feature_created", "workflow_started", "workflow_completed",
              "workflow_failed", "workflow_paused", "workflow_resumed",
              "workflow_cancelled", "step_started", "step_completed",
              "step_failed", "step_skipped", "step_retry",
              "gate_waiting", "gate_approved", "gate_rejected"
            ]
          },
          "step": { "type": "string" },
          "details": { "type": "object" }
        }
      }
    }
  }
}
```

---

## 관련 문서

- [[03-workflow-yaml.md]] - 워크플로우 정의
- [[04-folder-structure.md]] - 폴더 구조
- [[07-database-schema.md]] - DuckDB 스키마
- [[10-error-codes.md]] - 에러 코드

---

*마지막 수정: 2026-02-03*
