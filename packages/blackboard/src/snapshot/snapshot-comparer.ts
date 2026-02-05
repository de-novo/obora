/**
 * @module snapshot/snapshot-comparer
 * @description 스냅샷 비교 담당
 */

import type { Snapshot } from './types';
import type { SerializedState } from './types';
import { decompress, detectCompression } from './compression';

/**
 * 타입 가드: SerializedState 여부 확인
 */
function isSerializedState(value: unknown): value is SerializedState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Partial<SerializedState>;

  // meta 필드 필수 확인
  if (!obj.meta || typeof obj.meta !== 'object') {
    return false;
  }

  // meta의 필수 필드 확인
  const meta = obj.meta;
  if (!meta.sessionId || typeof meta.sessionId !== 'string') {
    return false;
  }
  if (typeof meta.version !== 'number') {
    return false;
  }

  return true;
}

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

    return {
      meta: metaDiff,
      sections: {
        state: stateSection,
        knowledge: this.createSectionDiff(
          this.extractKnowledgeData(a),
          this.extractKnowledgeData(b)
        ),
        decisions: this.createSectionDiff(
          this.extractDecisionsData(a),
          this.extractDecisionsData(b)
        ),
      },
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
      } else if (JSON.stringify(data1[key]) !== JSON.stringify(data2[key])) {
        modified++;
        changes.set(key, [data1[key], data2[key]]);
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
   * 스냅샷 데이터 압축 해제 (공통 헬퍼)
   * @param snapshot - 스냅샷
   * @returns 역직렬화된 상태 데이터
   * @throws {Error} 압축 해제 실패 또는 타입 불일치 시
   */
  private decompressData(snapshot: Snapshot): SerializedState {
    if (!snapshot.meta.compressed) {
      if (!isSerializedState(snapshot.data)) {
        throw new Error('Invalid snapshot data: not a SerializedState');
      }
      return snapshot.data;
    }

    if (typeof snapshot.data !== 'string') {
      throw new Error('Invalid compressed data: expected string');
    }

    const algorithm = detectCompression(snapshot.data) ?? 'gzip';
    const json = decompress(snapshot.data, algorithm);
    const parsed = JSON.parse(json);

    if (!isSerializedState(parsed)) {
      throw new Error('Invalid snapshot data: deserialized data is not a SerializedState');
    }

    return parsed;
  }

  /**
   * 상태 데이터 추출
   * @param snapshot - 스냅샷
   * @returns 상태 데이터
   */
  extractStateData(snapshot: Snapshot): SectionData {
    const serialized = this.decompressData(snapshot);
    return serialized?.state ?? {};
  }

  /**
   * 지식 데이터 추출
   * @param snapshot - 스냅샷
   * @returns 지식 데이터
   */
  extractKnowledgeData(snapshot: Snapshot): SectionData {
    const serialized = this.decompressData(snapshot);
    return serialized?.knowledge ?? {};
  }

  /**
   * 의사결정 데이터 추출
   * @param snapshot - 스냅샷
   * @returns 의사결정 데이터
   */
  extractDecisionsData(snapshot: Snapshot): SectionData {
    const serialized = this.decompressData(snapshot);
    return serialized?.decisions ?? {};
  }
}
