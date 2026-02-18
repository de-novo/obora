---
status: draft
owner: denovo
project: obora-kit
created: "2026-02-18"
updated: "2026-02-18"  # R3 Codex P0 + GLM P1/P2 피드백 반영
links:
  - "[[projects/obora-kit/INDEX]]"
  - "[[projects/obora-kit/ROADMAP]]"
  - "[[projects/obora-kit/ARCHITECTURE]]"
  - "[[projects/obora-kit/PRINCIPLES]]"
  - "[[projects/obora-kit/m4-dashboard-observability-design]]"
---

# M6 Production Memory Design

## 1. 개요

M6의 테마는 **"Production Memory"** — AI 실행의 영속성과 재현성입니다.

M1-M4가 "AI를 제어할 수 있다"를 증명했다면, M6는 **"AI 실행을 기억하고, 이어가고, 비용을 알고, 판단을 추적한다"**를 증명합니다. 현재 Obora의 치명적 약점은 실행이 끝나면 모든 것이 사라진다는 것입니다. 이는 프로덕션에서 용납할 수 없습니다.

### M6 선행 근거 (M5 일시정지)

ROADMAP 상 M5(공개 준비)가 M6보다 앞 순서이나, 다음 이유로 M6를 먼저 진행합니다:

1. **공개 시 완성도**: M5에서 공개할 때 영속성/비용추적/감사 재생 없이는 "프로덕션 런타임"이라 부르기 어려움
2. **데모 임팩트**: Checkpoint Resume + Cost Tracking + Audit Replay가 포함된 데모가 훨씬 강력한 첫인상 제공
3. **기술 의존성**: M6 기능(Persistence Layer)이 M5 문서화/예제에 포함되어야 완전한 Getting Started 가능
4. **리스크 관리**: M6는 내부 아키텍처 변경이므로 공개 전에 안정화하는 것이 안전

M5는 M6 완료 후 재개하며, ROADMAP.md에도 이 결정이 반영되어 있습니다.

### M6 성공 기준

todo-app 5-step 파이프라인에서 step 3 강제 실패 → `obora resume` → step 3부터 완료 → 전 과정 비용/투표 기록을 대시보드에서 조회. **1분 시연 가능.**

### 경쟁 포지셔닝

| 기능 | Obora M6 | LangChain | CrewAI | Temporal |
|------|----------|-----------|--------|----------|
| Step별 영속 저장 | ✅ 자동 | ❌ 수동 | ❌ | ✅ (범용) |
| Checkpoint Resume | ✅ Policy 적용 | ❌ | ❌ | ✅ (AI 비인식) |
| 비용/토큰 추적 + 제약 | ✅ Policy DSL | ⚠️ callback | ❌ | ❌ |
| Consensus Audit Replay | ✅ | ❌ | ❌ | ❌ |

- **vs LangChain/CrewAI:** 그들은 실행 편의, Obora는 실행 거버넌스
- **vs Temporal:** Temporal은 워크플로우를 복구하지만, Obora는 AI의 비결정적 판단을 감사하면서 복구한다
- **Consensus Audit Replay**는 Obora 독점 기능

---

## 2. 아키텍처

M6는 Runtime에 **Persistence Layer**를 추가하고, 기존 컴포넌트(Audit Trail, Recovery Engine, Dashboard)와 통합합니다.

### 데이터 흐름

```text
┌─────────────────────────────────────────────────────┐
│                   Obora Runtime                      │
│                                                      │
│  Orchestrator → Cell 실행 → Policy 집행              │
│       │              │            │                  │
│       ▼              ▼            ▼                  │
│  ┌─────────────────────────────────────────┐        │
│  │       Run Persistence Layer (신규)       │        │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────┐ │        │
│  │  │RunRecord │ │StepRecord│ │Artifact │ │        │
│  │  │          │ │          │ │Record   │ │        │
│  │  └──────────┘ └──────────┘ └─────────┘ │        │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────┐ │        │
│  │  │Checkpoint│ │CostRecord│ │AuditEvent│ │        │
│  │  │Record    │ │          │ │(구조화)  │ │        │
│  │  └──────────┘ └──────────┘ └─────────┘ │        │
│  │                                         │        │
│  │  StorageAdapter (SQLite default)        │        │
│  │  ├── SQLiteAdapter (빌트인)              │        │
│  │  └── PluggableAdapter interface         │        │
│  └─────────────────────────────────────────┘        │
│       │              │            │                  │
│       ▼              ▼            ▼                  │
│  Dashboard ◄── Query API ──► CLI                    │
│  (History View)              (inspect/resume/audit)  │
└─────────────────────────────────────────────────────┘
```

### 기존 컴포넌트 통합 포인트

| 기존 컴포넌트 | M6 통합 | 변경 범위 |
|-------------|---------|----------|
| `runtime/orchestrator` | Run/Step 생명주기 이벤트를 Persistence Layer에 기록 | 이벤트 hook 추가 |
| `runtime/cell` | Cell 실행 결과를 StepRecord로 자동 캡처 | 출력 인터셉터 추가 |
| `runtime/audit` | AuditTrail 이벤트를 구조화 저장소에 병행 기록 | 저장소 어댑터 연결 |
| `runtime/recovery` | Checkpoint 기반 resume 지원 | Resume 전략 추가 |
| `runtime/policy` | 비용/토큰 제약 정책 평가 | DSL 확장 |
| `packages/dashboard` | History View 탭 + Audit Replay UI 추가 | 신규 라우트/컴포넌트 |
| `packages/cli` | `resume`, `inspect --cost`, `audit replay` 명령 추가 | 신규 커맨드 |
| `@obora/sdk` | `runtime.resume()`, `run.cost()`, `run.artifacts()` API | 신규 메서드 |

### 아키텍처 정합성 원칙

- Orchestrator의 결정성은 변경하지 않는다 (Persistence는 부작용 없는 기록 계층)
- 영속화는 opt-in 방식이다 (기존 in-memory 실행과 완전 호환)
- 모든 저장소 접근은 StorageAdapter 인터페이스를 경유한다

### StorageAdapter vs ArtifactStore 책임 경계

두 인터페이스는 저장 대상과 특성이 다르므로 명확히 분리합니다:

| 구분 | StorageAdapter | ArtifactStore |
|------|---------------|---------------|
| **책임** | Run/Step/Checkpoint/Cost/Audit 등 **구조화된 메타데이터** 영속 | Step 생성물(코드, JSON, 이미지 등) **비정형 blob** 저장 |
| **데이터 특성** | 소량, 구조화, 쿼리 필수 | 대용량 가능, 비정형, 스트리밍 읽기 |
| **기본 구현** | SQLiteAdapter (관계형 DB) | LocalFileArtifactStore (파일시스템) |
| **플러그인 확장** | PostgreSQL 등 RDBMS | S3, GCS 등 Object Storage |
| **참조 관계** | `ArtifactRecord.storageRef`로 ArtifactStore 내 위치를 가리킴 | StorageAdapter에 저장된 `ArtifactRecord` 메타데이터와 1:1 매핑 |

StorageAdapter는 `ArtifactRecord`(메타데이터)를 저장하고, ArtifactStore는 실제 blob을 저장합니다. 조회 시 StorageAdapter에서 메타데이터를 먼저 찾고, `storageRef`를 통해 ArtifactStore에서 blob을 가져옵니다.

> **비대화 방지 원칙:** StorageAdapter에 blob 저장 메서드를 추가하지 않습니다. 향후 캐시, 인덱스 등 횡단 관심사가 필요하면 StorageAdapter를 확장하는 대신 별도 인터페이스(e.g. `CacheAdapter`)를 도입합니다.

### 최종 StorageAdapter 통합 인터페이스

각 태스크(T1–T4)에서 점진적으로 확장되는 StorageAdapter의 **최종 통합 형태**입니다. 구현 시 이 인터페이스를 기준으로 합니다.

```typescript
export interface StorageAdapter {
  // ── Run 관리 (T1) ──
  saveRun(record: RunRecord): Promise<void>;
  getRun(runId: string): Promise<RunRecord | null>;
  listRuns(filter: RunFilter): Promise<RunRecord[]>;

  // ── Step 관리 (T1) ──
  saveStep(record: StepRecord): Promise<void>;
  getSteps(runId: string): Promise<StepRecord[]>;

  // ── Artifact 메타데이터 관리 (T1) ──
  saveArtifact(record: ArtifactRecord): Promise<ArtifactRecord>;
  getArtifacts(runId: string, stepName?: string): Promise<ArtifactRecord[]>;
  deleteArtifact(artifactId: string): Promise<void>;  // soft-delete (deletedAt 설정)

  // ── Checkpoint 관리 (T2) ──
  saveCheckpoint(record: CheckpointRecord): Promise<void>;
  getLatestCheckpoint(runId: string): Promise<CheckpointRecord | null>;

  // ── Cost 관리 (T3) ──
  saveCost(record: CostRecord): Promise<void>;
  getCosts(runId: string, stepName?: string): Promise<CostRecord[]>;
  getRunCostSummary(runId: string): Promise<CostSummary>;

  // ── Audit 관리 (T4) ──
  saveAuditEvent(event: StructuredAuditEvent): Promise<void>;
  getAuditTimeline(runId: string, stepName?: string): Promise<StructuredAuditEvent[]>;
}
```

> **구현 가이드**: T1에서 Run/Step/Artifact 메서드로 시작하고, T2–T4에서 메서드를 추가합니다. SQLiteAdapter는 이 통합 인터페이스를 완전히 구현해야 합니다.

**커스텀 StorageAdapter 플러그인 등록:**

```typescript
// 1. StorageAdapter 인터페이스를 구현하는 커스텀 어댑터 작성
import { StorageAdapter, RunRecord, StepRecord /* ... */ } from "@obora/sdk";
import { Pool } from "pg";

export class PostgresAdapter implements StorageAdapter {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async saveRun(record: RunRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO runs (id, workflow_name, status, input, started_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET status = $3, completed_at = $6`,
      [record.id, record.workflowName, record.status, record.input, record.startedAt, record.completedAt]
    );
  }

  // ... 나머지 메서드 구현
}

// 2. Runtime 설정에서 커스텀 어댑터 등록
import { createRuntime } from "@obora/sdk";

const runtime = createRuntime({
  persistence: {
    enabled: true,
    adapter: "custom",
    custom: {
      instance: new PostgresAdapter("postgresql://localhost:5432/obora"),
    },
  },
});

// 또는 obora.yaml에서 모듈 경로로 등록
// persistence:
//   adapter: custom
//   custom:
//     module: "./adapters/postgres-adapter"   # default export가 StorageAdapter 구현체
//     options:
//       connectionString: "postgresql://localhost:5432/obora"
```

### 최종 ArtifactStore 통합 인터페이스

ArtifactStore는 비정형 blob 저장을 담당하며, StorageAdapter와 독립적인 플러그인 체계를 갖습니다.

```typescript
export interface ArtifactStore {
  save(runId: string, stepName: string, name: string, data: Buffer, mime: string): Promise<ArtifactRecord>;
  get(artifactId: string): Promise<{ record: ArtifactRecord; data: Buffer }>;
  list(runId: string, stepName?: string): Promise<ArtifactRecord[]>;
  delete(artifactId: string): Promise<void>;
}
```

> **플러그인 등록**: StorageAdapter와 동일한 레지스트리 패턴을 사용합니다. `artifacts.store` 설정값(`local` | `s3` | `gcs` | `custom`)에 따라 팩토리가 구현체를 생성합니다. 커스텀 구현은 `ArtifactStore` 인터페이스를 구현한 클래스를 `runtime.registerArtifactStore(instance)`로 등록합니다.

---

## 3. 태스크 분해 (6개, 5주)

| 순서 | 태스크 | 기간 | 우선순위 | 의존 |
|------|--------|------|----------|------|
| T1 | Run Persistence Layer | 2주 | P0 | 없음 |
| T2 | Checkpoint & Resume | 1주 | P0 | T1 |
| T3 | Cost & Token Tracker + Budget Policy | 1주 | P0 | T1 |
| T4 | Audit Replay | 0.5주 | P1 | T1 |
| T5 | Dashboard History View | 1주 | P1 | T1, T2, T3, T4 |
| T6 | Artifact Auto-Storage | 0.5주 | P1 | T1 |

### 의존 관계 그래프

```text
        ┌──────┐
        │  T1  │  Run Persistence Layer (기반)
        └──┬───┘
     ┌─────┼─────┬──────┐
     ▼     ▼     ▼      ▼
  ┌────┐ ┌────┐ ┌────┐ ┌────┐
  │ T2 │ │ T3 │ │ T4 │ │ T6 │
  └──┬─┘ └──┬─┘ └──┬─┘ └────┘
     │      │      │
     ▼      ▼      ▼
   ┌────────────────────┐
   │        T5          │  Dashboard History View
   └────────────────────┘
```

### 타임라인

```text
Week 1-2:  T1 (Persistence Layer) — 모든 것의 기반
Week 3:    T2 (Checkpoint Resume) + T3 (Cost Tracker) — 병렬
Week 4:    T4 (Audit Replay) + T6 (Artifact Storage) — 병렬
Week 5:    T5 (Dashboard History) + 통합 테스트 + 데모 시나리오
```

---

## 4. 각 태스크별 상세 명세

### T1 — Run Persistence Layer (SQLite + pluggable)

- **목표**: 실행 결과(Run/Step/메타데이터)를 영속 저장소에 기록하는 기반 계층 구축
- **입력/출력**:
  - 입력: Runtime Orchestrator의 Run/Step 생명주기 이벤트
  - 출력: `RunRecord`, `StepRecord`, `ArtifactRecord` 영속 저장
- **의존**: 없음 (M6 기반 태스크)
- **성공 기준**: todo-app 실행 후 프로세스 종료 → 재시작 후 모든 step 결과를 CLI/SDK로 조회 가능
- **비목표**: 마이그레이션 도구, 멀티테넌시, 다중 리전 복제
- **예상 기간**: 2주

**SDK/CLI/Dashboard 영향도:**

| 계층 | 영향 |
|------|------|
| SDK | `run.get(id)`, `run.steps(id)`, `run.artifacts(stepId)` 신규 API |
| CLI | `obora inspect <runId>` 명령 추가 |
| Dashboard | 데이터 소스 계층 (T5에서 UI 연결) |
| Runtime Config | `persistence` 설정 블록 추가 |

**핵심 인터페이스:**

```typescript
// 저장소 어댑터 인터페이스
export interface StorageAdapter {
  saveRun(record: RunRecord): Promise<void>;
  getRun(runId: string): Promise<RunRecord | null>;
  listRuns(filter: RunFilter): Promise<RunRecord[]>;
  saveStep(record: StepRecord): Promise<void>;
  getSteps(runId: string): Promise<StepRecord[]>;
  saveArtifact(record: ArtifactRecord): Promise<ArtifactRecord>;
  getArtifacts(runId: string, stepName?: string): Promise<ArtifactRecord[]>;
}

// Run 3계층 스키마
export interface RunRecord {
  id: string;
  workflowName: string;
  status: "running" | "completed" | "failed" | "suspended";
  input: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
  // metadata 예시:
  // { userId: "user-123", environment: "staging", tags: ["experiment-1"], triggerSource: "cli" }
}

export interface StepRecord {
  id: string;
  runId: string;
  stepName: string;
  status: "running" | "completed" | "failed" | "skipped";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: { code: string; message: string; stack?: string };
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface ArtifactRecord {
  id: string;
  runId: string;
  stepName: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  storageRef: string; // 로컬 경로 또는 blob ref
  createdAt: string;
  deletedAt?: string; // soft-delete 타임스탬프 (설정 시 조회에서 제외)
}

export interface RunFilter {
  status?: RunRecord["status"];
  workflowName?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}
```

**Runtime Config 확장:**

```yaml
persistence:
  enabled: true
  adapter: sqlite          # sqlite | postgres | custom
  sqlite:
    path: ./data/obora.db
  # postgres:
  #   connectionString: postgresql://...
```

---

### T2 — Checkpoint & Resume

- **목표**: Step N에서 실패 시, Step N부터 재개할 수 있는 체크포인트/복구 메커니즘 구축
- **입력/출력**:
  - 입력: RunId + 실패 지점의 State Binder 스냅샷
  - 출력: 실패 step부터 재개된 실행 + 재개 이력 감사 로그
- **의존**: T1 (Persistence Layer 위에 구축)
- **성공 기준**: 5-step 파이프라인에서 step 3 강제 실패 → `obora resume <runId>` → step 3부터 완료까지 자동 진행
- **비목표**: 부분 step 재개(step 내부 중간 지점), 분산 체크포인트, 임의 시점 타임트래블
- **예상 기간**: 1주

**SDK/CLI/Dashboard 영향도:**

| 계층 | 영향 |
|------|------|
| SDK | `runtime.resume(runId, { fromStep? })` 신규 API |
| CLI | `obora resume <runId> [--from-step <stepName>]` 명령 추가 |
| Dashboard | Run 상태에 "suspended" 표시, Resume 버튼 (T5에서 연결) |
| Policy | resume 시 동일 정책 적용 보장, drift guard 검증 |

**핵심 인터페이스:**

```typescript
export interface CheckpointRecord {
  id: string;
  runId: string;
  stepName: string;           // 체크포인트 생성 시점의 step
  stateSnapshot: unknown;     // State Binder 직렬화 스냅샷
  completedSteps: string[];   // 완료된 step 목록
  policyHash: string;         // 정책 drift 감지용 (아래 계산 로직 참조)
  createdAt: string;
}

// StorageAdapter 확장
export interface StorageAdapter {
  // ... T1 메서드들
  saveCheckpoint(record: CheckpointRecord): Promise<void>;
  getLatestCheckpoint(runId: string): Promise<CheckpointRecord | null>;
}

// State Snapshot 직렬화 계약
// State Binder에 바인딩되는 모든 객체는 아래 인터페이스를 구현해야 합니다.
export interface Checkpointable {
  /** 스키마 버전. 스냅샷 구조 변경 시 증가하여 마이그레이션 지원 */
  readonly schemaVersion: number;
  /** 현재 상태를 JSON-serializable 객체로 변환. schemaVersion을 반드시 포함해야 함 */
  toCheckpoint(): Record<string, unknown> & { schemaVersion: number };
}
// 복원 팩토리: 별도 인터페이스로 분리
export interface CheckpointableFactory<T> {
  fromCheckpoint(snapshot: Record<string, unknown>): T;
}

// ── 사용 패턴 (인터페이스 기반 팩토리 단일 패턴) ──
//
// 모든 Checkpointable 복원은 CheckpointableFactory 인터페이스를 통해 수행합니다.
// 정적 팩토리 메서드(static fromCheckpoint)는 사용하지 않습니다.
//
// 등록:
//   class MyStateFactory implements CheckpointableFactory<MyState> {
//     fromCheckpoint(snapshot: Record<string, unknown>): MyState {
//       return new MyState(snapshot.value as string, snapshot.schemaVersion as number);
//     }
//   }
//   runtime.registerCheckpointFactory("MyState", new MyStateFactory());
//
// 복원 (Runtime 내부):
//   const factory = registry.get(typeName);  // CheckpointableFactory<T>
//   const restored = factory.fromCheckpoint(snapshot);
//
// ⚠️ static fromCheckpoint()는 인터페이스로 강제할 수 없으므로 사용하지 않습니다.
//    항상 CheckpointableFactory 구현 클래스를 별도로 만들어 registry에 등록하세요.
//
// 가이드라인:
// 1. toCheckpoint() 반환값은 JSON.stringify/parse 왕복 안전해야 함 (Date→ISO string, Buffer→base64 등)
// 2. fromCheckpoint()는 CheckpointableFactory를 구현한 별도 팩토리 클래스로 제공
// 3. 직렬화 불가능한 항목(DB 커넥션, 스트림 등)은 제외하고 resume 시 재생성
// 4. schemaVersion 필드를 포함하여 향후 마이그레이션 지원 (아래 Checkpointable 확장 참조)

// policyHash 계산 로직
// Resume 시 정책 drift를 감지하기 위해, Checkpoint 생성 시점의 정책 상태를 해싱합니다.
//
// 포함 필드:
//   1. resources 블록 전체 (maxCostPerRun, maxTokensPerStep, maxCostPerStep, onBudgetExceed)
//   2. resources.pricing 배열 (모델별 단가)
//   3. workflow-level policies (consensus 전략, quorum 설정 등)
//
// 제외 필드: persistence/artifacts 설정 (저장 방식 변경은 drift로 간주하지 않음)
//
// 계산 방법:
//   const policyConfig = {
//     resources: config.resources,      // pricing 포함
//     policies: workflowConfig.policies // consensus/quorum 등
//   };
//   // 키 정렬로 직렬화 안정성 확보
//   const hash = crypto.createHash('sha256')
//     .update(JSON.stringify(policyConfig, Object.keys(policyConfig).sort()))
//     .digest('hex');

// Resume 옵션
export interface ResumeOptions {
  fromStep?: string;          // 미지정 시 마지막 실패 step
  driftPolicy?: "reject" | "warn" | "ignore"; // 정책 변경 감지 시 동작
}
```

**Step 복원 정책:**

| Step 상태 | 복원 동작 | 근거 |
|-----------|----------|------|
| `completed` | 출력 복원 (재실행 안 함) | 이미 성공한 step은 캐시된 결과 사용 |
| `failed` | **재실행** (출력 복원 안 함) | 실패한 step의 출력은 불완전/오염 가능성이 있으므로 폐기 후 재실행 |
| `running` (중단됨) | **재실행** | 중간 상태는 신뢰할 수 없음 |
| `skipped` | 스킵 유지 | 원래 실행 계획 존중 |

실패한 step의 부분 출력(있는 경우)은 `StepRecord.error`에 기록되지만 State Binder에는 반영하지 않습니다. Resume 시 해당 step은 clean state에서 재실행됩니다.

**Resume 흐름:**
1. `getLatestCheckpoint(runId)` → 스냅샷 로드
2. `policyHash` 비교 → drift 감지 시 `driftPolicy`에 따라 처리
3. State Binder 복원 → 완료된 step 스킵 → 실패 step부터 재개
4. 재개 이벤트(`resume_start`, `resume_end`) Audit Trail 기록

**Policy Drift 감지 시 기록:**

drift가 감지되면 `driftPolicy` 설정과 무관하게 항상 AuditEvent를 기록합니다:

```typescript
// drift 감지 시 자동 기록되는 AuditEvent
{
  category: "recovery",
  action: "policy_drift_detected",
  actor: "system",
  detail: {
    oldHash: "abc123...",    // 체크포인트 시점의 policyHash
    newHash: "def456...",    // 현재 정책의 policyHash
    driftAction: "reject" | "warn" | "ignore",  // 실제 취한 조치
    changedFields: ["resources.maxCostPerRun", "policies.quorum"]  // best-effort 변경 필드 목록
  }
}
```

- `reject`: AuditEvent 기록 + error 로그 출력 후 resume 중단, 에러 반환
- `warn`: AuditEvent 기록 + warning 로그 출력 후 resume 계속
- `ignore`: AuditEvent 기록 후 resume 계속. **콘솔/파일 로그는 출력하지 않음** (AuditEvent 저장소에만 기록되므로 `getAuditTimeline()`으로 조회 가능)

---

### T3 — Cost & Token Tracker + Budget Policy

- **목표**: Step별 LLM 호출 비용/토큰을 자동 추적하고, 정책 기반 예산 제약을 강제
- **입력/출력**:
  - 입력: Cell의 LLM provider 호출 인터셉트
  - 출력: `CostRecord` 저장 + Run/Step 단위 집계 + 예산 초과 시 정책 차단
- **의존**: T1 (CostRecord 저장)
- **성공 기준**: `obora inspect <runId> --cost`로 step별 토큰/비용 확인 가능. `maxCostPerRun` 제약 위반 시 Policy Engine이 차단.
- **비목표**: 실시간 비용 알림(M7), 청구서 자동 결제, 비용 최적화 추천
- **예상 기간**: 1주

**SDK/CLI/Dashboard 영향도:**

| 계층 | 영향 |
|------|------|
| SDK | `run.cost()`, `step.cost()` 조회 API |
| CLI | `obora inspect <runId> --cost` 옵션 추가 |
| Dashboard | 비용 위젯 (T5에서 연결) |
| Policy DSL | `maxCostPerRun`, `maxTokensPerStep`, `maxCostPerStep` 추가 |

**핵심 인터페이스:**

```typescript
export interface CostRecord {
  id: string;
  runId: string;
  stepName: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;           // 모델별 단가 기반 계산 (아래 ModelPricing 참조)
  latencyMs: number;
  createdAt: string;
}

// StorageAdapter 확장
export interface StorageAdapter {
  // ... T1, T2 메서드들
  saveCost(record: CostRecord): Promise<void>;
  getCosts(runId: string, stepName?: string): Promise<CostRecord[]>;
  getRunCostSummary(runId: string): Promise<CostSummary>;
}

export interface CostSummary {
  totalTokens: number;
  totalCostUsd: number;
  byStep: Array<{ stepName: string; tokens: number; costUsd: number }>;
  byModel: Array<{ model: string; tokens: number; costUsd: number }>;
}
```

**모델별 단가 계산:**

```typescript
// 모델 단가 설정 (obora.yaml 또는 SDK로 주입)
export interface ModelPricing {
  model: string;              // e.g. "gpt-4o", "claude-sonnet-4"
  promptPer1kTokens: number;  // USD per 1K prompt tokens
  completionPer1kTokens: number; // USD per 1K completion tokens
}

// costUsd 계산 공식:
// costUsd = (promptTokens / 1000 * pricing.promptPer1kTokens)
//         + (completionTokens / 1000 * pricing.completionPer1kTokens)

// 단가 미등록 모델 처리: resources.pricing.unknownModel 설정에 따름
// - "warn" (기본값): costUsd = 0 기록 + warning 로그. 예산 제약 검증에서 제외됨
// - "block": Policy 위반으로 차단. 미등록 모델 사용 불가
// - "estimate": fallback 단가(pricing.fallbackPer1kTokens) 적용하여 비용 추정 기록
```

```yaml
# obora.yaml 단가 설정 예시
resources:
  pricing:
    - model: "gpt-4o"
      promptPer1kTokens: 0.0025
      completionPer1kTokens: 0.01
    - model: "claude-sonnet-4"
      promptPer1kTokens: 0.003
      completionPer1kTokens: 0.015
    unknownModel: warn          # warn | block | estimate
    fallbackPer1kTokens:        # estimate 모드 전용
      prompt: 0.01
      completion: 0.03
```

**Policy DSL 확장:**

```yaml
resources:
  maxCostPerRun: 10.00       # USD
  maxTokensPerStep: 50000
  maxCostPerStep: 2.00       # USD
  onBudgetExceed: block      # V1: block | warn (approve는 V2에서 추가)
```

**Budget 차단 2단계 구조:**

| 단계 | 시점 | 검증 내용 | 차단 동작 |
|------|------|----------|----------|
| **Gate 1 (사전)** | Step 시작 직전 | 현재 누적 비용이 `maxCostPerRun`의 90%를 초과했는지 확인 | `warn`: 경고 로그, `block`: step 시작 차단 |
| **Gate 2 (실시간)** | LLM 호출 직후 | 실제 비용 반영 후 `maxCostPerRun`/`maxCostPerStep` 초과 여부 확인 | `block`: 해당 step을 `failed`로 마킹하고 run을 `suspended`로 전환 |

Gate 1은 예방적 차단(비용 초과를 사전에 방지), Gate 2는 사후 확인(실제 비용이 임계값을 넘은 경우 즉시 중단)입니다. 이미 완료된 LLM 호출의 비용은 롤백할 수 없으므로, Gate 2 차단 시 해당 호출 비용은 기록에 포함됩니다.

---

### T4 — Audit Replay

- **목표**: Consensus 투표 과정을 시간순으로 재현 가능한 구조화된 감사 이벤트 체계 구축
- **입력/출력**:
  - 입력: Runtime Consensus/Policy/Step 이벤트
  - 출력: `AuditEvent` 구조화 저장 + CLI/Dashboard 재생
- **의존**: T1 (이벤트 저장)
- **성공 기준**: 3-agent consensus step에서 각 agent의 투표 내역과 최종 결정 과정을 `obora audit replay <runId> --step <N>`으로 시간순 조회 가능
- **비목표**: 비디오/애니메이션 재생, 실시간 스트리밍 replay, LLM 자연어 해설
- **예상 기간**: 0.5주

**SDK/CLI/Dashboard 영향도:**

| 계층 | 영향 |
|------|------|
| SDK | `run.auditReplay(stepName?)` API |
| CLI | `obora audit replay <runId> [--step <name>]` 명령 추가 |
| Dashboard | Replay 타임라인 UI (T5에서 연결) |

**핵심 인터페이스:**

```typescript
export interface StructuredAuditEvent {
  id: string;
  runId: string;
  stepName: string;
  timestamp: string;
  category: "consensus" | "policy" | "execution" | "recovery";
  action: string;              // e.g. "vote_cast", "policy_evaluate", "step_start"
  actor: string;               // agent id 또는 "system"
  detail: Record<string, unknown>;
  // consensus 전용
  vote?: {
    decision: "approve" | "reject" | "abstain";
    confidence?: number;
    reasoning?: string;
  };
}

// StorageAdapter 확장
export interface StorageAdapter {
  // ... 기존 메서드들
  saveAuditEvent(event: StructuredAuditEvent): Promise<void>;
  getAuditTimeline(runId: string, stepName?: string): Promise<StructuredAuditEvent[]>;
}
```

**기존 M4 AuditTrail과의 관계:**
- M4의 `AuditTrail`(DuckDB + EventBus)은 실시간 스트리밍/조회 계층으로 유지
- M6는 Consensus/Policy 판정 이벤트를 **구조화된 형태**로 Persistence Layer에 병행 기록
- Dashboard Replay는 구조화 저장소에서 조회 (M4 EventPlayback의 발전형)

---

### T5 — Dashboard History View

- **목표**: 과거 Run 목록 조회 + 상세 드릴다운 + 비용/감사 통합 뷰
- **입력/출력**:
  - 입력: T1(RunRecord), T3(CostRecord), T4(AuditEvent) 데이터
  - 출력: Dashboard "History" 탭 UI
- **의존**: T1, T2, T3, T4 (T2: Resume 버튼/상태 표시에 필요)
- **성공 기준**: Dashboard에서 과거 Run을 조회하고, 임의 step의 상세 정보(입출력/비용/감사 타임라인)를 확인할 수 있다
- **비목표**: 고급 분석(트렌드/이상탐지), BI 수준 자유 쿼리, 비교 뷰
- **예상 기간**: 1주

**SDK/CLI/Dashboard 영향도:**

| 계층 | 영향 |
|------|------|
| SDK | 없음 (T1/T3/T4 API 활용) |
| CLI | 없음 (T1/T3/T4 CLI 활용) |
| Dashboard | `/history/runs`, `/history/runs/:id` 신규 라우트 + 컴포넌트 |

**Dashboard 신규 API:**

```typescript
// Fastify 라우트 (M4 Dashboard 확장)
// GET /api/history/runs         — Run 목록 (필터/페이지네이션)
// GET /api/history/runs/:runId  — Run 상세 (steps + cost + audit timeline)

export interface HistoryRunsQuery {
  status?: string;
  workflowName?: string;
  from?: string;
  to?: string;
  costMin?: number;
  costMax?: number;
  limit?: number;
  offset?: number;
  auditLimit?: number;   // audit timeline 페이지네이션 (기본 100)
  auditOffset?: number;  // audit timeline 오프셋 (기본 0)
}

export interface RunDetailResponse {
  run: RunRecord;
  steps: StepRecord[];
  costSummary: CostSummary;
  auditTimeline: StructuredAuditEvent[]; // 기본 limit 100, 페이지네이션 지원
  checkpoints: CheckpointRecord[];
  pagination?: {
    auditTotal: number;
    auditLimit: number;
    auditOffset: number;
  };
}
```

**UI 구성:**
- **Run 목록 뷰**: 필터(상태, 날짜, 비용 범위), 정렬, 페이지네이션. 각 행에 상태 뱃지 + 총 비용 + step 수 요약
- **Run 상세 뷰**: 상단에 Run 메타(상태/시간/총비용), 하단에 Step 타임라인(수평 진행 바) + Step별 드릴다운
- **Step 드릴다운**: 좌측 입출력 JSON 뷰어, 우측 비용 내역 카드, 하단 Audit Replay 타임라인
- **Audit Replay 타임라인**: 시간 축 기반 이벤트 카드 목록. 카테고리별 색상 구분(consensus=파랑, policy=노랑, recovery=빨강, execution=회색). M4 EventPlayback UI 패턴을 재사용하되, 필터(카테고리/actor) 추가
- **Resume 액션**: suspended 상태 Run에 대해 Resume 버튼 (drift 경고 모달 포함)

---

### T6 — Artifact Auto-Storage

- **목표**: Step별 생성물(텍스트, JSON, 파일)을 자동 감지·저장
- **입력/출력**:
  - 입력: Cell 출력 중 artifact로 태깅된 항목
  - 출력: `ArtifactRecord` + 실제 파일 저장
- **의존**: T1 (ArtifactRecord 스키마)
- **성공 기준**: LLM이 생성한 코드 파일을 artifact로 저장하고, Run 종료 후 `obora artifact get <runId> <stepName> <name>`으로 추출 가능
- **비목표**: 대용량 바이너리 최적화, CDN 연동, 복잡한 메타데이터 분석
- **예상 기간**: 0.5주

**SDK/CLI/Dashboard 영향도:**

| 계층 | 영향 |
|------|------|
| SDK | `step.artifacts()`, `artifact.download()` API |
| CLI | `obora artifact get <runId> <stepName> <name>` 명령 추가 |
| Dashboard | Artifact 뷰어 (T5 Step 드릴다운에 통합) |

**핵심 인터페이스:**

```typescript
// Artifact 저장소 인터페이스 (StorageAdapter와 분리)
// ⚠️ SSOT: 섹션 2 "최종 ArtifactStore 통합 인터페이스"와 동일해야 함
export interface ArtifactStore {
  save(runId: string, stepName: string, name: string, data: Buffer, mime: string): Promise<ArtifactRecord>;
  get(artifactId: string): Promise<{ record: ArtifactRecord; data: Buffer }>;
  list(runId: string, stepName?: string): Promise<ArtifactRecord[]>;
  delete(artifactId: string): Promise<void>;
}

// delete 동작:
// - ArtifactStore.delete(): blob 삭제 (LocalFile: 파일 삭제, S3: object 삭제)
// - StorageAdapter의 ArtifactRecord는 soft-delete (deletedAt 타임스탬프 기록, 조회에서 제외)
// - CLI: `obora artifact delete <runId> <stepName> <name>` 명령 지원
//
// 빌트인 구현
// - LocalFileArtifactStore (기본): ./data/artifacts/<runId>/<stepName>/
// - 플러그인 인터페이스: S3, GCS 등은 인터페이스만 정의
```

**자동 감지 규칙:**
- Cell 출력에 `artifacts` 키가 있으면 자동 저장
- `file_write` 도구 호출 결과를 자동 캡처
- 구조화 출력(JSON)은 `.json` artifact로 저장

---

## 5. 의도적 제외

| 항목 | 제외 이유 |
|------|----------|
| 분산 실행 | M6 범위 초과. 단일 프로세스 영속성이 먼저 |
| 멀티테넌시 | SaaS 모델 결정 전에 하면 재작업 발생 |
| Export/Import | UX 개선 범위, 핵심 영속성 이후에 추가 |
| 실시간 비용 알림 | 기록/제약이 먼저. 알림은 M7 |
| M5 공개 릴리즈 | M6 완료 후 M5 재개가 더 강력한 첫인상 |
| 고급 분석/트렌드 | 데이터 축적 후 의미 있음 |

---

## 6. 인터페이스 설계 종합

### Runtime Config (M6 확장)

```yaml
# obora.yaml
persistence:
  enabled: true
  adapter: sqlite
  sqlite:
    path: ./data/obora.db

artifacts:
  enabled: true
  store: local
  local:
    basePath: ./data/artifacts

resources:
  maxCostPerRun: 10.00
  maxTokensPerStep: 50000
  onBudgetExceed: block
```

### SDK API (M6 신규)

```typescript
// 실행 후 조회
const run = await runtime.getRun(runId);
const steps = await run.steps();
const cost = await run.cost();
const artifacts = await run.artifacts("generate");

// Resume
const resumed = await runtime.resume(runId);

// Audit Replay
const timeline = await run.auditReplay("review");

// Artifact 추출
const artifact = await run.artifact("generate", "output.ts");
const content = await artifact.download();
```

### CLI 명령 (M6 신규)

```bash
# Run 조회
obora inspect <runId>
obora inspect <runId> --cost
obora inspect <runId> --steps

# Resume
obora resume <runId>
obora resume <runId> --from-step <stepName>

# Audit Replay
obora audit replay <runId>
obora audit replay <runId> --step <stepName>

# Artifact
obora artifact list <runId>
obora artifact get <runId> <stepName> <name>
obora artifact delete <runId> <stepName> <name>  # soft-delete (deletedAt 설정)

# History
obora history list [--status <status>] [--from <date>] [--to <date>]
```

---

## 7. 릴리즈 게이트

### 기능 게이트
- [ ] todo-app E2E: 실행 → 실패 → resume → 완료 → 비용/감사 조회 시나리오 PASS
- [ ] 프로세스 재시작 후 Run 데이터 100% 조회 가능

### 품질 게이트
- [ ] Checkpoint resume 성공률 99%+ (deterministic step 기준)
- [ ] Step별 토큰/비용 오차 ±1% 이내
- [ ] 기존 M1-M4 테스트 회귀 없음

### 통제 게이트
- [ ] Budget Policy 위반 시 차단 동작 확인
- [ ] Resume 시 Policy drift guard 동작 확인
- [ ] Audit replay에서 consensus 투표 100% 추적 가능

### 문서 게이트
- [ ] 본 설계서 → 구현 완료 후 status `settled` 전환
- [ ] API Reference 업데이트 (SDK/CLI 신규 명령)
- [ ] todo-app 데모 시나리오 문서화

### 방향 게이트
- [x] AI 통제 강화? → 비용 제약, 감사 재생, 실패 복구 모두 통제 계층
- [x] 선언적/플러그인? → StorageAdapter 플러그인, Policy DSL 확장
- [x] Orchestrator 결정성? → Persistence는 부작용 없는 기록 계층
- [x] 코드생성기 특화 아닌가? → 범용 실행 영속성
- [x] 피봇 전 관성? → 완전 신규

---

## 8. 정량 성공 기준

| 지표 | 기준 |
|------|------|
| Run 영속률 | 100% (완료/실패 run 모두 저장) |
| Checkpoint resume 성공률 | 99%+ (deterministic step 기준) |
| 비용 추적 오차 | ±1% 이내 |
| Audit replay 완전성 | consensus 이벤트 체인 100% 재구성 |
| Artifact 캡처율 | 태깅된 항목 100% |
| 경쟁 독점 기능 | 3개 이상 ("No, LangChain can't do this") |

---

## 문서 정합성

본 문서는 다음 문서와 함께 M6 구조적 기준선을 형성합니다.

- [[projects/obora-kit/PRINCIPLES]]
- [[projects/obora-kit/ARCHITECTURE]]
- [[projects/obora-kit/ROADMAP]]
- [[projects/obora-kit/SCHEMAS]]
- [[projects/obora-kit/m4-dashboard-observability-design]]
