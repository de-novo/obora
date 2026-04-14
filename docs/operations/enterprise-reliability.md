# Enterprise Reliability Features

> Obora의 완전 무인 운영을 위한 안전장치 가이드

## 개요

Obora SDK는 엔터프라이즈 환경에서 사람 개입 없이 워크플로우를 안전하게 실행하기 위한 7가지 안전장치를 제공합니다. 모든 기능은 **opt-in** 방식으로, `OboraRuntimeConfig` 또는 `obora.config.yaml`에서 활성화합니다.

## 기능 목록

| 기능              | 우선순위 | 목적                        | 상태 |
| ----------------- | -------- | --------------------------- | ---- |
| Auto-Rollback     | P0       | 실행 실패 시 TKG 자동 복원  | ✅   |
| Dead Letter Queue | P0       | 복구 불가 실패 격리         | ✅   |
| Execution Lock    | P0       | 동시 실행 방지              | ✅   |
| Auto-Recovery     | P0       | Checkpoint 기반 자동 재시작 | ✅   |
| Circuit Breaker   | P1       | LLM 장애 격리               | ✅   |
| Health Checker    | P1       | 실행 상태 모니터링          | ✅   |
| Alert Manager     | P1       | 장애 알림 (webhook/console) | ✅   |
| Metrics Export    | P2       | Prometheus/JSON 메트릭      | ✅   |

---

## 1. Auto-Rollback

### 동작 방식

워크플로우 실행이 실패하면 (budget exceeded 제외), SDK가 자동으로 TKG rollback을 호출하여 shared memory를 마지막 성공 상태로 복원합니다.

### 설정

별도 설정 불필요. TKG rollback이 활성화되어 있으면 자동 동작합니다.

```yaml
# obora.config.yaml
tkgProjection:
  rollback:
    enabled: true
    adapter: file
    file:
      basePath: ./data/.obora/tkg-rollback
```

### 이벤트

- 성공: `warning` 이벤트 (`code: TKG_AUTO_ROLLBACK_SUCCESS`)
- 실패: `warning` 이벤트 (`code: TKG_AUTO_ROLLBACK_FAILED`)

---

## 2. Dead Letter Queue (DLQ)

### 동작 방식

복구 불가능한 실행 실패(repair 한도 초과, 시스템 에러 등)를 JSON 파일에 격리합니다. 수동 review 후 재시도하거나 무시할 수 있습니다.

### 설정

```yaml
# obora.config.yaml
dlq:
  enabled: true
  filePath: ./data/.obora/dlq/dead-letters.json
```

### SDK API

기본 entry에는 다음 진단 필드가 포함됩니다.

- `stepName`: 마지막 repair 대상 step 또는 마지막 validation step
- `repairAttempts`: 실제 repair loop 시도 횟수
- `metadata.repairLoop`: 최근 repair/validation 요약 (`lastRepairStep`, `lastValidationStep`, `lastStopCategory` 등)

```typescript
import { FileDLQStore, createDLQEntry, summarizeDLQ, resolveDLQEntry } from "@obora/sdk";

// 조회
const store = new FileDLQStore("./data/.obora/dlq/dead-letters.json");
const snapshot = await store.load();
const summary = summarizeDLQ(snapshot);

// 해결
const resolved = resolveDLQEntry(snapshot, entryId, {
  status: "reviewed", // 'reviewed' | 'retried' | 'dismissed'
  actor: "admin",
  note: "Root cause identified and fixed",
});
await store.save(resolved);
```

### CLI

```bash
# pending DLQ triage queue
# persisted run이 있으면 목록에 compact run status도 같이 표시
obora dlq list --status pending

# inspect one entry with repair metadata
obora dlq inspect <entryId>
# persisted run이 있으면 related run summary와
# `obora runs inspect <runId>` 힌트까지 함께 표시
# repairAttempts / stop category / latest validation summary를
# curated triage summary로 함께 표시
# 관련 artifact preview와
# `obora artifact get <runId> <stepName> <name>` 힌트도 함께 표시

# aggregate counts
obora dlq summary

# resolve after triage
obora dlq resolve <entryId> --status reviewed --actor cto --note "root cause identified"
```

기본 경로는 config의 `dlq.filePath`를 따르고, 필요하면 각 subcommand에 `--file <path>`로 override할 수 있습니다.

### Dashboard API

```
GET  /api/dlq              # 목록 (status, limit, offset 필터)
GET  /api/dlq/:id          # 단건 조회
POST /api/dlq/:id/resolve  # 해결 처리
GET  /api/dlq/summary      # 요약 통계
```

---

## 3. Execution Lock

### 동작 방식

같은 워크플로우의 동시 실행을 방지합니다. File-based lock으로 PID를 기록하고, 프로세스가 죽으면 stale lock으로 감지하여 자동 해제합니다.

### 설정

```yaml
# obora.config.yaml
executionLock:
  enabled: true
  basePath: ./data/.obora/locks
  staleLockThresholdMs: 7200000 # 2시간 (기본값)
```

### 동작 시나리오

1. 실행 시작 → lock 파일 생성 (`{workflowName}.lock`)
2. 동시 실행 시도 → `SDK_UNKNOWN_ERROR` 발생
3. 실행 종료 → lock 파일 삭제
4. 프로세스 비정상 종료 → PID 확인 후 stale lock 자동 해제

---

## 4. Auto-Recovery

### 동작 방식

워크플로우 실행 실패 시, checkpoint에서 자동으로 `resume()`를 호출합니다. 설정한 횟수만큼 재시도하며, 모두 실패하면 DLQ에 적재됩니다.

### 설정

```yaml
# obora.config.yaml
autoRecovery:
  enabled: true
  maxRetries: 1 # 최대 재시도 횟수 (기본: 1)
  delayMs: 5000 # 재시도 전 대기시간 (기본: 5초)
  driftPolicy: warn # 정책 drift 처리: 'reject' | 'warn' | 'ignore'
```

### 이벤트

- 시도: `warning` 이벤트 (`code: AUTO_RECOVERY_ATTEMPT`)
- 실패: `warning` 이벤트 (`code: AUTO_RECOVERY_FAILED`)

---

## 5. Circuit Breaker

### 동작 방식

LLM 호출 실패가 임계값을 초과하면 circuit을 open하여 추가 호출을 차단합니다. 일정 시간 후 half-open 상태에서 탐침 호출을 보내고, 성공하면 circuit을 닫습니다.

### SDK API

```typescript
import { CircuitBreaker, CircuitOpenError } from "@obora/sdk";

const breaker = new CircuitBreaker({
  failureThreshold: 5, // 5회 실패 시 open
  resetTimeoutMs: 30000, // 30초 후 half-open 시도
  successThreshold: 2, // half-open에서 2회 성공 시 close
});

try {
  const result = await breaker.execute(() => llmCall());
} catch (err) {
  if (err instanceof CircuitOpenError) {
    // Circuit이 open 상태 — LLM 호출 차단됨
  }
}
```

### 상태 머신

```
CLOSED (정상) → [failureThreshold 초과] → OPEN (차단)
OPEN → [resetTimeoutMs 경과] → HALF_OPEN (탐침)
HALF_OPEN → [successThreshold 성공] → CLOSED
HALF_OPEN → [1회 실패] → OPEN
```

---

## 6. Health Checker

### 동작 방식

주기적으로 시스템 상태를 점검합니다. Stuck execution 감지, 커스텀 체크 등록이 가능합니다.

### SDK API

```typescript
import { HealthChecker, createStuckExecutionCheck } from "@obora/sdk";

const checker = new HealthChecker({ intervalMs: 60000 });

// Built-in: stuck execution 감지
checker.register(
  "stuck",
  createStuckExecutionCheck(
    () => getActiveExecutions(),
    7200000 // 2시간 이상이면 stuck 판정
  )
);

// 커스텀 체크 등록
checker.register("disk_space", async () => ({
  name: "disk_space",
  status: diskFreePercent > 10 ? "pass" : "fail",
  message: `${diskFreePercent}% free`,
}));

// 상태 변경 구독
checker.onStatusChange((status) => {
  if (!status.healthy) alertManager.send(/* ... */);
});

checker.start();
```

---

## 7. Alert Manager

### 동작 방식

심각한 이벤트(DLQ 적재, health fail, circuit open 등)를 외부 채널로 알림합니다.

### SDK API

```typescript
import { AlertManager, WebhookAlertChannel, ConsoleAlertChannel } from "@obora/sdk";

const alertManager = new AlertManager({ minSeverity: "warning" });
alertManager.addChannel(new ConsoleAlertChannel());
alertManager.addChannel(
  new WebhookAlertChannel("https://hooks.slack.com/services/...", { Authorization: "Bearer ..." })
);

await alertManager.send({
  id: crypto.randomUUID(),
  timestamp: new Date().toISOString(),
  severity: "critical",
  title: "Execution Failed",
  message: "Workflow overnight-builder failed after 7 repair attempts",
  executionId: "708408f7-...",
  workflowName: "overnight-builder",
});
```

---

## 8. Metrics Export

### 동작 방식

실행 메트릭(카운터, 게이지, 히스토그램)을 수집하고 Prometheus 텍스트 포맷 또는 JSON으로 내보냅니다.

### SDK API

```typescript
import { MetricsCollector, OBORA_METRICS } from "@obora/sdk";

const metrics = new MetricsCollector();

// 카운터
metrics.increment(OBORA_METRICS.EXECUTION_TOTAL, 1, { workflow: "overnight-builder" });
metrics.increment(OBORA_METRICS.EXECUTION_SUCCESS, 1, { workflow: "overnight-builder" });

// 게이지
metrics.gauge(OBORA_METRICS.ACTIVE_EXECUTIONS, 1);

// 히스토그램
metrics.observe(OBORA_METRICS.EXECUTION_DURATION_SECONDS, 2400, { workflow: "overnight-builder" });

// Prometheus 포맷 내보내기
const prometheusText = metrics.toPrometheus();

// JSON 스냅샷
const snapshot = metrics.snapshot();
```

### Dashboard API

```
GET /api/metrics       # Prometheus text format
GET /api/metrics/json  # JSON format
```

### 표준 메트릭 이름

| 이름                               | 타입      | 설명                         |
| ---------------------------------- | --------- | ---------------------------- |
| `obora_execution_total`            | counter   | 총 실행 횟수                 |
| `obora_execution_success_total`    | counter   | 성공 실행 횟수               |
| `obora_execution_failure_total`    | counter   | 실패 실행 횟수               |
| `obora_execution_duration_seconds` | histogram | 실행 소요시간                |
| `obora_step_total`                 | counter   | 총 step 실행 횟수            |
| `obora_step_duration_seconds`      | histogram | Step 소요시간                |
| `obora_repair_total`               | counter   | Repair 시도 횟수             |
| `obora_dlq_entries`                | gauge     | DLQ 대기 항목 수             |
| `obora_active_executions`          | gauge     | 현재 실행 중인 워크플로우 수 |
| `obora_circuit_breaker_state`      | gauge     | Circuit breaker 상태         |
| `obora_llm_calls_total`            | counter   | LLM 호출 횟수                |
| `obora_llm_cost_usd`               | counter   | LLM 비용 (USD)               |

---

## 전체 설정 예시

```yaml
# obora.config.yaml
version: "1.0"

persistence:
  enabled: true
  adapter: sqlite
  sqlite:
    path: ./data/obora.db

tkgProjection:
  enabled: true
  rollback:
    enabled: true
    adapter: file
    file:
      basePath: ./data/.obora/tkg-rollback

dlq:
  enabled: true
  filePath: ./data/.obora/dlq/dead-letters.json

executionLock:
  enabled: true
  basePath: ./data/.obora/locks
  staleLockThresholdMs: 7200000

autoRecovery:
  enabled: true
  maxRetries: 1
  delayMs: 5000
  driftPolicy: warn
```

---

## 실검증 결과 (2026-03-24)

| 항목          | 결과                  |
| ------------- | --------------------- |
| 총 소요시간   | 40분                  |
| Step 완료     | 7/7 ✅                |
| 테스트 통과   | 744/744 (100%)        |
| Repair 시도   | 0회                   |
| DLQ           | 비어 있음 ✅          |
| Lock          | 정상 해제 ✅          |
| Auto-rollback | 미발동 (실패 없음) ✅ |
| Auto-recovery | 미발동 (실패 없음) ✅ |

이전 실행 (3/23) 대비:

- 테스트 실패: 33개 → **0개**
- Repair: 7회 → **0회**
- 소요시간: 75분 → **40분**
- 결과: failed → **completed**
