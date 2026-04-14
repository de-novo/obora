# History API

## 한줄 요약

History API는 persisted runs, repair-loop summaries, step records, artifacts, artifact preview/raw access를 외부 소비자에게 노출한다.

---

## Base paths

Dashboard server exposes history endpoints under:

```text
/api/history
```

Primary routes covered here:
- `GET /api/history/runs`
- `GET /api/history/runs/:runId`
- `GET /api/history/runs/:runId/artifacts/:artifactId/preview`
- `GET /api/history/runs/:runId/artifacts/:artifactId/raw`

---

## Shared response contracts

### PersistedRepairLoopSummary

```ts
interface PersistedRepairLoopSummary {
  validationFailed: number;
  validationPassed: number;
  repairStarted: number;
  repairCompleted: number;
  repairNoProgress: number;
  backEdgeTriggered: number;
  backEdgeExhausted: number;
  lastValidationSummary?: string;
  lastValidationStep?: string;
  lastRepairStep?: string;
  lastAttempt?: number;
  lastNoProgressReason?: string;
  lastExhaustReason?: string;
  recentValidationFailures: Array<{
    stepName?: string;
    summary?: string;
    errorCode?: string;
    logPath?: string;
    failedChecks: Array<{
      name?: string;
      message?: string;
      severity?: string;
      file?: string;
    }>;
  }>;
}
```

### ArtifactRecord

```ts
interface ArtifactRecord {
  id: string;
  runId: string;
  stepName: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  storageRef: string;
  createdAt: string;
  deletedAt?: string;
}
```

---

## List runs

### `GET /api/history/runs`

Lists persisted runs with summary data.

### Query params

- `status` — `running|completed|failed|suspended`
- `workflowName`
- `repairLoop` — `with|without|stalled|exhausted|critical|no-progress`
- `from`, `to`
- `costMin`, `costMax`
- `limit`, `offset`
- `sortBy` — `startedAt|completedAt|totalCostUsd|validationFailed`
- `sortOrder` — `asc|desc`

### Response shape

```ts
interface HistoryRunsResponse {
  items: Array<{
    run: RunRecord;
    repairLoop?: PersistedRepairLoopSummary;
    stepCount: number;
    costSummary: CostSummary;
  }>;
  total: number;
  limit: number;
  offset: number;
  repairLoopCounts?: {
    all: number;
    with: number;
    without: number;
    stalled: number;
    exhausted: number;
  };
}
```

### Example

```bash
curl "http://127.0.0.1:3100/api/history/runs?repairLoop=exhausted&sortBy=validationFailed&sortOrder=desc"
```

```ts
const response = await fetch('/api/history/runs?repairLoop=with&sortBy=validationFailed&sortOrder=desc');
const data = await response.json();
for (const item of data.items) {
  console.log(item.run.id, item.repairLoop?.validationFailed, item.repairLoop?.lastValidationSummary);
}
```

---

## Run detail

### `GET /api/history/runs/:runId`

Returns a single persisted run with full detail.

### Query params

- `auditLimit`
- `auditOffset`

### Response shape

```ts
interface RunDetailResponse {
  run: RunRecord;
  repairLoop?: PersistedRepairLoopSummary;
  steps: StepRecord[];
  artifacts: ArtifactRecord[];
  costSummary: CostSummary;
  auditTimeline: StructuredAuditEvent[];
  checkpoints: CheckpointRecord[];
}
```

### Example

```bash
curl "http://127.0.0.1:3100/api/history/runs/run-exhausted?auditLimit=100&auditOffset=0"
```

```ts
const detail = await fetch(`/api/history/runs/${runId}`).then((res) => res.json());
console.log(detail.repairLoop?.recentValidationFailures);
console.log(detail.artifacts.map((artifact: ArtifactRecord) => artifact.name));
```

---

## Artifact preview

### `GET /api/history/runs/:runId/artifacts/:artifactId/preview`

Returns preview payload for text-like artifacts.

### Response shape

```ts
interface ArtifactPreviewResponse {
  artifact: ArtifactRecord;
  supported: boolean;
  contentType?: string;
  text?: string;
  truncated?: boolean;
  reason?: string;
}
```

### Semantics

- `supported = true` → `text` contains preview text
- `supported = false` → preview is unavailable, see `reason`
- large text may be truncated with `truncated = true`

### Example

```bash
curl "http://127.0.0.1:3100/api/history/runs/run-exhausted/artifacts/a1/preview"
```

```ts
const preview = await fetch(`/api/history/runs/${runId}/artifacts/${artifactId}/preview`).then((res) => res.json());
if (preview.supported) {
  console.log(preview.text);
} else {
  console.warn(preview.reason);
}
```

---

## Artifact raw / download

### `GET /api/history/runs/:runId/artifacts/:artifactId/raw`

Returns the original payload inline.

### `GET /api/history/runs/:runId/artifacts/:artifactId/raw?download=1`

Returns the original payload as attachment.

### Response behavior

- content type is derived from `artifact.mimeType`
- default content disposition is `inline`
- `download=1` changes content disposition to `attachment`

### Example

```bash
# open raw
curl -i "http://127.0.0.1:3100/api/history/runs/run-exhausted/artifacts/a1/raw"

# download
curl -OJ "http://127.0.0.1:3100/api/history/runs/run-exhausted/artifacts/a1/raw?download=1"
```

```ts
const rawUrl = `/api/history/runs/${runId}/artifacts/${artifactId}/raw`;
const downloadUrl = `${rawUrl}?download=1`;
window.open(rawUrl, '_blank');
```

---

## Consumer guidance

Recommended access pattern:

1. list runs and inspect `repairLoop`
2. choose a run with stalled / exhausted / high validationFailed counts
3. fetch run detail
4. inspect `repairLoop.recentValidationFailures`
5. follow related artifacts
6. preview text quickly
7. open raw / download when needed

---

## Notes

- `repairLoop` is exposed as a top-level response field for easier external consumption.
- Consumers should prefer top-level `repairLoop` over digging into `run.metadata.repairLoop`.
- Artifact preview focuses on text-like payloads; binary formats should use raw/download flows.
