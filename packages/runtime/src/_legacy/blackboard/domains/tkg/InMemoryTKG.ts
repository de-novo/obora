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
  protected readonly nodeStore: Map<NodeId, TemporalNode>;
  protected readonly edgeStore: Map<EdgeId, TemporalEdge>;

  constructor(nodes: Map<NodeId, TemporalNode> = new Map(), edges: Map<EdgeId, TemporalEdge> = new Map()) {
    this.nodeStore = nodes;
    this.edgeStore = edges;
  }

  get nodes(): ReadonlyMap<NodeId, TemporalNode> {
    return this.nodeStore;
  }

  get edges(): ReadonlyMap<EdgeId, TemporalEdge> {
    return this.edgeStore;
  }

  queryCurrent(query: GraphQuery): QueryResult {
    return this.queryAtTime(query, new Date());
  }

  queryAtTime(query: GraphQuery, time = new Date()): QueryResult {
    const nodes = Array.from(this.nodeStore.values()).filter((node) => {
      if (query.nodeTypes && !query.nodeTypes.includes(node.type)) return false;
      if (query.nodeIds && !query.nodeIds.includes(node.id)) return false;
      if (query.tags && (!node.tags || !query.tags.every((tag) => node.tags?.includes(tag)))) return false;
      if (query.minConfidence !== undefined && node.confidence < query.minConfidence) return false;
      return node.valid_from <= time && (!node.valid_to || node.valid_to > time);
    });

    const nodeIdSet = new Set(nodes.map((node) => node.id));
    const edges = Array.from(this.edgeStore.values()).filter((edge) => {
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
    this.nodeStore.set(node.id, node);
    return node.id;
  }

  addEdge(edge: TemporalEdge): EdgeId {
    this.edgeStore.set(edge.id, edge);
    return edge.id;
  }

  clearNodes(): void {
    this.nodeStore.clear();
  }

  restoreNodes(nodes: readonly TemporalNode[]): void {
    this.nodeStore.clear();
    nodes.forEach((node) => this.nodeStore.set(node.id, node));
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
  private readonly readonlyNodeView = this.createReadonlyMapView(this.nodeStore);
  private readonly readonlyEdgeView = this.createReadonlyMapView(this.edgeStore);

  override get nodes(): ReadonlyMap<NodeId, TemporalNode> {
    return this.readonlyNodeView;
  }

  override get edges(): ReadonlyMap<EdgeId, TemporalEdge> {
    return this.readonlyEdgeView;
  }

  getValidNodes(at = new Date()): readonly TemporalNode[] {
    return this.queryAtTime({}, at).nodes;
  }

  getValidEdges(at = new Date()): readonly TemporalEdge[] {
    return this.queryAtTime({}, at).edges;
  }

  private createReadonlyMapView<TKey, TValue>(map: Map<TKey, TValue>): ReadonlyMap<TKey, TValue> {
    return new Proxy(map, {
      get(target, property, receiver) {
        if (property === 'set' || property === 'delete' || property === 'clear') {
          return () => {
            throw new TypeError('ProductionTKG map is read-only');
          };
        }

        const value = Reflect.get(target, property, receiver);
        if (typeof value === 'function') {
          return value.bind(target);
        }

        return value;
      },
    }) as ReadonlyMap<TKey, TValue>;
  }

  promoteNode(node: TemporalNode, _meta?: PromotionMeta): PromotionResult {
    this.nodeStore.set(node.id, node);
    return { nodeId: node.id, success: true, timestamp: new Date() };
  }

  promoteEdge(edge: TemporalEdge, _meta?: PromotionMeta): PromotionResult {
    this.edgeStore.set(edge.id, edge);
    return { nodeId: edge.from, success: true, timestamp: new Date() };
  }

  promoteBatch(payload: {
    nodes: readonly TemporalNode[];
    edges: readonly TemporalEdge[];
    meta?: PromotionMeta;
  }): MergeResult {
    payload.nodes.forEach((node) => this.nodeStore.set(node.id, node));
    payload.edges.forEach((edge) => this.edgeStore.set(edge.id, edge));
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
