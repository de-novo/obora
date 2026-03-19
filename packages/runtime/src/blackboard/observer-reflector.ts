import type { Event } from './events';
import { EventBus, type Unsubscribe } from './events';
import { createAgentId } from './types';
import { createNodeId, type IProductionPromotionPort, type TemporalNode } from './types/tkg';
import type { InMemoryStagingTKG } from '../_legacy/blackboard/domains/tkg/InMemoryTKG';

export interface ObserverOptions {
  readonly stagingThreshold?: number;
}

export class TKGObserver {
  private readonly stagingThreshold: number;
  private unsubscribeFromSource: Unsubscribe | null = null;

  constructor(
    private readonly staging: InMemoryStagingTKG,
    private readonly eventBus = new EventBus(),
    options: ObserverOptions = {},
  ) {
    this.stagingThreshold = options.stagingThreshold ?? 0.3;
  }

  subscribeTo(eventPattern: string = '*'): void {
    this.unsubscribeFromSource?.();
    this.unsubscribeFromSource = (this.eventBus.subscribe as (type: string, handler: (event: Event) => void) => Unsubscribe)(
      eventPattern,
      (event: Event) => {
        if (event.type.startsWith('tkg.')) return;
        this.observe(event);
      },
    );
  }

  stopSubscription(): void {
    this.unsubscribeFromSource?.();
    this.unsubscribeFromSource = null;
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
    const payloadStatement =
      typeof eventPayload.payload === 'object' && eventPayload.payload !== null
        ? (eventPayload.payload as { statement?: unknown }).statement
        : undefined;

    let context = '{}';
    try {
      context = JSON.stringify(eventPayload.payload ?? {});
    } catch {
      context = '[unserializable payload]';
    }

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
        statement: typeof payloadStatement === 'string' && payloadStatement.length > 0 ? payloadStatement : event.type,
        verified: false,
        context,
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

export type ConflictType = 'contradiction' | 'version' | 'confidence';
export type ResolutionPolicy = 'auto' | 'manual' | 'defer';

export interface ConflictResolutionPolicy {
  readonly contradiction?: ResolutionPolicy;
  readonly version?: ResolutionPolicy;
  readonly confidence?: ResolutionPolicy;
}

export interface ReflectorOptions {
  readonly minConfidence?: number;
  readonly autoResolveConfidenceGap?: number;
  readonly conflictPolicy?: ConflictResolutionPolicy;
  readonly rollbackSnapshotDepth?: number;
  readonly reportHistoryDepth?: number;
  readonly stateStore?: ReflectorStateStore;
}

export interface ReflectorOperationalMetrics {
  readonly totalMerges: number;
  readonly totalConflicts: number;
  readonly autoResolved: number;
  readonly deferred: number;
  readonly manualReview: number;
  readonly rollbacks: number;
}

export interface ReflectorOperationalReport {
  readonly generatedAt: Date;
  readonly mergeId: string;
  readonly promoted: number;
  readonly blockedByConflict: number;
  readonly conflictSummary: Record<ConflictType, number>;
  readonly policySummary: Record<ResolutionPolicy, number>;
}

export interface ManualReviewItem {
  readonly id: string;
  readonly conflictType: ConflictType;
  readonly nodeIds: readonly string[];
  readonly queuedAt: Date;
}

export interface ReflectorPersistedState {
  readonly metrics: ReflectorOperationalMetrics;
  readonly manualReviewQueue: readonly ManualReviewItem[];
  readonly deferredQueue: readonly ManualReviewItem[];
  readonly reportHistory: readonly ReflectorOperationalReport[];
  readonly rollbackSnapshots: readonly { mergeId: string; nodes: readonly TemporalNode[] }[];
}

export interface ReflectorStateStore {
  load(): ReflectorPersistedState | null;
  save(state: ReflectorPersistedState): void;
}

export class TKGReflector {
  private readonly minConfidence: number;
  private readonly autoResolveConfidenceGap: number;
  private readonly conflictPolicy: Record<ConflictType, ResolutionPolicy>;
  private readonly rollbackSnapshotDepth: number;
  private readonly reportHistoryDepth: number;
  private readonly stateStore?: ReflectorStateStore;
  private metrics: ReflectorOperationalMetrics = {
    totalMerges: 0,
    totalConflicts: 0,
    autoResolved: 0,
    deferred: 0,
    manualReview: 0,
    rollbacks: 0,
  };
  private lastReport: ReflectorOperationalReport | null = null;
  private readonly manualReviewQueue: ManualReviewItem[] = [];
  private readonly deferredQueue: ManualReviewItem[] = [];
  private readonly rollbackSnapshots = new Map<string, readonly TemporalNode[]>();
  private readonly reportHistory: ReflectorOperationalReport[] = [];

  constructor(private readonly eventBus = new EventBus(), options: ReflectorOptions = {}) {
    this.minConfidence = options.minConfidence ?? 0.7;
    this.autoResolveConfidenceGap = options.autoResolveConfidenceGap ?? 0.2;
    this.conflictPolicy = {
      contradiction: options.conflictPolicy?.contradiction ?? 'manual',
      version: options.conflictPolicy?.version ?? 'manual',
      confidence: options.conflictPolicy?.confidence ?? 'auto',
    };
    this.rollbackSnapshotDepth = Math.max(1, options.rollbackSnapshotDepth ?? 20);
    this.reportHistoryDepth = Math.max(1, options.reportHistoryDepth ?? 50);
    this.stateStore = options.stateStore;

    const loaded = this.stateStore?.load();
    if (loaded) {
      this.importOperationalState(loaded);
    }
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
    const eligible = candidates.filter((node) => node.confidence >= this.minConfidence);
    const conflicts = this.detectConflicts(candidates);
    const resolution = this.resolveConflicts(conflicts);
    const mergeSnapshot = Array.from(staging.nodes.values());
    const blockedNodeIds = new Set(resolution.blockedNodeIds);
    const nodes = eligible.filter((node) => !blockedNodeIds.has(node.id));

    const mergeResult = production.promoteBatch({ nodes, edges: [], meta: { promotedBy: 'reflector' } });
    this.rollbackSnapshots.set(mergeResult.mergeId, mergeSnapshot);
    this.pruneRollbackSnapshots();

    this.metrics = {
      ...this.metrics,
      totalMerges: this.metrics.totalMerges + 1,
      totalConflicts: this.metrics.totalConflicts + conflicts.length,
      autoResolved: this.metrics.autoResolved + resolution.policySummary.auto,
      deferred: this.metrics.deferred + resolution.policySummary.defer,
      manualReview: this.metrics.manualReview + resolution.policySummary.manual,
    };

    this.lastReport = {
      generatedAt: new Date(),
      mergeId: mergeResult.mergeId,
      promoted: nodes.length,
      blockedByConflict: blockedNodeIds.size,
      conflictSummary: this.summarizeConflicts(conflicts),
      policySummary: resolution.policySummary,
    };
    this.reportHistory.push(this.lastReport);
    this.pruneReportHistory();
    this.persistOperationalState();

    this.eventBus.emit({
      id: `evt-tkg-reflector-${crypto.randomUUID()}`,
      type: 'tkg.reflector.merge.completed',
      source: 'system',
      timestamp: new Date(),
      payload: { ...mergeResult, report: this.lastReport, metrics: this.metrics },
    } as unknown as Event);

    return mergeResult;
  }

  detectConflicts(nodes: readonly TemporalNode[]) {
    const conflicts: Array<{ left: TemporalNode; right: TemporalNode; type: ConflictType }> = [];

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

        if (left.data.verified !== right.data.verified) {
          conflicts.push({ left, right, type: 'contradiction' });
        } else if (left.version !== right.version) {
          conflicts.push({ left, right, type: 'version' });
        } else if (Math.abs(left.confidence - right.confidence) > this.autoResolveConfidenceGap) {
          conflicts.push({ left, right, type: 'confidence' });
        }
      }
    }

    return conflicts;
  }

  getOperationalMetrics(): ReflectorOperationalMetrics {
    return { ...this.metrics };
  }

  getLastReport(): ReflectorOperationalReport | null {
    return this.lastReport ? { ...this.lastReport, generatedAt: new Date(this.lastReport.generatedAt) } : null;
  }

  getManualReviewQueue(): readonly ManualReviewItem[] {
    return this.manualReviewQueue.map((item) => ({ ...item, nodeIds: [...item.nodeIds], queuedAt: new Date(item.queuedAt) }));
  }

  getDeferredQueue(): readonly ManualReviewItem[] {
    return this.deferredQueue.map((item) => ({ ...item, nodeIds: [...item.nodeIds], queuedAt: new Date(item.queuedAt) }));
  }

  getReportHistory(): readonly ReflectorOperationalReport[] {
    return this.reportHistory.map((report) => ({ ...report, generatedAt: new Date(report.generatedAt) }));
  }

  resolveManualReview(nodeId: string): boolean {
    const index = this.manualReviewQueue.findIndex((item) => item.nodeIds.includes(nodeId));
    if (index < 0) return false;
    this.manualReviewQueue.splice(index, 1);
    this.persistOperationalState();
    return true;
  }

  resolveManualReviewById(itemId: string): boolean {
    const index = this.manualReviewQueue.findIndex((item) => item.id === itemId);
    if (index < 0) return false;
    this.manualReviewQueue.splice(index, 1);
    this.persistOperationalState();
    return true;
  }

  resolveDeferred(nodeId: string): boolean {
    const index = this.deferredQueue.findIndex((item) => item.nodeIds.includes(nodeId));
    if (index < 0) return false;
    this.deferredQueue.splice(index, 1);
    this.persistOperationalState();
    return true;
  }

  resolveDeferredById(itemId: string): boolean {
    const index = this.deferredQueue.findIndex((item) => item.id === itemId);
    if (index < 0) return false;
    this.deferredQueue.splice(index, 1);
    this.persistOperationalState();
    return true;
  }

  exportOperationalState(): ReflectorPersistedState {
    return {
      metrics: { ...this.metrics },
      manualReviewQueue: this.getManualReviewQueue(),
      deferredQueue: this.getDeferredQueue(),
      reportHistory: this.getReportHistory(),
      rollbackSnapshots: Array.from(this.rollbackSnapshots.entries()).map(([mergeId, nodes]) => ({ mergeId, nodes: [...nodes] })),
    };
  }

  importOperationalState(state: ReflectorPersistedState): void {
    this.metrics = { ...state.metrics };
    this.manualReviewQueue.splice(0, this.manualReviewQueue.length, ...state.manualReviewQueue.map((item) => ({
      ...item,
      nodeIds: [...item.nodeIds],
      queuedAt: new Date(item.queuedAt),
    })));
    this.deferredQueue.splice(0, this.deferredQueue.length, ...state.deferredQueue.map((item) => ({
      ...item,
      nodeIds: [...item.nodeIds],
      queuedAt: new Date(item.queuedAt),
    })));
    this.reportHistory.splice(0, this.reportHistory.length, ...state.reportHistory.map((report) => ({
      ...report,
      generatedAt: new Date(report.generatedAt),
    })));
    this.rollbackSnapshots.clear();
    for (const snapshot of state.rollbackSnapshots ?? []) {
      this.rollbackSnapshots.set(snapshot.mergeId, [...snapshot.nodes]);
    }
    this.pruneReportHistory();
    this.pruneRollbackSnapshots();
    this.lastReport = this.reportHistory.at(-1) ?? null;
    this.persistOperationalState();
  }

  rollback(staging: InMemoryStagingTKG, mergeResultId?: string) {
    const timestamp = new Date();
    const before = Array.from(staging.nodes.values()).length;
    const snapshot = mergeResultId ? this.rollbackSnapshots.get(mergeResultId) : undefined;

    if (mergeResultId && !snapshot) {
      return { mergeResultId, rolledBack: 0, timestamp };
    }

    if (snapshot) {
      staging.restoreNodes(snapshot);
    } else {
      staging.clearNodes();
    }

    this.metrics = { ...this.metrics, rollbacks: this.metrics.rollbacks + 1 };
    this.persistOperationalState();

    return {
      mergeResultId,
      rolledBack: snapshot ? snapshot.length : before,
      timestamp,
    };
  }

  private persistOperationalState(): void {
    this.stateStore?.save(this.exportOperationalState());
  }

  private pruneRollbackSnapshots(): void {
    while (this.rollbackSnapshots.size > this.rollbackSnapshotDepth) {
      const oldest = this.rollbackSnapshots.keys().next().value;
      if (!oldest) break;
      this.rollbackSnapshots.delete(oldest);
    }
  }

  private pruneReportHistory(): void {
    while (this.reportHistory.length > this.reportHistoryDepth) {
      this.reportHistory.shift();
    }
  }

  private summarizeConflicts(conflicts: Array<{ left: TemporalNode; right: TemporalNode; type: ConflictType }>) {
    return conflicts.reduce<Record<ConflictType, number>>(
      (acc, conflict) => ({ ...acc, [conflict.type]: acc[conflict.type] + 1 }),
      { contradiction: 0, version: 0, confidence: 0 },
    );
  }

  private resolveConflicts(conflicts: Array<{ left: TemporalNode; right: TemporalNode; type: ConflictType }>) {
    const blockedNodeIds = new Set<string>();
    const policySummary: Record<ResolutionPolicy, number> = { auto: 0, manual: 0, defer: 0 };

    for (const conflict of conflicts) {
      const policy = this.conflictPolicy[conflict.type];
      policySummary[policy] += 1;

      if (policy === 'auto') {
        const winner = this.pickAutoResolvedWinner(conflict);
        const loser = winner.id === conflict.left.id ? conflict.right : conflict.left;
        blockedNodeIds.add(loser.id);
        continue;
      }

      const reviewItem: ManualReviewItem = {
        id: `review-${crypto.randomUUID()}`,
        conflictType: conflict.type,
        nodeIds: [conflict.left.id, conflict.right.id],
        queuedAt: new Date(),
      };

      if (policy === 'manual') {
        this.manualReviewQueue.push(reviewItem);
      }

      if (policy === 'defer') {
        this.deferredQueue.push(reviewItem);
      }

      blockedNodeIds.add(conflict.left.id);
      blockedNodeIds.add(conflict.right.id);
    }

    return { blockedNodeIds, policySummary };
  }

  private pickAutoResolvedWinner(conflict: { left: TemporalNode; right: TemporalNode; type: ConflictType }) {
    if (conflict.type === 'version') {
      return conflict.left.version >= conflict.right.version ? conflict.left : conflict.right;
    }

    return conflict.left.confidence >= conflict.right.confidence ? conflict.left : conflict.right;
  }
}
