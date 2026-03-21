# Shared Memory / TKG 확장 MVP

> **상태**: 🛠️ 구현용 MVP 스펙
> **목적**: 현재 Obora의 runtime-safe 구조를 유지하면서, 장기 Shared Memory / TKG 방향으로 점진 확장한다.
> **관련 문서**: [blackboard-memory-extension.md](./blackboard-memory-extension.md)

## 문서 위치와 역할

이 문서는 기존 `blackboard-memory-extension.md`를 대체하지 않는다.

- `blackboard-memory-extension.md` = **장기 비전 / north star**
- `shared-memory-tkg-mvp.md` = **지금 구현 가능한 MVP 스펙 / migration path**

즉, 기존 문서를 스펙 다운하는 것이 아니라:
1. 장기 비전은 유지하고
2. 현재 제품 상태에 맞는 중간 설계를 추가한다.

---

## 배경

현재 Obora는 다음이 이미 구현되어 있다.

- Runtime Blackboard wrapping
- ExecutionObserver → Blackboard 기록
- Reflector v2 → repair-loop intervention
- YAML reflector rules / knowledge store / action wiring
- debug trace 기반 실전 검증

이 구조는 **execution-local harness control**에는 충분히 유효하다.

하지만 기존 장기 비전은 여기서 더 나아가:

- 세션 간 공유 메모리
- persistent knowledge / decisions / context
- event → TKG staging projection
- staging → production promotion

까지 포함한다.

현재 구조를 유지한 채 확장하려면, Blackboard/Observer/Reflector의 책임을 섞지 않고 **projection + persistence layer**를 추가해야 한다.

---

## 현재 구현 vs 장기 비전

| 영역 | 현재 구현 | 장기 비전 |
|---|---|---|
| Blackboard | execution-local shared state | local + shared + global memory hierarchy |
| Observer | metrics / report / Blackboard write | event → TemporalNode projection |
| Reflector | repair-loop hint / action / learning | staging → production promotion + conflict resolution |
| Persistence | Reflector knowledge store 중심 | Blackboard knowledge/decisions/context shared persistence |
| Scope | workflow execution | execution + workflow + project + global |

---

## 설계 원칙

### 1. 현재 runtime loop는 깨지지 않아야 한다
Shared Memory / TKG 확장은 repair loop, validation, observer report, reflector action 경로를 불안정하게 만들면 안 된다.

### 2. Local Blackboard와 Shared Memory를 분리한다
현재 Blackboard는 execution-local 상태 관리에 집중한다.
공유/영속 책임은 별도 store가 맡는다.

### 3. Observer는 두 역할을 분리한다
- `ExecutionObserver` = 운영 메트릭 / 리포트
- `TKGProjector` = 이벤트를 TemporalNode로 projection

### 4. Reflector도 두 레이어를 둔다
- `ReflectorEngine` = repair-loop intervention
- future TKG reflector = promotion / conflict resolution

### 5. 점진 도입이 가능해야 한다
파일 기반 저장으로 시작하고, 필요하면 DB/graph backend로 확장할 수 있어야 한다.

---

## 목표

### MVP 목표
1. execution 종료 시 Blackboard 일부를 persistent store에 저장
2. 다음 execution 시작 시 selected knowledge/context를 다시 주입
3. Observer 이벤트 일부를 TKG-friendly 형태로 projection 가능하게 준비
4. 기존 runtime/repair loop API를 깨지 않고 도입

### 비목표 (MVP에서는 하지 않음)
- multi-writer conflict resolution 완성
- manual review queue
- full production promotion pipeline
- graph database 의존성 도입
- distributed synchronization

---

## 제안 아키텍처

```text
┌──────────────────────────────────────────────┐
│              Workflow Execution              │
│                                              │
│  BlackboardManager  ←→  ExecutionObserver    │
│         ↓                    ↓               │
│   ReflectorEngine      Event stream          │
└─────────┬────────────────────┬───────────────┘
          │                    │
          ▼                    ▼
┌───────────────────┐   ┌──────────────────────┐
│ SharedMemoryStore │   │     TKGProjector     │
│                   │   │ (event → temp nodes) │
│ knowledge         │   └──────────┬───────────┘
│ decisions         │              ▼
│ context           │        StagingTKGStore
└─────────┬─────────┘
          ▼
   Project / Global scopes
```

---

## MVP 데이터 모델

### SharedMemoryStore

```ts
interface SharedMemoryStore {
  load(scope: MemoryScope): Promise<SharedMemorySnapshot | null>;
  save(scope: MemoryScope, snapshot: SharedMemorySnapshot): Promise<void>;
  merge?(scope: MemoryScope, snapshot: SharedMemorySnapshot): Promise<void>;
}

interface MemoryScope {
  level: "workflow" | "project" | "global";
  key: string;
}

interface SharedMemorySnapshot {
  knowledge: {
    facts: Array<{
      id: string;
      content: string;
      category: string;
      tags: string[];
      confidence: number;
      createdAt: string;
      sourceExecutionId?: string;
    }>;
  };
  decisions: {
    history: Array<{
      id: string;
      summary: string;
      createdAt: string;
      sourceExecutionId?: string;
    }>;
  };
  context: {
    projectFacts: Record<string, unknown>;
  };
}
```

### Blackboard export 대상

MVP에서는 아래만 persistent export 대상으로 잡는다.

- validation / repair 과정에서 축적된 knowledge facts
- reviewer / validator가 남긴 high-signal decisions
- 실행 간 다시 쓸 가치가 있는 context

export 제외:
- step timings
- transient output 전문
- 비용/중간 디버그 로그

---

## 단계별 구현 계획

### Phase 1 — Persistent Blackboard Snapshot

#### 구현
- `SharedMemoryStore` 인터페이스 추가
- 파일 기반 `FileSharedMemoryStore` 구현
- `BlackboardManager.exportPersistentSnapshot()` 추가
- execution_end 시 snapshot 저장
- execution_start 시 project/workflow scope 일부 import

#### 효과
- 세션 간 continuity 확보
- 실패 패턴/결정 이력 재사용 가능
- Reflector knowledge_store와 연결 가능

---

### Phase 2 — Scoped Memory Layer

#### 구현
- scope: `workflow`, `project`, `global`
- import 우선순위 정의
- merge policy 정의 (append-first, last-write-wins 최소 정책)

#### 효과
- 프로젝트 공통 맥락 유지
- workflow별 specialized memory 가능

---

### Phase 3 — Observer → TKG Projection

#### 구현
- `TKGProjector` 추가
- 아래 이벤트를 TemporalNode로 projection
  - `workflow.validation_failed`
  - `workflow.validation_passed`
  - `workflow.back_edge_triggered`
  - `workflow.repair_started`
  - `workflow.repair_completed`
- file-backed `StagingTKGStore`부터 시작

#### 효과
- 현재 이벤트를 TKG-friendly graph 형태로 재사용 가능
- 나중에 promotion / contradiction detection 기반 마련

---

### Phase 4 — Promotion / Conflict Resolution

#### 구현
- confidence threshold
- contradiction/version/confidence conflict 탐지
- manual review queue
- rollback snapshot

#### 효과
- 기존 `TKGReflector` 설계와 연결
- 진짜 long-term knowledge promotion 가능

---

## 현재 코드와 연결 포인트

### Blackboard
- 현재 `BlackboardManager`는 Runtime Blackboard를 래핑하고 있음
- 여기에 export/import adapter를 추가하는 것이 가장 안전함

### Observer
- 현재 `ExecutionObserver`는 이미 validation/back-edge/repair 이벤트를 수집함
- 이 이벤트 흐름에 `TKGProjector`를 병렬 구독자로 붙이면 됨

### Reflector
- 현재 `ReflectorEngine`은 repair-loop intervention용으로 유지
- Shared Memory snapshot은 `knowledgeStore`와 점진적으로 연결

---

## 리스크

### 1. 책임 혼합
Blackboard가 local runtime state와 global memory를 동시에 책임지기 시작하면 구조가 빠르게 꼬인다.

**대응:** store/projection layer를 별도 분리

### 2. noisy knowledge 축적
모든 facts를 저장하면 memory pollution이 발생한다.

**대응:** export whitelist / confidence threshold / category filter

### 3. premature TKG complexity
초기부터 graph promotion/conflict resolution까지 다 넣으면 속도가 떨어진다.

**대응:** projection → staging까지만 먼저 구현

---

## 결정

### 유지할 것
- 기존 `blackboard-memory-extension.md`
- 현재 Runtime Blackboard wrapping 구조
- 현재 ExecutionObserver / ReflectorEngine runtime integration

### 새로 추가할 것
- `SharedMemoryStore`
- Blackboard persistent snapshot export/import
- `TKGProjector`
- staged migration 문서

### 하지 않을 것
- 기존 장기 비전 문서 삭제
- 현재 runtime-safe 구조를 대체하는 전면 재설계

---

## 권장 다음 액션

1. `SharedMemoryStore` 인터페이스 정의
2. file-backed 구현 추가
3. `BlackboardManager.exportPersistentSnapshot()` / `importPersistentSnapshot()` 추가
4. execution_end / execution_start hook 연결
5. 그 다음 `TKGProjector` 착수
