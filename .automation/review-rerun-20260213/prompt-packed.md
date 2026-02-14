You are a strict final gate reviewer. Use ONLY the provided content below; do not call tools, do not delegate.

For each TASK (036,040,042b,042c,042), output exactly:
Score: <x.x>/10
P0: <count>
P1: <count>
Verdict: PASS|FAIL
Reasons: ...
Actions: ...

PASS only if score>=9.0 and P0=0 and P1=0.
End with summary table for all 5 tasks.

==== TASK DOCS ====


===== FILE: queue/TASK-036-agenda-management.md =====
# TASK-036: Blackboard Agenda Stream 정비

## 개요
- **상태**: ✅ 완료
- 우선순위: P1
- 예상 소요: 5시간
- 담당: 개발자
- **분류**: 재정의 필요 (board → blackboard)

## 재기준화 배경
기존 문서는 `packages/board` 내부 `AgendaManager` 구현을 전제로 작성되어 있었으나, 현재 P1 기준은 **blackboard-first**입니다. 따라서 안건(agenda)은 Board 도메인 객체가 아니라 Blackboard 상의 공유 상태/이벤트 스트림으로 먼저 정립합니다.

## 목표
`packages/blackboard`에 안건 엔티티/상태전이/이벤트 규약을 먼저 구현하여 이후 board 계층이 이를 소비하도록 SSOT를 맞춥니다.

## 구현 범위 (blackboard 우선)

### 1) 경로 재정의
- 기존: `packages/board/src/agenda/*`
- 변경: `packages/blackboard/src/domains/agenda/*`

예상 파일:
- `packages/blackboard/src/domains/agenda/types.ts`
- `packages/blackboard/src/domains/agenda/AgendaStore.ts`
- `packages/blackboard/src/domains/agenda/events.ts`
- `packages/blackboard/src/domains/agenda/index.ts`
- `packages/blackboard/test/domains/agenda/*.test.ts`

### 2) 핵심 책임
- Agenda 생성/수정/조회
- 상태 전이 규칙(DRAFT→PENDING→ACTIVE→COMPLETED 등)
- 우선순위/마감시간 필드 검증
- Blackboard EventBus와 도메인 이벤트 연결

### 3) 완료 기준
- [x] Agenda 타입/상태 전이 규칙이 `packages/blackboard`에 정의됨
- [x] CRUD + 상태전이 테스트 통과
- [x] 이벤트 이름 규약이 board/actor와 충돌 없이 문서화됨
- [x] 기존 `board` 용어가 blackboard 기반 용어로 정리됨

## 의존성
- 선행: TASK-019, TASK-020, TASK-023
- 후행: TASK-037, TASK-039

## SSOT / 참고
- [[../architecture/blackboard-actor-design|Blackboard + Actor 아키텍처]]
- [[TASK-019-blackboard-core|TASK-019]]
- [[TASK-020-event-bus|TASK-020]]

## 용어 정리
- **board 안건 관리** → **blackboard agenda domain**
- Board 패키지는 후속 오케스트레이션 계층으로 한정

## 야간 점검 로그 (2026-02-13)
- 점검 범위: blackboard-first 기준 TASK-036 agenda domain 회귀 점검
- 실행 테스트: `pnpm --filter @obora-kit/blackboard test -- test/domains/agenda`
- 결과: 통과 (1 file, 8 tests)
- 메모: 초기 오입력(`--runInBand`, 패키지 외부 경로 필터)은 vitest 옵션/경로 불일치로 실패했으며, 표준 명령으로 재검증 완료


===== FILE: queue/TASK-040-board-package.md =====
# TASK-040: Board 패키지 스캐폴딩

## 개요
- **상태**: 📋 대기
- 우선순위: P2
- 예상 소요: 3시간
- 담당: 개발자
- **분류**: 보류 (후속 단계 이동)

## 보류 사유
기존 TASK-040은 `packages/board` 전체 구조를 먼저 만드는 것을 목표로 했습니다. 하지만 현재는 blackboard-first 전환으로 인해 board 패키지의 공개 API가 아직 고정되지 않았고, 선행 도메인(TASK-036~039) 결과를 반영해야 합니다.

## 재정의 방향 (실행 시점: TASK-036~039 완료 후)
- `packages/board`는 도메인 구현이 아니라 **오케스트레이션/Facade 계층**으로 제한
- `@obora-kit/blackboard`의 agenda/voting/consensus/workflow를 조합
- 최소 엔트리(`src/index.ts`, `BoardFacade.ts`)부터 시작

## 잠정 완료 기준 (재개 시)
- [ ] board 패키지 엔트리 생성
- [ ] blackboard 도메인 의존만 허용 (중복 구현 금지)
- [ ] API 초안(예: `runMeeting`)이 blackboard 이벤트 모델과 정합성 확보

## 의존성
- 선행 필수: TASK-036, TASK-037, TASK-038, TASK-039

## SSOT / 참고
- [[../architecture/blackboard-actor-design|Blackboard + Actor 아키텍처]]

## 용어 정리
- `board package = 구현 본체` ❌
- `board package = orchestration/facade` ✅


===== FILE: docs/tasks/P1/TASK-042b-observer-reflector-mvp.md =====
# TASK-042b: Observer/Reflector MVP

## 개요
- **상태**: 🟡 조건부완료
- **우선순위**: P1
- **예상 소요**: 5시간
- **담당**: 개발자
- **의존성**: TASK-020, TASK-022, TASK-023, TASK-042a

## 목표
실시간 관찰(Observer)과 주기적 승격(Reflector)의 최소 동작을 구현합니다.

## 작업 범위
1. Observer MVP
   - Blackboard 이벤트 수신
   - 이벤트→TemporalNode 매핑
   - Staging 저장 + 임계치 검증
2. Reflector MVP
   - Staging 후보 조회
   - `IProductionPromotionPort` 경유 승격
   - 승격 결과 이벤트 발행
3. 최소 통합 테스트
   - observe → reflect → production query

## 완료 기준 (MVP)
- [x] Observer 기본 플로우 동작
- [x] Reflector가 direct write 없이 승격 API만 사용
- [x] `tkg.observer.*`, `tkg.reflector.*` 핵심 이벤트 발행
- [x] 통합 테스트 1개 이상 통과

## 제외 범위
- 복잡한 충돌 해결 자동화
- 롤백/배치 최적화
- 고급 guardrail 정책

## 참고
- [TASK-042 상위 문서](./TASK-042-tkg-observer-reflector.md)
- [TASK-042a](./TASK-042a-tkg-types-interface-mvp.md)
- [TASK-020](./TASK-020-event-bus.md)


## 재동기화 근거 (2026-02-13)
- 코드 변경: Observer/Reflector MVP 플로우 구현 (`ace01da`)
- 테스트: `pnpm --filter @obora-kit/blackboard test` 통과 (518/518, 2026-02-13)
- 2모델 리뷰: TASK-042b 전용 GLM+Codex 9점 이상 결과 파일 증빙 미확인
- 커밋: `ace01da`

## 2모델 게이트 재실행 (2026-02-13)
- 증빙 파일:
  - GLM: `/tmp/review-rerun-20260213/result-TASK-042b-glm.md`
  - Codex: `/tmp/review-rerun-20260213/result-TASK-042b-codex.md`
- 결과:
  - GLM: 검증불가, Gate FAIL(전용 2모델 9+ 증빙 부족)
  - Codex: 8.7/10, P0=0, P1=1(전용 2모델 9+ 증빙 부족), Gate FAIL
- 판정: **🟡 조건부완료 유지**

## 3모델 재실행 (2026-02-13 14:57 KST)
- 최소 수정: low-confidence reject/event, reflector lifecycle event 테스트 추가
- 테스트: `pnpm --filter @obora-kit/blackboard test -- test/domains/tkg/observer-reflector.test.ts` (5/5)
- Opus 4.6: 9.2/10 (PASS)
- Codex 5.3: 9.1/10 (PASS)
- GLM 5: opencode 안정 템플릿(pty+timeout+retry) 재시도했으나 출력 미완료(게이트 증빙 미확정)
- 판정: **🟡 조건부완료 유지** (잔여: GLM 9+ 점수 증빙)



===== FILE: docs/tasks/P1/TASK-042c-conflict-guardrail-advanced.md =====
# TASK-042c: Conflict/Guardrail 고도화

## 개요
- **상태**: 🟡 조건부완료
- **우선순위**: P1
- **예상 소요**: 4시간
- **담당**: 개발자
- **의존성**: TASK-042b

## 목표
MVP 이후 운영 안정성을 위한 충돌 처리 및 가드레일 고도화를 구현합니다.

## 작업 범위
1. Conflict Handler 고도화
   - 유형별 감지 규칙(contradiction/version/confidence)
   - 수동/자동 해결 정책
2. Guardrail 고도화
   - 배치 승격 기준
   - 상황별 임계치/예외 정책
3. 운영 기능
   - 롤백
   - 배치 승격 리포트
   - 충돌/승격 메트릭

## 완료 기준 (후속)
- [x] 충돌 감지/해결 E2E 시나리오 통과
- [x] defer/auto-resolve 정책 동작 검증
- [x] 롤백 1회 이상 검증
- [x] 문서화(운영 규칙, 장애 대응)

## 참고
- [TASK-042 상위 문서](./TASK-042-tkg-observer-reflector.md)
- [TASK-042b](./TASK-042b-observer-reflector-mvp.md)
- [Blackboard 시스템 스펙](../../spec/12-blackboard.md)


## 재동기화 근거 (2026-02-13)
- 코드 변경: conflict/guardrail 확장 로직 반영 (`ace01da`)
- 테스트: `pnpm --filter @obora-kit/blackboard test` 통과 (518/518, 2026-02-13)
- 2모델 리뷰: TASK-042c 전용 GLM+Codex 9점 이상 결과 파일 증빙 미확인
- 커밋: `ace01da`

## 2모델 게이트 재실행 (2026-02-13)
- 증빙 파일:
  - GLM: `/tmp/review-rerun-20260213/result-TASK-042c-glm.md`
  - Codex: `/tmp/review-rerun-20260213/result-TASK-042c-codex.md`
- 결과:
  - GLM: N/A, P0=0, P1=1(2모델 9+ 증빙 부족), Gate FAIL
  - Codex: 8.9/10, P0=0, P1=1(2모델 9+ 증빙 부족), Gate FAIL
- 판정: **🟡 조건부완료 유지**

## 3모델 재실행 (2026-02-13 14:57 KST)
- 최소 수정: version/confidence conflict 분기 테스트 강화 + rollback 검증 유지
- 테스트: `pnpm --filter @obora-kit/blackboard test -- test/domains/tkg/observer-reflector.test.ts` (5/5)
- Opus 4.6: 9.2/10 (PASS)
- Codex 5.3: 9.2/10 (PASS)
- GLM 5: opencode 안정 템플릿(pty+timeout+retry) 재시도했으나 출력 미완료(게이트 증빙 미확정)
- 판정: **🟡 조건부완료 유지** (잔여: GLM 9+ 점수 증빙)



===== FILE: docs/tasks/P1/TASK-042-tkg-observer-reflector.md =====
# TASK-042: TKG + Observer/Reflector 조건부 적용 (Phased Rollout)

## 개요
- **상태**: 🟡 조건부완료
- **우선순위**: P1
- **예상 소요**: 12시간 (MVP 8h + 후속 4h)
- **담당**: 개발자
- **의존성(선행 필수)**: TASK-020, TASK-022, TASK-023
- **의존성(권장)**: TASK-018, TASK-019

## 목표
Blackboard 메모리를 Temporal Knowledge Graph(TKG)로 확장하되, 한 번에 전부 구현하지 않고 **실행 가능한 3단계**로 분할합니다.

- 042a: 타입/인터페이스 정렬 (MVP)
- 042b: Observer/Reflector MVP (MVP)
- 042c: Conflict/Guardrail 고도화 (후속)

핵심은 아래 3가지를 문서 SSOT로 고정하는 것입니다.
1. MVP/후속 경계 명확화
2. 선행 의존성 현실화 (EventBus/패키지/테스트 우선)
3. 인터페이스 계약 충돌 해소 (Production readonly + 승격 API)

---

## 분할 실행안 (하위 태스크)

## 042a — 타입/인터페이스(MVP)
- 문서: [TASK-042a: TKG 타입/인터페이스 MVP](./TASK-042a-tkg-types-interface-mvp.md)
- 범위
  - `types/tkg.ts` 최소 타입 집합
  - `core/tkg.ts` 공통 조회 인터페이스
  - Production readonly 계약 + Promotion Port 계약 정의
  - 기존 knowledge API와의 최소 호환 레이어(타입 수준)
- 산출물
  - 컴파일 가능한 타입/인터페이스
  - 구현 전 계약(Contract) 확정

## 042b — Observer/Reflector MVP
- 문서: [TASK-042b: Observer/Reflector MVP](./TASK-042b-observer-reflector-mvp.md)
- 범위
  - Observer: 이벤트→Staging 기록
  - Reflector: Staging→Production 승격 (Promotion API 경유)
  - 최소 Guardrail(임계치) + 기본 이벤트 발행
  - 기본 통합 테스트(핵심 플로우 1개)
- 산출물
  - “관찰→승격→조회” MVP 동작

## 042c — Conflict/Guardrail/고도화
- 문서: [TASK-042c: conflict-guardrail-advanced](./TASK-042c-conflict-guardrail-advanced.md)
- 범위
  - 충돌 감지/해결 정책
  - 고급 Guardrail, 자동 규칙
  - 롤백/배치 승격/관측성 확장
- 산출물
  - 운영 안정성 기능

---

## MVP vs 후속 범위 (완료 기준 재작성)

### ✅ 필수(MVP, 042a+042b)
- [ ] `TemporalNode`, `TemporalEdge`, `GraphQuery`, `QueryResult` 타입 확정
- [ ] `StagingTKG`(write 가능), `ProductionTKG`(read only) 인터페이스 확정
- [ ] **`IProductionPromotionPort`(또는 동등 명칭) 추가**
  - [ ] `promoteNode`, `promoteEdge`, `promoteBatch` 제공
  - [ ] Reflector는 `production.nodes.set(...)` 직접 접근 금지
- [ ] Observer 기본 구현
  - [ ] Blackboard 이벤트를 Staging 노드로 변환
  - [ ] Staging 임계치 검증(최소 1개 룰)
- [ ] Reflector MVP 구현
  - [ ] Staging에서 승격 후보 추출
  - [ ] Promotion Port로만 Production 반영
  - [ ] 승격 성공/실패 이벤트 발행
- [ ] 통합 테스트 1개 이상
  - [ ] `observe -> staging -> reflect -> production query` 흐름 검증
- [ ] 문서 링크/의존성/계약 불일치 0건

### ⏭️ 후속(고도화, 042c)
- [ ] Conflict 유형 세분화 + 자동 해결 규칙
- [ ] 롤백/재시도/배치 전략
- [ ] 고급 Guardrail(문맥 기반, 히스토리 기반)
- [ ] 성능 최적화(인덱스/캐시)
- [ ] 상세 운영 메트릭/알람

---

## 의존성 정리 (현실 선행조건)

### 선행 필수
1. **TASK-020 Event Bus**: Observer/Reflector 이벤트 계약 기반
2. **TASK-022 Package 구성**: 모듈 경계/exports 정리 필요
3. **TASK-023 Tests**: MVP 통합 테스트 기반

### 선행 권장
4. **TASK-018 Schema**: 기본 타입 일관성 확보
5. **TASK-019 Core**: blackboard 섹션 접근 패턴 재사용

> 기존 문서의 `TASK-018, 019, 022`만으로는 테스트/이벤트 선행조건이 불충분하므로, **020/023을 필수로 승격**합니다.

---

## 인터페이스 계약 충돌 해소 (SSOT 반영)

기존 충돌:
- Production은 readonly여야 하나,
- Reflector 예시 코드에서 `target.nodes.set(...)` 직접 쓰기 수행

해결 원칙:
1. `ProductionTKG`는 모든 소비자에게 readonly 뷰만 제공
2. Reflector의 쓰기는 `IProductionPromotionPort`로만 수행
3. 승격 시 버전/유효기간/신뢰도 검증은 Promotion Port에서 원자적으로 수행

### 권장 계약(요약)
```ts
export interface ProductionTKG extends TemporalKnowledgeGraph {
  readonly nodes: ReadonlyMap<NodeId, TemporalNode>;
  readonly edges: ReadonlyMap<EdgeId, TemporalEdge>;
  getValidNodes(at?: Date): TemporalNode[];
  getValidEdges(at?: Date): TemporalEdge[];
}

export interface IProductionPromotionPort {
  promoteNode(node: TemporalNode, meta?: PromotionMeta): PromotionResult;
  promoteEdge(edge: TemporalEdge, meta?: PromotionMeta): PromotionResult;
  promoteBatch(payload: {
    nodes: TemporalNode[];
    edges: TemporalEdge[];
    meta?: PromotionMeta;
  }): MergeResult;
}
```

---

## 즉시 착수 순서 (실행 플랜)
1. 042a 시작: 타입/인터페이스 + Promotion Port 계약 확정
2. 042b 시작: Observer/Reflector MVP 구현
3. MVP 테스트 통과 후 042c로 확장

---

## 관련 문서 (SSOT 링크)
- [Blackboard 시스템 스펙](../../spec/12-blackboard.md)
- [TASK-020: Event Bus](./TASK-020-event-bus.md)
- [TASK-022: Blackboard Package](./TASK-022-blackboard-package.md)
- [TASK-023: Blackboard Tests](./TASK-023-blackboard-tests.md)
- [Blackboard + Actor 설계](../../architecture/blackboard-actor-design.md)

---

*문서 버전: 2.0*  
*수정일: 2026-02-13*  
*변경 요약: TASK-042를 042a/042b/042c로 분할, MVP 게이트 및 승격 API 계약 명문화*

## 재동기화 근거 (2026-02-13)
- 코드 변경: 상위 TASK 분할 하위 구현(042a/042b/042c) 반영, MVP 플로우 구현(`ace01da`)
- 테스트: `pnpm --filter @obora-kit/blackboard test` 통과 (518/518, 2026-02-13)
- 2모델 리뷰: 042a는 `/tmp/review-glm-042a-result.md`, `/tmp/review-codex-042a-result.md` 확인되나 042 전체 롤업 게이트 증빙은 미완
- 커밋: `ace01da`, `d8707c3`

## 2모델 게이트 재실행 (2026-02-13)
- 증빙 파일:
  - GLM: `/tmp/review-rerun-20260213/result-TASK-042-glm.md`
  - Codex: `/tmp/review-rerun-20260213/result-TASK-042-codex.md`
- 결과:
  - GLM: N/A, P0=0, P1=1(상위 롤업 증빙 불완), Gate FAIL
  - Codex: 8.7/10, P0=0, P1=1(상위 롤업 증빙 불완), Gate FAIL
- 판정: **🟡 조건부완료 유지**

## 3모델 재실행 (2026-02-13 14:57 KST)
- 하위(042b/042c) 테스트 강화 반영 후 롤업 재평가
- 테스트: tkg observer/reflector 5/5, board 5/5, agenda 8/8, agents 281/281
- Opus 4.6: 9.2/10 (PASS)
- Codex 5.3: 9.2/10 (PASS)
- GLM 5: opencode 안정 템플릿(pty+timeout+retry) 재시도했으나 출력 미완료(게이트 증빙 미확정)
- 판정: **🟡 조건부완료 유지** (잔여: GLM 9+ 점수 증빙)



===== FILE: packages/blackboard/src/domains/agenda/types.ts =====
import type { AgendaId } from '../../types';

export type AgendaStatus = 'draft' | 'pending' | 'active' | 'completed' | 'cancelled';

export interface Agenda {
  readonly id: AgendaId;
  readonly title: string;
  readonly description?: string;
  readonly priority: number;
  readonly dueAt?: Date;
  readonly status: AgendaStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateAgendaInput {
  id: AgendaId;
  title: string;
  description?: string;
  priority?: number;
  dueAt?: Date;
}

export interface UpdateAgendaInput {
  title?: string;
  description?: string | null;
  priority?: number;
  dueAt?: Date | null;
}

export const AGENDA_STATUS_TRANSITIONS: Record<AgendaStatus, AgendaStatus[]> = {
  draft: ['pending', 'cancelled'],
  pending: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};


===== FILE: packages/blackboard/src/domains/agenda/AgendaStore.ts =====
import type { EventBus } from '../../events';
import type { AgentId, AgendaId } from '../../types';
import {
  AGENDA_STATUS_TRANSITIONS,
  type Agenda,
  type AgendaStatus,
  type CreateAgendaInput,
  type UpdateAgendaInput,
} from './types';
import { createAgendaEventMeta, type AgendaDomainEvent } from './events';

export class AgendaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgendaValidationError';
  }
}

export class AgendaNotFoundError extends Error {
  constructor(id: AgendaId) {
    super(`Agenda not found: ${id}`);
    this.name = 'AgendaNotFoundError';
  }
}

export class AgendaTransitionError extends Error {
  constructor(from: AgendaStatus, to: AgendaStatus) {
    super(`Invalid agenda status transition: ${from} -> ${to}`);
    this.name = 'AgendaTransitionError';
  }
}

export interface AgendaStoreOptions {
  eventBus?: EventBus;
}

export class AgendaStore {
  private readonly agendas = new Map<AgendaId, Agenda>();

  constructor(private readonly options: AgendaStoreOptions = {}) {}

  private cloneAgenda(agenda: Agenda): Agenda {
    return {
      ...agenda,
      dueAt: agenda.dueAt ? new Date(agenda.dueAt.getTime()) : undefined,
      createdAt: new Date(agenda.createdAt.getTime()),
      updatedAt: new Date(agenda.updatedAt.getTime()),
    };
  }

  private getExisting(id: AgendaId): Agenda {
    const agenda = this.agendas.get(id);
    if (!agenda) {
      throw new AgendaNotFoundError(id);
    }
    return agenda;
  }

  private deepFreeze<T>(value: T): T {
    if (value === null || typeof value !== 'object') {
      return value;
    }

    const target = value as Record<string, unknown>;
    for (const nested of Object.values(target)) {
      this.deepFreeze(nested);
    }

    return Object.freeze(value);
  }

  create(input: CreateAgendaInput, source: AgentId | 'system' = 'system'): Agenda {
    this.validateCreateInput(input);
    if (this.agendas.has(input.id)) {
      throw new AgendaValidationError(`Agenda already exists: ${input.id}`);
    }

    const now = new Date();
    const agenda: Agenda = {
      id: input.id,
      title: input.title.trim(),
      description: input.description?.trim(),
      priority: input.priority ?? 3,
      dueAt: input.dueAt,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };

    this.agendas.set(agenda.id, this.cloneAgenda(agenda));
    this.emit({
      ...createAgendaEventMeta(source),
      type: 'agenda.created',
      payload: { agenda: this.cloneAgenda(agenda) },
    });
    return this.cloneAgenda(agenda);
  }

  getById(id: AgendaId): Agenda {
    return this.cloneAgenda(this.getExisting(id));
  }

  list(): Agenda[] {
    return [...this.agendas.values()]
      .map((agenda) => this.cloneAgenda(agenda))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  update(id: AgendaId, patch: UpdateAgendaInput, source: AgentId | 'system' = 'system'): Agenda {
    const previous = this.getExisting(id);
    this.validatePatchInput(patch);

    const nextDescription =
      patch.description === undefined
        ? previous.description
        : patch.description === null
          ? undefined
          : patch.description.trim();

    const nextDueAt =
      patch.dueAt === undefined
        ? previous.dueAt
        : patch.dueAt === null
          ? undefined
          : patch.dueAt;

    const current: Agenda = {
      ...previous,
      title: patch.title?.trim() ?? previous.title,
      description: nextDescription,
      priority: patch.priority ?? previous.priority,
      dueAt: nextDueAt,
      updatedAt: new Date(),
    };

    this.agendas.set(id, this.cloneAgenda(current));
    this.emit({
      ...createAgendaEventMeta(source),
      type: 'agenda.updated',
      payload: {
        agendaId: previous.id,
        previous: this.cloneAgenda(previous),
        current: this.cloneAgenda(current),
      },
    });

    return this.cloneAgenda(current);
  }

  transition(id: AgendaId, nextStatus: AgendaStatus, source: AgentId | 'system' = 'system'): Agenda {
    const agenda = this.getExisting(id);
    const allowed = AGENDA_STATUS_TRANSITIONS[agenda.status];
    if (!allowed.includes(nextStatus)) {
      throw new AgendaTransitionError(agenda.status, nextStatus);
    }

    const updated: Agenda = {
      ...agenda,
      status: nextStatus,
      updatedAt: new Date(),
    };

    this.agendas.set(id, this.cloneAgenda(updated));
    this.emit({
      ...createAgendaEventMeta(source),
      type: 'agenda.status.changed',
      payload: {
        agendaId: id,
        previousStatus: agenda.status,
        newStatus: nextStatus,
      },
    });

    return this.cloneAgenda(updated);
  }

  private emit(event: AgendaDomainEvent): void {
    this.options.eventBus?.emit(this.deepFreeze(event));
  }

  private validateCreateInput(input: CreateAgendaInput): void {
    if (!input.id) {
      throw new AgendaValidationError('Agenda id is required');
    }
    if (!input.title?.trim()) {
      throw new AgendaValidationError('Agenda title is required');
    }
    if (input.description !== undefined && !input.description.trim()) {
      throw new AgendaValidationError('Agenda description cannot be empty string');
    }
    if (input.priority !== undefined && (input.priority < 1 || input.priority > 5)) {
      throw new AgendaValidationError('Agenda priority must be between 1 and 5');
    }
    if (input.dueAt && Number.isNaN(input.dueAt.getTime())) {
      throw new AgendaValidationError('Agenda dueAt must be a valid Date');
    }
  }

  private validatePatchInput(patch: UpdateAgendaInput): void {
    if (patch.title !== undefined && !patch.title.trim()) {
      throw new AgendaValidationError('Agenda title cannot be empty');
    }
    if (patch.priority !== undefined && (patch.priority < 1 || patch.priority > 5)) {
      throw new AgendaValidationError('Agenda priority must be between 1 and 5');
    }
    if (patch.description !== undefined && patch.description !== null && !patch.description.trim()) {
      throw new AgendaValidationError('Agenda description cannot be empty string');
    }
    if (patch.dueAt && Number.isNaN(patch.dueAt.getTime())) {
      throw new AgendaValidationError('Agenda dueAt must be a valid Date');
    }
  }
}


===== FILE: packages/blackboard/src/domains/agenda/events.ts =====
import type { AgentId } from '../../types';
import type {
  AgendaCreatedDomainEvent,
  AgendaUpdatedDomainEvent,
  AgendaStatusChangedDomainEvent,
} from '../../events/types';

export type AgendaCreatedEvent = AgendaCreatedDomainEvent;
export type AgendaUpdatedEvent = AgendaUpdatedDomainEvent;
export type AgendaStatusChangedEvent = AgendaStatusChangedDomainEvent;

export type AgendaDomainEvent =
  | AgendaCreatedEvent
  | AgendaUpdatedEvent
  | AgendaStatusChangedEvent;

export const createAgendaEventMeta = (source: AgentId | 'system' = 'system') => ({
  id: `evt-agenda-${crypto.randomUUID()}`,
  timestamp: new Date(),
  source,
});


===== FILE: packages/blackboard/test/domains/agenda/agenda-store.test.ts =====
import { describe, expect, it } from 'vitest';

import { createAgendaId } from '../../../src/types';
import { EventBus } from '../../../src/events';
import {
  AgendaStore,
  AgendaTransitionError,
  AgendaValidationError,
} from '../../../src/domains/agenda';

describe('AgendaStore', () => {
  it('creates agenda with defaults', () => {
    const store = new AgendaStore();

    const agenda = store.create({
      id: createAgendaId('agenda-1'),
      title: '  Adopt blackboard-first policy  ',
    });

    expect(agenda.status).toBe('draft');
    expect(agenda.priority).toBe(3);
    expect(agenda.title).toBe('Adopt blackboard-first policy');
    expect(store.getById(agenda.id).id).toBe(agenda.id);
  });

  it('validates priority range', () => {
    const store = new AgendaStore();

    expect(() =>
      store.create({
        id: createAgendaId('agenda-2'),
        title: 'Invalid agenda',
        priority: 9,
      })
    ).toThrow(AgendaValidationError);
  });

  it('rejects empty description consistently on create', () => {
    const store = new AgendaStore();

    expect(() =>
      store.create({
        id: createAgendaId('agenda-2b'),
        title: 'Invalid description',
        description: '   ',
      })
    ).toThrow(AgendaValidationError);
  });

  it('enforces linear status transitions', () => {
    const store = new AgendaStore();
    const id = createAgendaId('agenda-3');

    store.create({ id, title: 'Status test' });
    store.transition(id, 'pending');
    store.transition(id, 'active');
    const completed = store.transition(id, 'completed');

    expect(completed.status).toBe('completed');
    expect(() => store.transition(id, 'pending')).toThrow(AgendaTransitionError);
  });

  it('emits agenda domain events via event bus', () => {
    const bus = new EventBus();
    const store = new AgendaStore({ eventBus: bus });
    const received: string[] = [];

    bus.subscribe('agenda.*', (event) => {
      received.push(event.type);
    });

    const id = createAgendaId('agenda-4');
    store.create({ id, title: 'Event test' });
    store.update(id, { description: 'updated' });
    store.transition(id, 'pending');

    expect(received).toEqual(['agenda.created', 'agenda.updated', 'agenda.status.changed']);
  });

  it('prevents external mutation through returned agenda objects', () => {
    const store = new AgendaStore();
    const id = createAgendaId('agenda-5');

    const created = store.create({ id, title: 'Immutable return' });
    (created as unknown as { title: string }).title = 'tampered';

    const persisted = store.getById(id);
    expect(persisted.title).toBe('Immutable return');
  });

  it('supports clearing optional fields explicitly', () => {
    const store = new AgendaStore();
    const id = createAgendaId('agenda-6');
    store.create({
      id,
      title: 'Clear fields',
      description: 'desc',
      dueAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    const updated = store.update(id, { description: null, dueAt: null });

    expect(updated.description).toBeUndefined();
    expect(updated.dueAt).toBeUndefined();
  });

  it('emits immutable event payload snapshots', () => {
    const bus = new EventBus();
    const store = new AgendaStore({ eventBus: bus });
    const id = createAgendaId('agenda-7');

    let mutationError: Error | undefined;
    bus.subscribe('agenda.created', (event) => {
      try {
        (event.payload.agenda as unknown as { title: string }).title = 'mutated-from-subscriber';
      } catch (error) {
        mutationError = error as Error;
      }
    });

    store.create({ id, title: 'Event snapshot' });

    expect(mutationError).toBeDefined();
    expect(store.getById(id).title).toBe('Event snapshot');
  });
});


===== FILE: packages/board/src/BoardFacade.ts =====
import {
  AgendaStore,
  VotingSessionStore,
  MeetingStateMachine,
  evaluateConsensus,
  createAgentId,
} from '@obora-kit/blackboard';
import type {
  Agenda,
  CreateAgendaInput,
  MeetingState,
  ConsensusResult,
  VotingSessionSnapshot,
  VotingPolicy,
} from '@obora-kit/blackboard';

export interface VoteInput {
  voterId: string;
  option: 'approve' | 'reject' | 'abstain';
  weight?: number;
}

export interface RunMeetingOptions {
  agendas: CreateAgendaInput[];
  quorum?: number;
  votingPolicy?: VotingPolicy | 'supermajority';
  supermajorityThreshold?: number;
  votesByAgendaId?: Record<string, VoteInput[]>;
}

export interface MeetingRunResult {
  finalState: MeetingState;
  consensusResults: ConsensusResult[];
  snapshots: VotingSessionSnapshot[];
}

function toVotingPolicy(policy: RunMeetingOptions['votingPolicy']): VotingPolicy {
  // VotingSessionStore supports majority|unanimous|weighted only.
  // supermajority is evaluated at consensus stage via threshold option.
  if (!policy || policy === 'supermajority') {
    return 'majority';
  }
  return policy;
}

export async function runMeeting(options: RunMeetingOptions): Promise<MeetingRunResult> {
  const machine = new MeetingStateMachine();
  const agendaStore = new AgendaStore();
  const votingStore = new VotingSessionStore();

  const policy = options.votingPolicy ?? 'majority';
  const sessionPolicy = toVotingPolicy(policy);
  const consensusResults: ConsensusResult[] = [];
  const snapshots: VotingSessionSnapshot[] = [];

  for (const agendaInput of options.agendas) {
    const agenda = agendaStore.create(agendaInput);
    machine.apply({ type: 'agenda.created', timestamp: new Date(), payload: { status: agenda.status } });

    agendaStore.transition(agenda.id, 'pending');
    agendaStore.transition(agenda.id, 'active');
    machine.apply({ type: 'agenda.status.changed', timestamp: new Date(), payload: { status: 'IN_PROGRESS' } });

    const session = votingStore.create({
      agendaId: agenda.id,
      policy: sessionPolicy,
      quorum: options.quorum ?? 1,
      createdBy: createAgentId('system'),
    });

    machine.apply({ type: 'decisions.voting.started', timestamp: new Date() });
    votingStore.open(session.id);

    for (const vote of options.votesByAgendaId?.[agenda.id] ?? []) {
      votingStore.addVote({
        sessionId: session.id,
        voterId: createAgentId(vote.voterId),
        option: vote.option,
        weight: vote.weight,
      });
    }

    votingStore.close(session.id);
    machine.apply({ type: 'decisions.voting.ended', timestamp: new Date() });

    const tally = votingStore.getTally(session.id);
    if (!tally) continue;

    const snapshot: VotingSessionSnapshot = {
      sessionId: session.id,
      policy: session.policy,
      tally,
    };
    snapshots.push(snapshot);

    const consensus = evaluateConsensus(snapshot, {
      method: policy,
      supermajorityThreshold: options.supermajorityThreshold,
      summary: `agenda:${agenda.id}`,
    });

    consensusResults.push(consensus);
    machine.apply(MeetingStateMachine.consensusEvent(consensus));
  }

  return {
    finalState: machine.getState(),
    consensusResults,
    snapshots,
  };
}

export class BoardFacade {
  private readonly agendaStore = new AgendaStore();
  private readonly votingStore = new VotingSessionStore();
  private readonly stateMachine = new MeetingStateMachine();

  createAgenda(input: CreateAgendaInput): Agenda {
    const agenda = this.agendaStore.create(input);
    this.stateMachine.apply({ type: 'agenda.created', timestamp: new Date() });
    return agenda;
  }

  listAgendas(): Agenda[] {
    return this.agendaStore.list();
  }

  startVoting(agendaId: string, policy: VotingPolicy, quorum = 1) {
    this.stateMachine.apply({ type: 'agenda.status.changed', timestamp: new Date(), payload: { status: 'IN_PROGRESS' } });
    const session = this.votingStore.create({
      agendaId,
      policy,
      quorum,
      createdBy: createAgentId('system'),
    });
    this.votingStore.open(session.id);
    this.stateMachine.apply({ type: 'decisions.voting.started', timestamp: new Date() });
    return session;
  }

  recordVote(sessionId: string, vote: VoteInput) {
    return this.votingStore.addVote({
      sessionId,
      voterId: createAgentId(vote.voterId),
      option: vote.option,
      weight: vote.weight,
    });
  }

  closeVoting(sessionId: string) {
    this.votingStore.close(sessionId);
    this.stateMachine.apply({ type: 'decisions.voting.ended', timestamp: new Date() });
  }

  computeConsensus(sessionId: string, method: RunMeetingOptions['votingPolicy'] = 'majority', supermajorityThreshold?: number) {
    const tally = this.votingStore.getTally(sessionId);
    const session = this.votingStore.get(sessionId);
    if (!tally || !session) {
      return undefined;
    }

    const result = evaluateConsensus(
      {
        sessionId: session.id,
        policy: session.policy,
        tally,
      },
      {
        method,
        supermajorityThreshold,
      },
    );

    this.stateMachine.apply(MeetingStateMachine.consensusEvent(result));
    return result;
  }

  getState(): MeetingState {
    return this.stateMachine.getState();
  }

  getMeetingSnapshot() {
    return this.stateMachine.toSnapshot();
  }
}


===== FILE: packages/board/test/BoardFacade.test.ts =====
import { describe, expect, it } from 'vitest';
import { BoardFacade, runMeeting } from '../src';

describe('BoardFacade', () => {
  it('creates agenda and moves workflow from idle', () => {
    const facade = new BoardFacade();
    expect(facade.getState()).toBe('idle');

    facade.createAgenda({ id: 'agenda-1', title: 'Kickoff' });

    expect(facade.getState()).toBe('agenda_setting');
  });

  it('supports vote -> consensus flow via facade APIs', () => {
    const facade = new BoardFacade();
    facade.createAgenda({ id: 'agenda-1', title: 'Kickoff' });

    const session = facade.startVoting('agenda-1', 'majority', 2);
    facade.recordVote(session.id, { voterId: 'a1', option: 'approve' });
    facade.recordVote(session.id, { voterId: 'a2', option: 'approve' });
    facade.closeVoting(session.id);

    const consensus = facade.computeConsensus(session.id, 'majority');
    expect(consensus?.approved).toBe(true);
    expect(facade.getState()).toBe('resolved');
  });

  it('runMeeting orchestrates blackboard domains', async () => {
    const result = await runMeeting({
      agendas: [{ id: 'agenda-1', title: 'A1' }],
      votingPolicy: 'supermajority',
      supermajorityThreshold: 0.66,
      votesByAgendaId: {
        'agenda-1': [
          { voterId: 'a1', option: 'approve' },
          { voterId: 'a2', option: 'approve' },
          { voterId: 'a3', option: 'reject' },
        ],
      },
    });

    expect(result.consensusResults).toHaveLength(1);
    expect(result.snapshots).toHaveLength(1);
    expect(result.finalState).toBe('resolved');
    expect(result.consensusResults[0]?.approved).toBe(true);
  });

  it('applies supermajority decision threshold at consensus step', async () => {
    const result = await runMeeting({
      agendas: [{ id: 'agenda-2', title: 'Threshold check' }],
      votingPolicy: 'supermajority',
      supermajorityThreshold: 0.8,
      votesByAgendaId: {
        'agenda-2': [
          { voterId: 'a1', option: 'approve' },
          { voterId: 'a2', option: 'approve' },
          { voterId: 'a3', option: 'reject' },
        ],
      },
    });

    expect(result.consensusResults[0]?.approved).toBe(false);
  });
});


===== FILE: packages/blackboard/src/domains/tkg/ObserverReflector.ts =====
import type { Event } from '../../events';
import { EventBus } from '../../events';
import { createAgentId } from '../../types';
import { createNodeId, type IProductionPromotionPort, type TemporalNode } from '../../types/tkg';
import type { InMemoryStagingTKG } from './InMemoryTKG';

export interface ObserverOptions {
  readonly stagingThreshold?: number;
}

export class TKGObserver {
  private readonly stagingThreshold: number;

  constructor(
    private readonly staging: InMemoryStagingTKG,
    private readonly eventBus = new EventBus(),
    options: ObserverOptions = {},
  ) {
    this.stagingThreshold = options.stagingThreshold ?? 0.3;
  }

  observe(event: Event): TemporalNode | null {
    const node = this.mapEventToNode(event);
    if (node.confidence < this.stagingThreshold) {
      this.eventBus.emit({
        id: `evt-tkg-observer-${crypto.randomUUID()}`,
        type: 'tkg.observer.validation.failed',
        source: 'system',
        timestamp: new Date(),
        payload: { nodeId: node.id, confidence: node.confidence },
      } as unknown as Event);
      return null;
    }

    this.staging.addNode(node);
    this.eventBus.emit({
      id: `evt-tkg-observer-${crypto.randomUUID()}`,
      type: 'tkg.observer.node.added',
      source: 'system',
      timestamp: new Date(),
      payload: { node },
    } as unknown as Event);

    return node;
  }

  private mapEventToNode(event: Event): TemporalNode {
    const timestamp = event.timestamp ?? new Date();
    const eventPayload = event as unknown as { payload?: unknown };
    return {
      id: createNodeId(`tkg-${event.id}`),
      type: 'fact',
      valid_from: timestamp,
      observed_at: timestamp,
      updated_at: timestamp,
      confidence: this.deriveConfidence(eventPayload.payload),
      source: event.source === 'system' ? createAgentId('system') : event.source,
      version: 1,
      tags: [event.type],
      data: {
        statement: event.type,
        verified: false,
        context: JSON.stringify(eventPayload.payload ?? {}),
      },
    };
  }

  private deriveConfidence(payload: unknown): number {
    if (!payload || typeof payload !== 'object') {
      return 0.5;
    }

    const maybeConfidence = (payload as { confidence?: unknown }).confidence;
    return typeof maybeConfidence === 'number' ? Math.max(0, Math.min(1, maybeConfidence)) : 0.7;
  }
}

export interface ReflectorOptions {
  readonly minConfidence?: number;
  readonly autoResolveConfidenceGap?: number;
}

export class TKGReflector {
  private readonly minConfidence: number;
  private readonly autoResolveConfidenceGap: number;

  constructor(private readonly eventBus = new EventBus(), options: ReflectorOptions = {}) {
    this.minConfidence = options.minConfidence ?? 0.7;
    this.autoResolveConfidenceGap = options.autoResolveConfidenceGap ?? 0.2;
  }

  reflect(staging: InMemoryStagingTKG, production: IProductionPromotionPort) {
    this.eventBus.emit({
      id: `evt-tkg-reflector-${crypto.randomUUID()}`,
      type: 'tkg.reflector.merge.started',
      source: 'system',
      timestamp: new Date(),
      payload: {},
    } as unknown as Event);

    const candidates = Array.from(staging.nodes.values());
    const nodes = candidates.filter((node) => node.confidence >= this.minConfidence);

    const mergeResult = production.promoteBatch({ nodes, edges: [], meta: { promotedBy: 'reflector' } });

    this.eventBus.emit({
      id: `evt-tkg-reflector-${crypto.randomUUID()}`,
      type: 'tkg.reflector.merge.completed',
      source: 'system',
      timestamp: new Date(),
      payload: mergeResult,
    } as unknown as Event);

    return mergeResult;
  }

  detectConflicts(nodes: readonly TemporalNode[]) {
    const conflicts: Array<{ left: TemporalNode; right: TemporalNode; type: 'contradiction' | 'version' | 'confidence' }> = [];

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const left = nodes[i];
        const right = nodes[j];
        const sameStatement =
          left.type === 'fact' &&
          right.type === 'fact' &&
          'statement' in left.data &&
          'statement' in right.data &&
          left.data.statement === right.data.statement;

        if (!sameStatement) continue;

        if (left.version !== right.version) {
          conflicts.push({ left, right, type: 'version' });
        } else if (Math.abs(left.confidence - right.confidence) > this.autoResolveConfidenceGap) {
          conflicts.push({ left, right, type: 'confidence' });
        } else {
          conflicts.push({ left, right, type: 'contradiction' });
        }
      }
    }

    return conflicts;
  }

  rollback(staging: InMemoryStagingTKG, mergeResultId?: string) {
    const timestamp = new Date();
    const rolledBack = Array.from(staging.nodes.values()).length;
    staging.nodes.clear();

    return {
      mergeResultId,
      rolledBack,
      timestamp,
    };
  }
}


===== FILE: packages/blackboard/src/domains/tkg/InMemoryTKG.ts =====
import type {
  EdgeId,
  GraphQuery,
  IProductionPromotionPort,
  MergeResult,
  NodeId,
  PromotionMeta,
  PromotionResult,
  QueryResult,
  TemporalEdge,
  TemporalNode,
  ValidationResult,
} from '../../types/tkg';
import type { ProductionTKG, StagingTKG } from '../../core/tkg';

class QueryableTKG {
  constructor(
    public readonly nodes: Map<NodeId, TemporalNode> = new Map(),
    public readonly edges: Map<EdgeId, TemporalEdge> = new Map(),
  ) {}

  queryCurrent(query: GraphQuery): QueryResult {
    return this.queryAtTime(query, new Date());
  }

  queryAtTime(query: GraphQuery, time = new Date()): QueryResult {
    const nodes = Array.from(this.nodes.values()).filter((node) => {
      if (query.nodeTypes && !query.nodeTypes.includes(node.type)) return false;
      if (query.nodeIds && !query.nodeIds.includes(node.id)) return false;
      if (query.tags && (!node.tags || !query.tags.every((tag) => node.tags?.includes(tag)))) return false;
      if (query.minConfidence !== undefined && node.confidence < query.minConfidence) return false;
      return node.valid_from <= time && (!node.valid_to || node.valid_to > time);
    });

    const nodeIdSet = new Set(nodes.map((node) => node.id));
    const edges = Array.from(this.edges.values()).filter((edge) => {
      if (query.edgeTypes && !query.edgeTypes.includes(edge.type)) return false;
      if (query.from && edge.from !== query.from) return false;
      if (query.to && edge.to !== query.to) return false;
      if (!nodeIdSet.has(edge.from) || !nodeIdSet.has(edge.to)) return false;
      return edge.valid_from <= time && (!edge.valid_to || edge.valid_to > time);
    });

    const confidenceValues = nodes.map((node) => node.confidence);
    const min = confidenceValues.length > 0 ? Math.min(...confidenceValues) : 0;
    const max = confidenceValues.length > 0 ? Math.max(...confidenceValues) : 0;

    return {
      nodes,
      edges,
      metadata: {
        queryTime: time,
        resultCount: nodes.length,
        confidenceRange: [min, max] as const,
      },
    };
  }

  queryTimeRange(query: GraphQuery, from: Date, to: Date): readonly QueryResult[] {
    return [this.queryAtTime(query, from), this.queryAtTime(query, to)];
  }

  queryByConfidence(query: GraphQuery, minConfidence: number): QueryResult {
    return this.queryCurrent({ ...query, minConfidence });
  }
}

export class InMemoryStagingTKG extends QueryableTKG implements StagingTKG {
  addNode(node: TemporalNode): NodeId {
    this.nodes.set(node.id, node);
    return node.id;
  }

  addEdge(edge: TemporalEdge): EdgeId {
    this.edges.set(edge.id, edge);
    return edge.id;
  }

  validateNode(node: TemporalNode): ValidationResult {
    const errors = [];
    if (node.confidence < 0 || node.confidence > 1) {
      errors.push({ field: 'confidence', message: 'confidence must be 0..1', code: 'RANGE' });
    }

    return { valid: errors.length === 0, errors, warnings: [] };
  }

  validateEdge(edge: TemporalEdge): ValidationResult {
    const errors = [];
    if (edge.confidence < 0 || edge.confidence > 1) {
      errors.push({ field: 'confidence', message: 'confidence must be 0..1', code: 'RANGE' });
    }

    return { valid: errors.length === 0, errors, warnings: [] };
  }
}

export class InMemoryProductionTKG extends QueryableTKG implements ProductionTKG, IProductionPromotionPort {
  getValidNodes(at = new Date()): readonly TemporalNode[] {
    return this.queryAtTime({}, at).nodes;
  }

  getValidEdges(at = new Date()): readonly TemporalEdge[] {
    return this.queryAtTime({}, at).edges;
  }

  promoteNode(node: TemporalNode, _meta?: PromotionMeta): PromotionResult {
    this.nodes.set(node.id, node);
    return { nodeId: node.id, success: true, timestamp: new Date() };
  }

  promoteEdge(edge: TemporalEdge, _meta?: PromotionMeta): PromotionResult {
    this.edges.set(edge.id, edge);
    return { nodeId: edge.from, success: true, timestamp: new Date() };
  }

  promoteBatch(payload: {
    nodes: readonly TemporalNode[];
    edges: readonly TemporalEdge[];
    meta?: PromotionMeta;
  }): MergeResult {
    payload.nodes.forEach((node) => this.nodes.set(node.id, node));
    payload.edges.forEach((edge) => this.edges.set(edge.id, edge));
    return {
      mergeId: crypto.randomUUID(),
      timestamp: new Date(),
      nodesPromoted: payload.nodes.length,
      nodesSkipped: 0,
      nodesFailed: 0,
      edgesPromoted: payload.edges.length,
      edgesSkipped: 0,
      conflicts: [],
      duration: 0,
    };
  }
}


===== FILE: packages/blackboard/src/types/tkg.ts =====
/**
 * @module types/tkg
 * @description Temporal Knowledge Graph(TKG) 타입/계약 (spec/12 정렬)
 */

import type { AgentId } from './base';

/** TKG 노드 ID */
export type NodeId = string & { readonly __brand: 'NodeId' };

/** TKG 엣지 ID */
export type EdgeId = string & { readonly __brand: 'EdgeId' };

/** 노드 ID 생성기 */
export function createNodeId(id: string): NodeId {
  if (id.trim().length === 0) {
    throw new Error('NodeId must be a non-empty string');
  }
  return id as NodeId;
}

/** 엣지 ID 생성기 */
export function createEdgeId(id: string): EdgeId {
  if (id.trim().length === 0) {
    throw new Error('EdgeId must be a non-empty string');
  }
  return id as EdgeId;
}

/** 노드 종류 */
export type TemporalNodeType = 'entity' | 'fact' | 'decision' | 'task' | 'pattern';

/** 엣지 종류 */
export type EdgeType =
  | 'relates_to' | 'part_of' | 'contains'
  | 'supports' | 'contradicts' | 'explains' | 'based_on'
  | 'decided_by' | 'decided_on' | 'leads_to'
  | 'assigned_to' | 'depends_on' | 'blocks' | 'precedes'
  | 'exemplifies' | 'generalizes' | 'specializes';

export interface EntityData {
  readonly name: string;
  readonly entityType: 'agent' | 'task' | 'resource' | 'concept';
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface FactData {
  readonly statement: string;
  readonly context?: string;
  readonly evidence?: readonly NodeId[];
  readonly verified: boolean;
}

export interface DecisionData {
  readonly agendaId: string;
  readonly outcome: 'approve' | 'reject' | 'deferred';
  readonly reason: string;
  readonly participants: readonly AgentId[];
}

export interface TaskData {
  readonly description: string;
  readonly status: 'pending' | 'running' | 'completed' | 'failed';
  readonly assignedTo?: AgentId;
  readonly result?: unknown;
}

export interface PatternData {
  readonly description: string;
  readonly frequency: number;
  readonly examples: readonly string[];
  readonly accuracy?: number;
}

export type NodeData = EntityData | FactData | DecisionData | TaskData | PatternData;

/**
 * 시간축을 가진 TKG 노드
 */
export interface TemporalNode {
  readonly id: NodeId;
  readonly type: TemporalNodeType;
  readonly valid_from: Date;
  readonly valid_to?: Date;
  readonly observed_at: Date;
  readonly updated_at: Date;
  readonly confidence: number;
  readonly source: AgentId;
  readonly version: number;
  readonly tags?: readonly string[];
  readonly data: NodeData;
}

/**
 * 시간축을 가진 TKG 엣지
 */
export interface TemporalEdge {
  readonly id: EdgeId;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly type: EdgeType;
  readonly valid_from: Date;
  readonly valid_to?: Date;
  readonly observed_at: Date;
  readonly confidence: number;
  readonly source: AgentId;
  readonly weight?: number;
}

/**
 * TKG 조회 쿼리
 */
export interface GraphQuery {
  readonly nodeTypes?: readonly TemporalNodeType[];
  readonly nodeIds?: readonly NodeId[];
  readonly tags?: readonly string[];
  readonly minConfidence?: number;
  readonly edgeTypes?: readonly EdgeType[];
  readonly from?: NodeId;
  readonly to?: NodeId;
  readonly depth?: number;
}

/**
 * TKG 조회 결과
 */
export interface QueryResult {
  readonly nodes: readonly TemporalNode[];
  readonly edges: readonly TemporalEdge[];
  readonly metadata: {
    readonly queryTime: Date;
    readonly resultCount: number;
    readonly confidenceRange: readonly [number, number];
  };
}

export interface ValidationError {
  readonly field: string;
  readonly message: string;
  readonly code: string;
}

export interface ValidationWarning {
  readonly field: string;
  readonly message: string;
  readonly code: string;
}

/**
 * 유효성 검사 결과
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationWarning[];
}

export type ConflictResolution =
  | 'pending'
  | 'supersedes'
  | 'higher_confidence'
  | 'merge'
  | 'discard'
  | 'soft_delete';

export interface Conflict {
  readonly id: string;
  readonly type: 'version' | 'contradiction' | 'supersedes' | 'confidence';
  readonly nodes: readonly [TemporalNode, TemporalNode];
  readonly detectedAt: Date;
  readonly status: 'pending' | 'resolved' | 'deferred';
  readonly resolution?: ConflictResolution;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * 승격(Promotion) 메타데이터
 */
export interface PromotionMeta {
  readonly promotedBy?: string;
  readonly reason?: string;
  readonly promotedAt?: Date;
}

/**
 * 개별 승격 결과
 */
export interface PromotionResult {
  readonly nodeId: NodeId;
  readonly success: boolean;
  readonly timestamp: Date;
  readonly reason?: string;
  readonly conflict?: Conflict;
}

/**
 * 병합 옵션
 */
export interface ReflectionOptions {
  readonly minConfidence?: number;
  readonly resolveConflicts?: boolean;
  readonly softDeleteOnConflict?: boolean;
  readonly maxAge?: number;
}

/**
 * Staging/Production 병합 결과
 */
export interface MergeResult {
  readonly mergeId: string;
  readonly timestamp: Date;
  readonly nodesPromoted: number;
  readonly nodesSkipped: number;
  readonly nodesFailed: number;
  readonly edgesPromoted: number;
  readonly edgesSkipped: number;
  readonly conflicts: readonly Conflict[];
  readonly duration: number;
}

/**
 * Production 승격 전용 Port 계약.
 * Reflector는 ProductionTKG 내부 맵에 직접 쓰지 않고 반드시 이 포트를 사용해야 합니다.
 */
export interface IProductionPromotionPort {
  promoteNode(node: TemporalNode, meta?: PromotionMeta): PromotionResult;
  promoteEdge(edge: TemporalEdge, meta?: PromotionMeta): PromotionResult;
  promoteBatch(payload: {
    nodes: readonly TemporalNode[];
    edges: readonly TemporalEdge[];
    meta?: PromotionMeta;
  }): MergeResult;
}


===== FILE: packages/blackboard/src/core/tkg.ts =====
/**
 * @module core/tkg
 * @description TKG 인터페이스 계약 (MVP)
 */

import type {
  EdgeId,
  GraphQuery,
  IProductionPromotionPort,
  MergeResult,
  NodeId,
  QueryResult,
  ReflectionOptions,
  TemporalEdge,
  TemporalNode,
  ValidationResult,
} from '../types/tkg';

/**
 * Temporal Knowledge Graph 공통 조회 계약
 */
export interface TemporalKnowledgeGraph {
  readonly nodes: ReadonlyMap<NodeId, TemporalNode>;
  readonly edges: ReadonlyMap<EdgeId, TemporalEdge>;
  queryAtTime(query: GraphQuery, time?: Date): QueryResult;
  queryCurrent(query: GraphQuery): QueryResult;
  queryTimeRange(query: GraphQuery, from: Date, to: Date): readonly QueryResult[];
  queryByConfidence(query: GraphQuery, minConfidence: number): QueryResult;
}

/**
 * Observer 전용 Staging 계약 (쓰기 허용)
 */
export interface StagingTKG extends TemporalKnowledgeGraph {
  addNode(node: TemporalNode): NodeId;
  addEdge(edge: TemporalEdge): EdgeId;
  validateNode(node: TemporalNode): ValidationResult;
  validateEdge(edge: TemporalEdge): ValidationResult;
}

/**
 * Reflector 조회 대상 Production 계약 (읽기 전용)
 *
 * - 외부 소비자는 ReadonlyMap 뷰만 접근 가능
 * - 쓰기는 IProductionPromotionPort를 통해서만 허용
 */
export interface ProductionTKG extends TemporalKnowledgeGraph {
  readonly nodes: ReadonlyMap<NodeId, TemporalNode>;
  readonly edges: ReadonlyMap<EdgeId, TemporalEdge>;
  getValidNodes(at?: Date): readonly TemporalNode[];
  getValidEdges(at?: Date): readonly TemporalEdge[];
}

/**
 * Reflector용 조합 타입.
 *
 * Production 조회는 ProductionTKG, 변경은 승격 포트로 분리하여
 * "Production readonly + Promotion Port" 계약을 타입 수준에서 고정합니다.
 */
export type PromotableProductionTKG = ProductionTKG & IProductionPromotionPort;

/**
 * Reflector 병합 최소 계약
 */
export interface IReflector {
  reflect(
    source: StagingTKG,
    target: IProductionPromotionPort,
    options?: ReflectionOptions,
  ): MergeResult;
}


===== FILE: packages/blackboard/test/domains/tkg/observer-reflector.test.ts =====
import { describe, expect, it } from 'vitest';
import { createNodeId } from '../../../src/types/tkg';
import { EventBus } from '../../../src/events';
import { InMemoryProductionTKG, InMemoryStagingTKG, TKGObserver, TKGReflector } from '../../../src/domains/tkg';

describe('TKG Observer/Reflector', () => {
  it('observe -> reflect -> production query', () => {
    const staging = new InMemoryStagingTKG();
    const production = new InMemoryProductionTKG();
    const eventBus = new EventBus();
    const observer = new TKGObserver(staging, eventBus);
    const reflector = new TKGReflector(eventBus);

    observer.observe({
      id: 'evt-1',
      type: 'knowledge.fact.added',
      timestamp: new Date(),
      source: 'system',
      payload: { confidence: 0.9, statement: 'alpha' },
    } as never);

    const result = reflector.reflect(staging, production);

    expect(result.nodesPromoted).toBe(1);
    expect(production.queryCurrent({}).nodes).toHaveLength(1);
  });

  it('rejects low-confidence candidate and emits validation event', () => {
    const staging = new InMemoryStagingTKG();
    const eventBus = new EventBus();
    const observer = new TKGObserver(staging, eventBus, { stagingThreshold: 0.6 });
    const received: string[] = [];

    eventBus.subscribe('tkg.observer.*', (event) => {
      received.push(event.type);
    });

    const node = observer.observe({
      id: 'evt-low',
      type: 'knowledge.fact.added',
      timestamp: new Date(),
      source: 'system',
      payload: { confidence: 0.4, statement: 'low confidence' },
    } as never);

    expect(node).toBeNull();
    expect(staging.queryCurrent({}).nodes).toHaveLength(0);
    expect(received).toContain('tkg.observer.validation.failed');
  });

  it('emits reflector lifecycle events during merge', () => {
    const staging = new InMemoryStagingTKG();
    const production = new InMemoryProductionTKG();
    const eventBus = new EventBus();
    const observer = new TKGObserver(staging, eventBus);
    const reflector = new TKGReflector(eventBus);
    const received: string[] = [];

    eventBus.subscribe('tkg.reflector.*', (event) => {
      received.push(event.type);
    });

    observer.observe({
      id: 'evt-2',
      type: 'knowledge.fact.added',
      timestamp: new Date(),
      source: 'system',
      payload: { confidence: 0.95, statement: 'beta' },
    } as never);

    reflector.reflect(staging, production);

    expect(received).toContain('tkg.reflector.merge.started');
    expect(received).toContain('tkg.reflector.merge.completed');
  });

  it('detects conflicts and supports rollback', () => {
    const staging = new InMemoryStagingTKG();
    const reflector = new TKGReflector();

    const now = new Date();
    staging.addNode({
      id: createNodeId('n-1'),
      type: 'fact',
      valid_from: now,
      observed_at: now,
      updated_at: now,
      confidence: 0.9,
      source: 'system',
      version: 1,
      data: { statement: 'same', verified: false },
    });

    staging.addNode({
      id: createNodeId('n-2'),
      type: 'fact',
      valid_from: now,
      observed_at: now,
      updated_at: now,
      confidence: 0.5,
      source: 'system',
      version: 1,
      data: { statement: 'same', verified: false },
    });

    const conflicts = reflector.detectConflicts(Array.from(staging.nodes.values()));
    const rollbackResult = reflector.rollback(staging, 'merge-1');

    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0]?.type).toBe('confidence');
    expect(rollbackResult.rolledBack).toBe(2);
    expect(staging.queryCurrent({}).nodes).toHaveLength(0);
  });

  it('detects version conflicts when statement matches but versions differ', () => {
    const staging = new InMemoryStagingTKG();
    const reflector = new TKGReflector();
    const now = new Date();

    staging.addNode({
      id: createNodeId('v-1'),
      type: 'fact',
      valid_from: now,
      observed_at: now,
      updated_at: now,
      confidence: 0.8,
      source: 'system',
      version: 1,
      data: { statement: 'same', verified: false },
    });

    staging.addNode({
      id: createNodeId('v-2'),
      type: 'fact',
      valid_from: now,
      observed_at: now,
      updated_at: now,
      confidence: 0.75,
      source: 'system',
      version: 2,
      data: { statement: 'same', verified: false },
    });

    const conflicts = reflector.detectConflicts(Array.from(staging.nodes.values()));
    expect(conflicts[0]?.type).toBe('version');
  });
});
