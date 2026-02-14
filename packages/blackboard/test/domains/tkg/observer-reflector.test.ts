import { rmSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createNodeId } from '../../../src/types/tkg';
import { EventBus } from '../../../src/events';
import {
  InMemoryProductionTKG,
  InMemoryStagingTKG,
  JsonFileReflectorStateStore,
  TKGObserver,
  TKGReflector,
} from '../../../src/domains/tkg';

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

  it('enforces runtime read-only maps on production view', () => {
    const production = new InMemoryProductionTKG();

    expect(() => (production.nodes as Map<string, unknown>).set('n', {})).toThrow(TypeError);
    expect(() => (production.edges as Map<string, unknown>).clear()).toThrow(TypeError);
  });

  it('subscribes to event bus and observes incoming blackboard events', () => {
    const staging = new InMemoryStagingTKG();
    const eventBus = new EventBus();
    const observer = new TKGObserver(staging, eventBus, { stagingThreshold: 0.6 });

    observer.subscribeTo('knowledge.*');
    eventBus.emit({
      id: 'evt-sub',
      type: 'knowledge.fact.added',
      timestamp: new Date(),
      source: 'system',
      payload: { confidence: 0.8, statement: 'subscribed' },
    } as never);
    observer.stopSubscription();

    expect(staging.queryCurrent({}).nodes).toHaveLength(1);
  });

  it('handles unserializable payload without crashing observer', () => {
    const staging = new InMemoryStagingTKG();
    const observer = new TKGObserver(staging);
    const circular: { self?: unknown } = {};
    circular.self = circular;

    const node = observer.observe({
      id: 'evt-circular',
      type: 'knowledge.fact.added',
      timestamp: new Date(),
      source: 'system',
      payload: circular,
    } as never);

    expect(node).not.toBeNull();
    expect(node?.data.context).toBe('[unserializable payload]');
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
    const rollbackResult = reflector.rollback(staging);

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

  it('excludes conflicted nodes from promotion', () => {
    const staging = new InMemoryStagingTKG();
    const production = new InMemoryProductionTKG();
    const reflector = new TKGReflector();
    const now = new Date();

    staging.addNode({
      id: createNodeId('c-1'),
      type: 'fact',
      valid_from: now,
      observed_at: now,
      updated_at: now,
      confidence: 0.9,
      source: 'system',
      version: 1,
      data: { statement: 'dup', verified: false },
    });

    staging.addNode({
      id: createNodeId('c-2'),
      type: 'fact',
      valid_from: now,
      observed_at: now,
      updated_at: now,
      confidence: 0.8,
      source: 'system',
      version: 2,
      data: { statement: 'dup', verified: false },
    });

    const result = reflector.reflect(staging, production);

    expect(result.nodesPromoted).toBe(0);
    expect(production.queryCurrent({}).nodes).toHaveLength(0);
  });

  it('supports auto policy and keeps operational report/metrics', () => {
    const staging = new InMemoryStagingTKG();
    const production = new InMemoryProductionTKG();
    const now = new Date();
    const reflector = new TKGReflector(undefined, {
      conflictPolicy: { version: 'auto', confidence: 'auto', contradiction: 'manual' },
    });

    staging.addNode({
      id: createNodeId('m-1'),
      type: 'fact',
      valid_from: now,
      observed_at: now,
      updated_at: now,
      confidence: 0.7,
      source: 'system',
      version: 1,
      data: { statement: 'policy', verified: false },
    });

    staging.addNode({
      id: createNodeId('m-2'),
      type: 'fact',
      valid_from: now,
      observed_at: now,
      updated_at: now,
      confidence: 0.8,
      source: 'system',
      version: 2,
      data: { statement: 'policy', verified: false },
    });

    const result = reflector.reflect(staging, production);
    const report = reflector.getLastReport();
    const metrics = reflector.getOperationalMetrics();

    expect(result.nodesPromoted).toBe(1);
    expect(report?.policySummary.auto).toBe(1);
    expect(metrics.autoResolved).toBe(1);
    expect(metrics.totalMerges).toBe(1);
  });

  it('treats verified mismatch as contradiction and routes to manual policy by default', () => {
    const staging = new InMemoryStagingTKG();
    const production = new InMemoryProductionTKG();
    const now = new Date();
    const reflector = new TKGReflector();

    staging.addNode({
      id: createNodeId('d-1'),
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
      id: createNodeId('d-2'),
      type: 'fact',
      valid_from: now,
      observed_at: now,
      updated_at: now,
      confidence: 0.9,
      source: 'system',
      version: 1,
      data: { statement: 'same', verified: true },
    });

    const conflicts = reflector.detectConflicts(Array.from(staging.nodes.values()));
    const result = reflector.reflect(staging, production);
    const report = reflector.getLastReport();

    expect(conflicts[0]?.type).toBe('contradiction');
    expect(result.nodesPromoted).toBe(0);
    expect(report?.policySummary.manual).toBeGreaterThan(0);
    expect(reflector.getManualReviewQueue().length).toBeGreaterThan(0);
  });

  it('queues deferred conflicts and supports merge-targeted rollback snapshot restore', () => {
    const staging = new InMemoryStagingTKG();
    const production = new InMemoryProductionTKG();
    const now = new Date();
    const reflector = new TKGReflector(undefined, {
      conflictPolicy: { contradiction: 'defer', version: 'auto', confidence: 'auto' },
    });

    staging.addNode({
      id: createNodeId('r-1'),
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
      id: createNodeId('r-2'),
      type: 'fact',
      valid_from: now,
      observed_at: now,
      updated_at: now,
      confidence: 0.9,
      source: 'system',
      version: 1,
      data: { statement: 'same', verified: true },
    });

    const merge = reflector.reflect(staging, production);
    staging.clearNodes();
    const rollback = reflector.rollback(staging, merge.mergeId);

    expect(reflector.getDeferredQueue().length).toBeGreaterThan(0);
    expect(reflector.getReportHistory().length).toBe(1);
    const deferredId = reflector.getDeferredQueue()[0]?.id;
    expect(deferredId).toBeDefined();
    if (deferredId) {
      expect(reflector.resolveDeferredById(deferredId)).toBe(true);
    }
    expect(reflector.getDeferredQueue().length).toBe(0);
    expect(rollback.rolledBack).toBe(2);
    expect(staging.queryCurrent({}).nodes).toHaveLength(2);

    staging.clearNodes();
    const unknownRollback = reflector.rollback(staging, 'unknown-merge-id');
    expect(unknownRollback.rolledBack).toBe(0);
    expect(staging.queryCurrent({}).nodes).toHaveLength(0);
  });

  it('limits rollback snapshots by depth to avoid unbounded retention', () => {
    const reflector = new TKGReflector(undefined, { rollbackSnapshotDepth: 1 });

    const staging1 = new InMemoryStagingTKG();
    const production = new InMemoryProductionTKG();
    const now = new Date();

    staging1.addNode({
      id: createNodeId('depth-1'),
      type: 'fact',
      valid_from: now,
      observed_at: now,
      updated_at: now,
      confidence: 0.9,
      source: 'system',
      version: 1,
      data: { statement: 'depth-1', verified: false },
    });
    const merge1 = reflector.reflect(staging1, production);

    const staging2 = new InMemoryStagingTKG();
    staging2.addNode({
      id: createNodeId('depth-2'),
      type: 'fact',
      valid_from: now,
      observed_at: now,
      updated_at: now,
      confidence: 0.9,
      source: 'system',
      version: 1,
      data: { statement: 'depth-2', verified: false },
    });
    reflector.reflect(staging2, production);

    const restoreTarget = new InMemoryStagingTKG();
    const oldRollback = reflector.rollback(restoreTarget, merge1.mergeId);
    expect(oldRollback.rolledBack).toBe(0);
  });

  it('persists and restores operational state for manual workflow continuity', () => {
    const staging = new InMemoryStagingTKG();
    const production = new InMemoryProductionTKG();
    const now = new Date();
    const reflector = new TKGReflector(undefined, {
      conflictPolicy: { contradiction: 'manual', version: 'auto', confidence: 'auto' },
    });

    staging.addNode({
      id: createNodeId('persist-1'),
      type: 'fact',
      valid_from: now,
      observed_at: now,
      updated_at: now,
      confidence: 0.9,
      source: 'system',
      version: 1,
      data: { statement: 'persist', verified: false },
    });
    staging.addNode({
      id: createNodeId('persist-2'),
      type: 'fact',
      valid_from: now,
      observed_at: now,
      updated_at: now,
      confidence: 0.9,
      source: 'system',
      version: 1,
      data: { statement: 'persist', verified: true },
    });

    reflector.reflect(staging, production);
    const state = reflector.exportOperationalState();

    const restored = new TKGReflector();
    restored.importOperationalState(state);

    expect(restored.getManualReviewQueue().length).toBe(1);
    expect(restored.getOperationalMetrics().manualReview).toBe(1);
    expect(restored.getReportHistory().length).toBe(1);
  });

  it('integrates state store for load/save persistence workflow', () => {
    let savedState: ReturnType<TKGReflector['exportOperationalState']> | null = null;
    const stateStore = {
      load: () => savedState,
      save: (state: ReturnType<TKGReflector['exportOperationalState']>) => {
        savedState = state;
      },
    };

    const reflector = new TKGReflector(undefined, { stateStore });
    reflector.importOperationalState({
      metrics: { totalMerges: 1, totalConflicts: 0, autoResolved: 0, deferred: 0, manualReview: 0, rollbacks: 0 },
      manualReviewQueue: [],
      deferredQueue: [],
      reportHistory: [],
      rollbackSnapshots: [],
    });

    expect(savedState?.metrics.totalMerges).toBe(1);

    const restored = new TKGReflector(undefined, { stateStore });
    expect(restored.getOperationalMetrics().totalMerges).toBe(1);
  });

  it('persists operational state to json file for restart-safe workflow', () => {
    const filePath = `/tmp/obora-kit-reflector-state-${crypto.randomUUID()}.json`;
    const store = new JsonFileReflectorStateStore(filePath);

    const reflector = new TKGReflector(undefined, { stateStore: store });
    reflector.importOperationalState({
      metrics: { totalMerges: 2, totalConflicts: 1, autoResolved: 1, deferred: 0, manualReview: 0, rollbacks: 0 },
      manualReviewQueue: [],
      deferredQueue: [],
      reportHistory: [],
      rollbackSnapshots: [],
    });

    const restored = new TKGReflector(undefined, { stateStore: store });
    expect(restored.getOperationalMetrics().totalMerges).toBe(2);

    rmSync(filePath, { force: true });
  });

  it('handles corrupted persisted json safely', () => {
    const filePath = `/tmp/obora-kit-reflector-corrupt-${crypto.randomUUID()}.json`;
    writeFileSync(filePath, '{not-valid-json', 'utf8');

    const store = new JsonFileReflectorStateStore(filePath);
    const restored = new TKGReflector(undefined, { stateStore: store });

    expect(restored.getOperationalMetrics().totalMerges).toBe(0);
    rmSync(filePath, { force: true });
  });
});
