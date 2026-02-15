import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type {
  ManualReviewItem,
  ReflectorOperationalMetrics,
  ReflectorOperationalReport,
  ReflectorPersistedState,
  ReflectorStateStore,
} from './ObserverReflector';
import type { TemporalNode } from '../../types/tkg';

interface SerializedSnapshot {
  readonly mergeId: string;
  readonly nodes: readonly SerializedTemporalNode[];
}

type SerializedTemporalNode = Omit<TemporalNode, 'valid_from' | 'valid_to' | 'observed_at' | 'updated_at'> & {
  readonly valid_from: string;
  readonly valid_to?: string;
  readonly observed_at: string;
  readonly updated_at: string;
};

interface SerializedReflectorState {
  readonly metrics: ReflectorOperationalMetrics;
  readonly manualReviewQueue: readonly ManualReviewItem[];
  readonly deferredQueue: readonly ManualReviewItem[];
  readonly reportHistory: readonly (Omit<ReflectorOperationalReport, 'generatedAt'> & { readonly generatedAt: string })[];
  readonly rollbackSnapshots: readonly SerializedSnapshot[];
}

export class JsonFileReflectorStateStore implements ReflectorStateStore {
  constructor(private readonly filePath: string) {}

  load(): ReflectorPersistedState | null {
    if (!existsSync(this.filePath)) {
      return null;
    }

    const raw = readFileSync(this.filePath, 'utf8');
    if (!raw.trim()) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as SerializedReflectorState;
      return {
        metrics: parsed.metrics,
        manualReviewQueue: parsed.manualReviewQueue.map((item) => ({
          ...item,
          queuedAt: new Date(item.queuedAt),
        })),
        deferredQueue: parsed.deferredQueue.map((item) => ({
          ...item,
          queuedAt: new Date(item.queuedAt),
        })),
        reportHistory: parsed.reportHistory.map((report) => ({
          ...report,
          generatedAt: new Date(report.generatedAt),
        })),
        rollbackSnapshots: parsed.rollbackSnapshots.map((snapshot) => ({
          mergeId: snapshot.mergeId,
          nodes: snapshot.nodes.map((node) => this.deserializeNode(node)),
        })),
      };
    } catch {
      return null;
    }
  }

  save(state: ReflectorPersistedState): void {
    mkdirSync(dirname(this.filePath), { recursive: true });

    const serializable: SerializedReflectorState = {
      metrics: state.metrics,
      manualReviewQueue: state.manualReviewQueue.map((item) => ({
        ...item,
        queuedAt: new Date(item.queuedAt),
      })),
      deferredQueue: state.deferredQueue.map((item) => ({
        ...item,
        queuedAt: new Date(item.queuedAt),
      })),
      reportHistory: state.reportHistory.map((report) => ({
        ...report,
        generatedAt: report.generatedAt.toISOString(),
      })),
      rollbackSnapshots: state.rollbackSnapshots.map((snapshot) => ({
        mergeId: snapshot.mergeId,
        nodes: snapshot.nodes.map((node) => this.serializeNode(node)),
      })),
    };

    const tempPath = `${this.filePath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(serializable, null, 2), 'utf8');
    renameSync(tempPath, this.filePath);
  }

  private serializeNode(node: TemporalNode): SerializedTemporalNode {
    return {
      ...node,
      valid_from: node.valid_from.toISOString(),
      valid_to: node.valid_to?.toISOString(),
      observed_at: node.observed_at.toISOString(),
      updated_at: node.updated_at.toISOString(),
    };
  }

  private deserializeNode(node: SerializedTemporalNode): TemporalNode {
    return {
      ...node,
      valid_from: new Date(node.valid_from),
      valid_to: node.valid_to ? new Date(node.valid_to) : undefined,
      observed_at: new Date(node.observed_at),
      updated_at: new Date(node.updated_at),
    };
  }
}
