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
