# TASK-042: TKG + Observer/Reflector 패턴 구현

## 개요
- **상태**: 📝 드래프트
- **우선순위**: P1
- **예상 소요**: 8시간
- **담당**: 개발자
- **의존성**: TASK-018, TASK-019, TASK-022

## 목표
Blackboard 메모리를 Temporal Knowledge Graph(TKG)로 확장하고, Observer/Reflector 패턴을 통해 안정적인 장기 메모리 시스템을 구현합니다. 실시간 관찰(Staging)와 주기적 병합(Production)의 분리를 통해 데이터 일관성과 품질을 보장합니다.

---

## 작업 내용

### 1. TKG 스키마 구현 (`src/types/tkg.ts`)

#### Temporal 노드/엣지 타입
```typescript
/**
 * Temporal Knowledge Graph 노드
 * @description 시간 기반 메타데이터가 포함된 그래프 노드
 */
export interface TemporalNode {
  /** 노드 고유 ID */
  id: NodeId;
  /** 노드 타입 */
  type: 'entity' | 'fact' | 'decision' | 'task' | 'pattern';

  // Temporal 필드
  /** 유효 시작 시간 */
  valid_from: Date;
  /** 유효 종료 시간 (null = 현재 유효) */
  valid_to?: Date;
  /** 관찰/생성 시간 */
  observed_at: Date;
  /** 마지막 업데이트 시간 */
  updated_at: Date;
  /** 신뢰도 (0.0 ~ 1.0) */
  confidence: number;

  // 메타데이터
  /** 생성자 에이전트 */
  source: AgentId;
  /** 버전 번호 */
  version: number;
  /** 태그 */
  tags?: string[];

  /** 확장 데이터 */
  data: NodeData;
}

/**
 * Temporal Knowledge Graph 엣지
 * @description 노드 간의 시간 기반 관계
 */
export interface TemporalEdge {
  /** 엣지 고유 ID */
  id: EdgeId;
  /** 출발 노드 ID */
  from: NodeId;
  /** 도착 노드 ID */
  to: NodeId;
  /** 관계 타입 */
  type: EdgeType;

  // Temporal 필드
  valid_from: Date;
  valid_to?: Date;
  observed_at: Date;
  confidence: number;

  // 메타데이터
  source: AgentId;
  /** 관계 가중치 */
  weight?: number;
}

/**
 * 노드 데이터 유형
 */
export type NodeData =
  | EntityData
  | FactData
  | DecisionData
  | TaskData
  | PatternData;

/**
 * 엣지 타입
 */
export type EdgeType =
  // Entity 관계
  | 'relates_to' | 'part_of' | 'contains'
  // Fact 관계
  | 'supports' | 'contradicts' | 'explains' | 'based_on'
  // Decision 관계
  | 'decided_by' | 'decided_on' | 'leads_to'
  // Task 관계
  | 'assigned_to' | 'depends_on' | 'blocks' | 'precedes'
  // Pattern 관계
  | 'exemplifies' | 'generalizes' | 'specializes';

/**
 * 엔티티 데이터
 */
export interface EntityData {
  name: string;
  entityType: 'agent' | 'task' | 'resource' | 'concept';
  attributes: Record<string, unknown>;
}

/**
 * 사실 데이터
 */
export interface FactData {
  statement: string;
  context?: string;
  evidence?: NodeId[];
  verified: boolean;
}

/**
 * 결정 데이터
 */
export interface DecisionData {
  agendaId: string;
  outcome: 'approve' | 'reject' | 'deferred';
  reason: string;
  participants: AgentId[];
}

/**
 * 작업 데이터
 */
export interface TaskData {
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  assignedTo?: AgentId;
  result?: unknown;
}

/**
 * 패턴 데이터
 */
export interface PatternData {
  description: string;
  frequency: number;
  examples: string[];
  accuracy?: number;
}

/**
 * 노드 ID (브랜드 타입)
 */
export type NodeId = string & { readonly __brand: 'NodeId' };

/**
 * 엣지 ID (브랜드 타입)
 */
export type EdgeId = string & { readonly __brand: 'EdgeId' };

/**
 * ID 생성 함수
 */
export function createNodeId(id: string): NodeId;
export function createEdgeId(id: string): EdgeId;
```

#### 그래프 쿼리 타입
```typescript
/**
 * 그래프 쿼리 옵션
 */
export interface GraphQuery {
  // 노드 필터
  nodeTypes?: ('entity' | 'fact' | 'decision' | 'task' | 'pattern')[];
  nodeIds?: NodeId[];
  tags?: string[];
  minConfidence?: number;

  // 엣지 필터
  edgeTypes?: EdgeType[];
  from?: NodeId;
  to?: NodeId;

  // 범위
  depth?: number; // 탐색 깊이
}

/**
 * 쿼리 결과
 */
export interface QueryResult {
  nodes: TemporalNode[];
  edges: TemporalEdge[];
  metadata: {
    queryTime: Date;
    resultCount: number;
    confidenceRange: [number, number];
  };
}
```

### 2. TKG 인터페이스 구현 (`src/core/tkg.ts`)

#### 공통 인터페이스
```typescript
/**
 * Temporal Knowledge Graph 공통 인터페이스
 */
export interface TemporalKnowledgeGraph {
  /** 노드 저장소 */
  nodes: Map<NodeId, TemporalNode>;
  /** 엣지 저장소 */
  edges: Map<EdgeId, TemporalEdge>;

  // Temporal 쿼리
  /** 특정 시점 상태 쿼리 */
  queryAtTime(query: GraphQuery, time?: Date): QueryResult;
  /** 현재 상태 쿼리 */
  queryCurrent(query: GraphQuery): QueryResult;

  // 범위 쿼리
  /** 시간 범위 쿼리 */
  queryTimeRange(
    query: GraphQuery,
    from: Date,
    to: Date
  ): QueryResult[];

  // 신뢰도 필터
  /** 신뢰도 필터링 쿼리 */
  queryByConfidence(
    query: GraphQuery,
    minConfidence: number
  ): QueryResult;
}
```

#### Staging TKG (Observer 전용)
```typescript
/**
 * Staging Temporal Knowledge Graph (Observer 전용)
 * @description 실시간 쓰기가 가능한 임시 그래프
 */
export interface StagingTKG extends TemporalKnowledgeGraph {
  // 쓰기 작업 (Observer만 접근)
  /** 노드 추가 */
  addNode(node: TemporalNode): NodeId;
  /** 엣지 추가 */
  addEdge(edge: TemporalEdge): EdgeId;

  // 일시적 유효성 검증
  /** 노드 검증 */
  validateNode(node: TemporalNode): ValidationResult;
  /** 엣지 검증 */
  validateEdge(edge: TemporalEdge): ValidationResult;
}
```

#### Production TKG (Reflector 전용)
```typescript
/**
 * Production Temporal Knowledge Graph (Reflector 전용)
 * @description 읽기 전용 안정 그래프
 */
export interface ProductionTKG extends TemporalKnowledgeGraph {
  // 읽기 전용
  readonly nodes: Map<NodeId, TemporalNode>;
  readonly edges: Map<EdgeId, TemporalEdge>;

  // 검증된 노드만 접근
  /** 유효한 노드 목록 */
  getValidNodes(at?: Date): TemporalNode[];
  /** 유효한 엣지 목록 */
  getValidEdges(at?: Date): TemporalEdge[];
}
```

### 3. Observer 구현 (`src/core/observer.ts`)

```typescript
/**
 * Observer 인터페이스
 * @description Blackboard 이벤트를 실시간 관찰하여 Staging TKG에 기록
 */
export interface IObserver {
  // 이벤트 관찰
  /** 이벤트 관찰 */
  observe(event: BlackboardEvent): void;

  // 노드/엣지 추가 (Staging)
  /** 노드 추가 */
  addNode(node: TemporalNode): NodeId;
  /** 엣지 추가 */
  addEdge(edge: TemporalEdge): EdgeId;

  // Staging 쿼리
  /** Staging 쿼리 */
  queryStaging(query: GraphQuery): QueryResult;
  /** Staging 노드 조회 */
  getStagingNode(nodeId: NodeId): TemporalNode | undefined;

  // 검증
  /** 노드 검증 */
  validateNode(node: TemporalNode): ValidationResult;
  /** 엣지 검증 */
  validateEdge(edge: TemporalEdge): ValidationResult;

  // 일괄 관찰
  /** 일괄 관찰 */
  observeBatch(events: BlackboardEvent[]): BatchResult;
}

/**
 * Observer 구현체
 */
export class Observer implements IObserver {
  constructor(
    private staging: StagingTKG,
    private guardrail: IConfidenceGuardrail,
    private eventBus: IEventBus
  ) {}

  observe(event: BlackboardEvent): void {
    // 이벤트를 노드로 변환
    const node = this.mapEventToNode(event);

    // 신뢰도 검증
    if (!this.guardrail.check(node, 'staging')) {
      this.eventBus.publish({
        type: EventType.TKG_OBSERVER_VALIDATION_FAILED,
        source: 'observer',
        timestamp: new Date(),
        payload: { node, reason: 'Confidence below threshold' },
      });
      return;
    }

    // Staging에 기록
    this.staging.addNode(node);

    // 이벤트 발행
    this.eventBus.publish({
      type: EventType.TKG_OBSERVER_NODE_ADDED,
      source: 'observer',
      timestamp: new Date(),
      payload: { node },
    });
  }

  // ... 나머지 메서드 구현
}
```

### 4. Reflector 구현 (`src/core/reflector.ts`)

```typescript
/**
 * Reflector 인터페이스
 * @description Staging TKG → Production TKG 병합
 */
export interface IReflector {
  // 병합 (Staging → Production)
  /** 병합 */
  reflect(
    source: StagingTKG,
    target: ProductionTKG,
    options?: ReflectionOptions
  ): MergeResult;

  // 승격 (개별 노드)
  /** 노드 승격 */
  promote(nodeId: NodeId, reason?: string): PromotionResult;
  /** 일괄 승격 */
  promoteBatch(nodeIds: NodeId[]): PromotionResult[];

  // 충돌 해결
  /** 충돌 감지 */
  detectConflicts(): Conflict[];
  /** 충돌 해결 */
  resolveConflict(
    conflictId: string,
    resolution: ConflictResolution,
    metadata?: Record<string, unknown>
  ): void;
  /** 대기 중 충돌 */
  getPendingConflicts(): Conflict[];
  /** 해결된 충돌 */
  getResolvedConflicts(): Conflict[];

  // 일일 승격 (안정화된 노드)
  /** 안정화된 노드 승격 */
  promoteStableNodes(criteria?: StabilityCriteria): PromotionResult[];

  // 롤백
  /** 병합 롤백 */
  rollbackMerge(mergeId: string): void;
}

/**
 * 병합 옵션
 */
export interface ReflectionOptions {
  /** 최소 신뢰도 (기본: 0.7) */
  minConfidence?: number;
  /** 충돌 자동 해결 (기본: false) */
  resolveConflicts?: boolean;
  /** 충돌 시 soft delete (기본: true) */
  softDeleteOnConflict?: boolean;
  /** 최대 경과 시간 (ms) */
  maxAge?: number;
}

/**
 * 병합 결과
 */
export interface MergeResult {
  mergeId: string;
  timestamp: Date;
  nodesPromoted: number;
  nodesSkipped: number;
  nodesFailed: number;
  edgesPromoted: number;
  edgesSkipped: number;
  conflicts: Conflict[];
  duration: number; // ms
}

/**
 * 승격 결과
 */
export interface PromotionResult {
  nodeId: NodeId;
  success: boolean;
  timestamp: Date;
  reason?: string;
  conflict?: Conflict;
}

/**
 * 충돌 정보
 */
export interface Conflict {
  id: string;
  type: 'version' | 'contradiction' | 'supersedes' | 'confidence';
  nodes: [TemporalNode, TemporalNode];
  detectedAt: Date;
  status: 'pending' | 'resolved' | 'deferred';
  resolution?: ConflictResolution;
  metadata?: Record<string, unknown>;
}

/**
 * 충돌 해결 유형
 */
export type ConflictResolution =
  | 'pending'      // 보류 (수동 검토)
  | 'supersedes'   // 최신 버전 우선
  | 'higher_confidence'  // 높은 신뢰도 우선
  | 'merge'        // 병합
  | 'discard'      // 폐기
  | 'soft_delete'; // valid_to 설정

/**
 * 안정성 기준
 */
export interface StabilityCriteria {
  /** 충돌 없이 유지한 최소 시간 (기본: 24시간) */
  minHoursWithoutConflict?: number;
  /** 최소 신뢰도 (기본: 0.8) */
  minConfidence?: number;
  /** 최소 관찰 횟수 (기본: 1) */
  minObservationCount?: number;
}

/**
 * Reflector 구현체
 */
export class Reflector implements IReflector {
  private conflictHandler: IConflictHandler;
  private guardrail: IConfidenceGuardrail;

  constructor(
    private eventBus: IEventBus,
    conflictHandler?: IConflictHandler,
    guardrail?: IConfidenceGuardrail
  ) {
    this.conflictHandler = conflictHandler ?? new ConflictHandler();
    this.guardrail = guardrail ?? new ConfidenceGuardrail();
  }

  reflect(
    source: StagingTKG,
    target: ProductionTKG,
    options?: ReflectionOptions
  ): MergeResult {
    const startTime = Date.now();
    const minConf = options?.minConfidence ?? 0.7;
    const conflicts: Conflict[] = [];
    let promoted = 0;
    let skipped = 0;

    // 이벤트 발행
    this.eventBus.publish({
      type: EventType.TKG_REFLECTOR_MERGE_STARTED,
      source: 'reflector',
      timestamp: new Date(),
      payload: { minConfidence: minConf },
    });

    // 병합 로직
    for (const [id, node] of source.nodes) {
      // 신뢰도 필터링
      if (node.confidence < minConf) {
        skipped++;
        continue;
      }

      // 충돌 검사
      const conflict = this.conflictHandler.detectConflictsBetween(
        node,
        target.nodes.get(id)
      );

      if (conflict) {
        conflicts.push(conflict);
        if (options?.softDeleteOnConflict) {
          node.valid_to = new Date(); // soft delete
        }
        skipped++;
      } else {
        target.nodes.set(id, node);
        promoted++;

        this.eventBus.publish({
          type: EventType.TKG_REFLECTOR_NODE_PROMOTED,
          source: 'reflector',
          timestamp: new Date(),
          payload: { nodeId: id },
        });
      }
    }

    const result: MergeResult = {
      mergeId: generateId(),
      timestamp: new Date(),
      nodesPromoted: promoted,
      nodesSkipped: skipped,
      nodesFailed: 0,
      edgesPromoted: 0,
      edgesSkipped: 0,
      conflicts,
      duration: Date.now() - startTime,
    };

    // 이벤트 발행
    this.eventBus.publish({
      type: EventType.TKG_REFLECTOR_MERGE_COMPLETED,
      source: 'reflector',
      timestamp: new Date(),
      payload: result,
    });

    return result;
  }

  // ... 나머지 메서드 구현
}
```

### 5. Conflict Handler 구현 (`src/core/conflict-handler.ts`)

```typescript
/**
 * Conflict Handler 인터페이스
 */
export interface IConflictHandler {
  // 충돌 감지
  detectConflicts(nodes: TemporalNode[]): Conflict[];
  detectConflictsBetween(
    node1: TemporalNode,
    node2: TemporalNode
  ): Conflict | null;

  // 충돌 해결
  resolveConflict(
    conflict: Conflict,
    resolution: ConflictResolution
  ): ResolutionResult;
  resolveAllPending(resolution: ConflictResolution): ResolutionResult[];

  // 충돌 조회
  getConflicts(filter?: ConflictFilter): Conflict[];
  getPendingConflicts(): Conflict[];
  getResolvedConflicts(): Conflict[];
  getConflictHistory(limit?: number): Conflict[];

  // 자동 해결 규칙
  setAutoResolutionRule(
    conflictType: Conflict['type'],
    rule: ConflictResolution
  ): void;
  applyAutoResolution(conflicts: Conflict[]): ResolutionResult[];
}

/**
 * 충돌 필터
 */
export interface ConflictFilter {
  type?: Conflict['type'];
  status?: Conflict['status'];
  nodeType?: TemporalNode['type'];
  after?: Date;
  before?: Date;
}

/**
 * 해결 결과
 */
export interface ResolutionResult {
  conflictId: string;
  success: boolean;
  resolution: ConflictResolution;
  timestamp: Date;
  reason?: string;
}
```

### 6. Confidence Guardrail 구현 (`src/core/confidence-guardrail.ts`)

```typescript
/**
 * Confidence Guardrail 인터페이스
 * @description 신뢰도 기반 품질 가드레일
 */
export interface IConfidenceGuardrail {
  // 임계값
  /** Staging 진입 최소 신뢰도 (0.3) */
  STAGING_THRESHOLD: number;
  /** Production 승격 최소 신뢰도 (0.7) */
  PROMOTION_THRESHOLD: number;
  /** 결정 참조 최소 신뢰도 (0.5) */
  DECISION_THRESHOLD: number;

  // 검증
  /** 노드 검증 */
  check(node: TemporalNode, target: 'staging' | 'production'): boolean;
  /** 일괄 검증 */
  checkBatch(
    nodes: TemporalNode[],
    target: 'staging' | 'production'
  ): ValidationResult[];

  // 필터링
  /** 신뢰도 필터링 */
  filterByConfidence(
    nodes: TemporalNode[],
    min: number
  ): TemporalNode[];
  /** Staging 필터링 */
  filterForStaging(nodes: TemporalNode[]): TemporalNode[];
  /** 승격 필터링 */
  filterForPromotion(nodes: TemporalNode[]): TemporalNode[];
}

/**
 * 검증 결과
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * 검증 에러
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * 검증 경고
 */
export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}

/**
 * Confidence Guardrail 구현체
 */
export class ConfidenceGuardrail implements IConfidenceGuardrail {
  STAGING_THRESHOLD = 0.3;
  PROMOTION_THRESHOLD = 0.7;
  DECISION_THRESHOLD = 0.5;

  check(node: TemporalNode, target: 'staging' | 'production'): boolean {
    const threshold = target === 'staging'
      ? this.STAGING_THRESHOLD
      : this.PROMOTION_THRESHOLD;

    return node.confidence >= threshold;
  }

  // ... 나머지 메서드 구현
}
```

### 7. Knowledge Section 확장 (`src/types/knowledge.ts`)

```typescript
/**
 * Knowledge Section (TKG 확장)
 */
export interface KnowledgeSection {
  // Temporal Knowledge Graph
  /** Staging TKG (Observer 전용) */
  staging: StagingTKG;
  /** Production TKG (Reflector 전용) */
  production: ProductionTKG;

  // Observer/Reflector 인스턴스
  /** Observer 인스턴스 */
  observer: IObserver;
  /** Reflector 인스턴스 */
  reflector: IReflector;
  /** Conflict Handler */
  conflictHandler: IConflictHandler;
  /** Confidence Guardrail */
  guardrail: IConfidenceGuardrail;

  // 하위 호환성: 레거시 API (내부적으로 TKG 매핑)
  /** 레거시 Fact 목록 */
  facts: Fact[];
  /** 레거시 Inference 목록 */
  inferences: Inference[];
  /** 레거시 Pattern 목록 */
  patterns: Pattern[];
}

// Observer API 확장
export interface IKnowledgeSection extends IObserver, IReflector {
  // Observer: Staging 기록
  observeEvent(event: BlackboardEvent): void;
  observeFact(fact: Omit<FactData, 'verified'>): NodeId;
  observeDecision(decision: DecisionData): NodeId;
  observeTask(task: TaskData): NodeId;
  observePattern(pattern: PatternData): NodeId;

  // Production 쿼리
  queryProduction(query: GraphQuery): QueryResult;
  getProductionNode(nodeId: NodeId): TemporalNode | undefined;
  getValidNodes(at?: Date): TemporalNode[];
  queryAtTime(query: GraphQuery, time: Date): QueryResult;

  // Temporal 쿼리 헬퍼
  queryByTimeRange(
    query: GraphQuery,
    from: Date,
    to: Date
  ): QueryResult[];
  queryByConfidence(
    query: GraphQuery,
    minConfidence: number
  ): QueryResult;

  // Conflict 관리
  getConflicts(): Conflict[];
  resolveConflict(conflictId: string, resolution: ConflictResolution): void;
  getPendingConflicts(): Conflict[];

  // 레거시 API (호환성)
  addFact(fact: Omit<Fact, 'id' | 'timestamp'>): FactId;
  getFact(factId: FactId): Fact | undefined;
  getFactsByTag(tag: string): Fact[];
  searchFacts(query: string): Fact[];

  addInference(inference: Omit<Inference, 'id' | 'timestamp'>): InferenceId;
  getInference(inferenceId: InferenceId): Inference | undefined;

  addPattern(pattern: Omit<Pattern, 'id' | 'learnedAt'>): PatternId;
  getPattern(patternId: PatternId): Pattern | undefined;
  getAllPatterns(): Pattern[];
}
```

### 8. 파일 구조

```
packages/blackboard/
└── src/
    ├── types/
    │   ├── index.ts
    │   └── tkg.ts           # TKG 관련 타입
    └── core/
        ├── tkg.ts           # TKG 공통 인터페이스
        ├── observer.ts      # Observer 구현
        ├── reflector.ts     # Reflector 구현
        ├── conflict-handler.ts  # Conflict Handler 구현
        └── confidence-guardrail.ts  # Confidence Guardrail 구현
```

---

## 완료 조건

### 타입 정의
- [ ] TKG 스키마 타입 작성 완료 (`types/tkg.ts`)
- [ ] GraphQuery, QueryResult 타입 작성 완료
- [ ] Conflict, MergeResult 타입 작성 완료
- [ ] ValidationResult, ResolutionResult 타입 작성 완료

### 인터페이스 구현
- [ ] TemporalKnowledgeGraph 인터페이스 구현
- [ ] StagingTKG 인터페이스 구현
- [ ] ProductionTKG 인터페이스 구현

### Observer 구현
- [ ] IObserver 인터페이스 정의
- [ ] Observer 클래스 구현
- [ ] 이벤트 → 노드 변환 로직 구현
- [ ] 신뢰도 검증 로직 구현
- [ ] TKG_OBSERVER_* 이벤트 발행 구현

### Reflector 구현
- [ ] IReflector 인터페이스 정의
- [ ] Reflector 클래스 구현
- [ ] 병합 로직 (Staging → Production) 구현
- [ ] 충돌 감지 로직 구현
- [ ] 승격 로직 (promote, promoteBatch) 구현
- [ ] TKG_REFLECTOR_* 이벤트 발행 구현

### Conflict Handler 구현
- [ ] IConflictHandler 인터페이스 정의
- [ ] ConflictHandler 클래스 구현
- [ ] 충돌 감지 로직 (detectConflicts)
- [ ] 충돌 해결 로직 (resolveConflict)
- [ ] 자동 해결 규칙 구현
- [ ] TKG_CONFLICT_* 이벤트 발행 구현

### Confidence Guardrail 구현
- [ ] IConfidenceGuardrail 인터페이스 정의
- [ ] ConfidenceGuardrail 클래스 구현
- [ ] 신뢰도 임계값 상수 정의
- [ ] check() 메서드 구현
- [ ] filterForStaging() 구현
- [ ] filterForPromotion() 구현

### Knowledge Section 통합
- [ ] KnowledgeSection에 TKG 필드 추가
- [ ] IKnowledgeSection에 Observer/Reflector API 확장
- [ ] 레거시 API 호환성 유지

### 테스트
- [ ] 단위 테스트 (Observer, Reflector, ConflictHandler, Guardrail)
- [ ] 통합 테스트 (Observer → Staging → Reflector → Production 흐름)
- [ ] 충돌 시나리오 테스트
- [ ] Temporal 쿼리 테스트
- [ ] 테스트 커버리지 80% 이상

### 문서
- [ ] JSDoc 주석 완료
- [ ] README.md에 TKG 사용 예시 추가
- [ ] CHANGELOG.md에 변경사항 기록

---

## 테스트 시나리오

### 1. Observer 기본 기능
```typescript
// 사실 관찰 → Staging 기록
observer.observe({
  type: 'knowledge.fact.added',
  payload: {
    node: {
      type: 'fact',
      data: { statement: '프로젝트 진행률 70%' },
      confidence: 0.9,
      valid_from: new Date(),
    }
  }
});

// Staging 쿼리
const result = observer.queryStaging({
  nodeTypes: ['fact'],
  minConfidence: 0.5,
});
assert(result.nodes.length === 1);
```

### 2. Reflector 병합
```typescript
// Staging → Production 병합
const mergeResult = reflector.reflect(
  staging,
  production,
  { minConfidence: 0.7 }
);

assert(mergeResult.nodesPromoted > 0);
assert(mergeResult.conflicts.length === 0);
```

### 3. 충돌 해결
```typescript
// 충돌 감지
const conflicts = reflector.detectConflicts();
assert(conflicts.length > 0);

// 충돌 해결
reflector.resolveConflict(
  conflicts[0].id,
  'supersedes'
);
```

### 4. Temporal 쿼리
```typescript
// 특정 시점 상태 쿼리
const lastWeek = new Date('2026-02-05');
const result = knowledge.queryAtTime(
  { nodeTypes: ['fact'] },
  lastWeek
);

// 현재 유효한 노드만
const validNodes = knowledge.getValidNodes();
```

---

## 리스크 및 완화 방안

| 리스크 | 영향 | 완화 방안 |
|--------|------|----------|
| 충돌 해결 로직 복잡도 | 높음 | 단순한 규칙(Supersedes, Higher Confidence)로 시작 |
| Temporal 쿼리 성능 | 중간 | 인덱싱, 캐싱 도입 |
| Observer/Reflector 동시성 문제 | 중간 | Mutex/RWLock 도입 |
| Staging/Production 불일치 | 높음 | 정기적 일관성 검사 도입 |

---

## 다음 액션

1. 태스크 리뷰 및 우선순위 조정
2. P0 우선순위 항목 구현 시작
3. Observer 기본 구현 후 단위 테스트
4. Reflector 기본 구현 후 단위 테스트
5. 통합 테스트 작성 및 검증

---

## 참고 문서

- [[spec/12-blackboard.md|Blackboard 시스템 스펙]] - TKG 아키텍처 설계
- [[architecture/blackboard-actor-design.md|Blackboard + Actor 설계]]
- TASK-018: Blackboard 상태 스키마 정의
- TASK-019: Blackboard 코어 로직 구현
- TASK-022: @obora-kit/blackboard 패키지 설정

---

*문서 버전: 1.0*
*작성일: 2026-02-12*
