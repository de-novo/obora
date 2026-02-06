/**
 * @module snapshot/snapshot-comparer
 * @description 스냅샷 비교 담당
 */

import type { Snapshot } from './types';
import { sortedKeyReplacer, decompressSnapshotData } from './utils';
import type { SerializedState } from './types';

/**
 * 스냅샷 차이점
 */
export interface SnapshotDiff {
  /** 메타데이터 차이 */
  meta: {
    versionDiff: number;
    timeDiff: number;
  };
  /** 섹션별 차이 */
  sections: {
    state: SectionDiff;
    knowledge: SectionDiff;
    decisions: SectionDiff;
  };
  /** 차이점 존재 여부 */
  hasDifferences: boolean;
  /** 상세 변경 정보 */
  details?: {
    phase?: { before: unknown; after: unknown };
    [key: string]: unknown;
  };
}

/**
 * 섹션 데이터 타입
 */
export type SectionData = Record<string, unknown>;

/**
 * 섹션 차이점
 */
export interface SectionDiff {
  /** 추가된 항목 수 */
  added: number;
  /** 제거된 항목 수 */
  removed: number;
  /** 변경된 항목 수 */
  modified: number;
  /** 상세 변경 목록 (경로 → [이전, 이후]) */
  changes: Map<string, [unknown, unknown]>;
}

/**
 * 스냅샷 비교자
 * @description 스냅샷 비교 전담 클래스
 */
export class SnapshotComparer {
  /**
   * Optional logger for error reporting
   * If not provided, errors are silently ignored (fail-safe)
   */
  private logger?: (msg: string, error?: string) => void;

  /**
   * Set the logger for error reporting
   */
  setLogger(logger: (msg: string, error?: string) => void): void {
    this.logger = logger;
  }

  /**
   * 스냅샷 비교
   * @param a - 첫 번째 스냅샷
   * @param b - 두 번째 스냅샷
   * @returns 차이점 목록
   */
  compare(a: Snapshot, b: Snapshot): SnapshotDiff {
    const metaDiff = {
      versionDiff: b.meta.stateVersion - a.meta.stateVersion,
      timeDiff: b.meta.createdAt.getTime() - a.meta.createdAt.getTime(),
    };

    // 섹션별 비교
    const stateSection = this.createSectionDiff(
      this.extractStateData(a),
      this.extractStateData(b)
    );

    const knowledgeSection = this.createSectionDiff(
      this.extractKnowledgeData(a),
      this.extractKnowledgeData(b)
    );

    const decisionsSection = this.createSectionDiff(
      this.extractDecisionsData(a),
      this.extractDecisionsData(b)
    );

    // 차이점 존재 여부 계산
    const hasDifferences =
      metaDiff.versionDiff !== 0 ||
      stateSection.added > 0 ||
      stateSection.removed > 0 ||
      stateSection.modified > 0 ||
      knowledgeSection.added > 0 ||
      knowledgeSection.removed > 0 ||
      knowledgeSection.modified > 0 ||
      decisionsSection.added > 0 ||
      decisionsSection.removed > 0 ||
      decisionsSection.modified > 0;

    // 상세 변경 정보 추출
    const details: Record<string, unknown> = {};
    for (const [key, [before, after]] of stateSection.changes.entries()) {
      details[key] = { before, after };
    }

    return {
      meta: metaDiff,
      sections: {
        state: stateSection,
        knowledge: knowledgeSection,
        decisions: decisionsSection,
      },
      hasDifferences,
      details: Object.keys(details).length > 0 ? details : undefined,
    };
  }

  /**
   * 섹션 차이점 생성
   * @param data1 - 첫 번째 데이터
   * @param data2 - 두 번째 데이터
   * @returns 섹션 차이점
   */
  createSectionDiff(data1: SectionData, data2: SectionData): SectionDiff {
    const changes = new Map<string, [unknown, unknown]>();
    const keys1 = new Set(Object.keys(data1 ?? {}));
    const keys2 = new Set(Object.keys(data2 ?? {}));

    let added = 0;
    let removed = 0;
    let modified = 0;

    // 추가/변경된 항목
    for (const key of keys2) {
      if (!keys1.has(key)) {
        added++;
        changes.set(key, [undefined, data2[key]]);
      } else {
        // JSON.stringify 순서 독립적 비교 (sortedKeyReplacer 사용)
        const json1 = JSON.stringify(data1[key], sortedKeyReplacer);
        const json2 = JSON.stringify(data2[key], sortedKeyReplacer);
        if (json1 !== json2) {
          modified++;
          changes.set(key, [data1[key], data2[key]]);
        }
      }
    }

    // 제거된 항목
    for (const key of keys1) {
      if (!keys2.has(key)) {
        removed++;
        changes.set(key, [data1[key], undefined]);
      }
    }

    return { added, removed, modified, changes };
  }

  /**
   * Generic section data extraction
   * @param snapshot - 스냅샷
   * @param section - 섹션 이름
   * @returns 섹션 데이터
   */
  private extractSection<T>(snapshot: Snapshot, section: keyof SerializedState): T {
    try {
      const serialized = decompressSnapshotData(snapshot);
      return (serialized?.[section] as T) ?? ({} as T);
    } catch (error) {
      // Safe error handling: only log error.message to avoid exposing sensitive info
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.(`[SnapshotComparer] extractSection (${section}) failed: ${errorMessage}`);
      return {} as T;
    }
  }

  /**
   * 상태 데이터 추출
   * @param snapshot - 스냅샷
   * @returns 상태 데이터
   */
  extractStateData(snapshot: Snapshot): SectionData {
    return this.extractSection<SectionData>(snapshot, 'state');
  }

  /**
   * 지식 데이터 추출
   * @param snapshot - 스냅샷
   * @returns 지식 데이터
   */
  extractKnowledgeData(snapshot: Snapshot): SectionData {
    return this.extractSection<SectionData>(snapshot, 'knowledge');
  }

  /**
   * 의사결정 데이터 추출
   * @param snapshot - 스냅샷
   * @returns 의사결정 데이터
   */
  extractDecisionsData(snapshot: Snapshot): SectionData {
    return this.extractSection<SectionData>(snapshot, 'decisions');
  }
}
