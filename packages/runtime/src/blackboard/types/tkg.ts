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
