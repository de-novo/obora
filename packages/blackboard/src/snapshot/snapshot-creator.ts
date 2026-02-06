/**
 * @module snapshot/snapshot-creator
 * @description 스냅샷 생성 담당
 */

import type { BlackboardState } from '../types';
import type {
  Snapshot,
  SnapshotMeta,
  CreateSnapshotOptions,
  SerializedState,
} from './types';
import { StateSerializer, calculateChecksum } from './serializer';
import { compress } from './compression';
import { SNAPSHOT_FORMAT_VERSION } from './types';
import { createIdGenerator, type IdGenerator } from './id-utils';

/**
 * 스냅샷 생성자 설정
 */
export interface SnapshotCreatorOptions {
  /** 자동 압축 임계값 (바이트, 기본: 10KB) */
  autoCompressThreshold?: number;
  /** 기본 압축 사용 */
  defaultCompress?: boolean;
  /** ID 생성 함수 */
  idGenerator?: IdGenerator;
}

/**
 * 스냅샷 생성자
 * @description 스냅샷 생성 전담 클래스
 */
export class SnapshotCreator {
  private serializer: StateSerializer;
  private options: Required<SnapshotCreatorOptions>;

  constructor(options: SnapshotCreatorOptions = {}) {
    this.options = this.normalizeOptions(options);
    this.serializer = new StateSerializer({ sortKeys: true });
  }

  /**
   * 옵션 정규화
   */
  private normalizeOptions(options: SnapshotCreatorOptions): Required<SnapshotCreatorOptions> {
    return {
      autoCompressThreshold: options.autoCompressThreshold ?? 10_240, // 10KB
      defaultCompress: options.defaultCompress ?? false,
      idGenerator: createIdGenerator(options.idGenerator),
    };
  }

  /**
   * ID 생성자 가져오기
   */
  getIdGenerator(): IdGenerator {
    return this.options.idGenerator;
  }

  /**
   * 스냅샷 생성 (비동기)
   * @param state - 현재 Blackboard 상태
   * @param options - 생성 옵션
   * @returns 스냅샷
   */
  async createSnapshot(
    state: BlackboardState,
    options?: CreateSnapshotOptions
  ): Promise<Snapshot> {
    const serialized = this.serializer.serialize(state);
    const metaOnly = options?.metaOnly ?? false;

    // P1: 섹션 필터링 타입 안전성 개선 - 명시적 구조 사용
    let stateData: SerializedState = serialized;

    if (options?.includeSections) {
      const sections = options.includeSections;
      // 명시적 구조로 타입 안전성 확보
      const filteredState: SerializedState = {
        meta: serialized.meta,
        state: sections.includes('state') ? serialized.state : {
          phase: serialized.state.phase,
          context: serialized.state.context,
          agents: [],
          tasks: [],
        },
        knowledge: sections.includes('knowledge') ? serialized.knowledge : {
          facts: [],
          inferences: [],
          patterns: [],
        },
        decisions: sections.includes('decisions') ? serialized.decisions : {
          current: null,
          pending: [],
          opinions: [],
          history: [],
        },
      };
      stateData = filteredState;
    }

    // 압축 결정
    const shouldCompress = options?.compress ?? this.options.defaultCompress;
    const threshold = this.options.autoCompressThreshold;
    const originalSize = JSON.stringify(stateData, null, 0).length;
    const autoCompress = shouldCompress || originalSize >= threshold;

    let data: SerializedState | string;
    let compressedSize: number | undefined;
    let compressedChecksum: string | undefined;
    const compressed = autoCompress && !metaOnly;

    // 체크섬 계산 (metaOnly 모드에서는 빈 객체 기준)
    let checksum: string;
    try {
      if (metaOnly) {
        const emptyState: SerializedState = {
          meta: { version: 0, lastUpdated: '', sessionId: '', createdAt: '' },
          state: { phase: '', context: {}, agents: [], tasks: [] },
          knowledge: { facts: [], inferences: [], patterns: [] },
          decisions: { current: null, pending: [], opinions: [], history: [] },
        };
        checksum = await calculateChecksum(emptyState);
      } else {
        checksum = await calculateChecksum(serialized);
      }
    } catch (e) {
      throw new Error(`Failed to calculate checksum: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (metaOnly) {
      // metaOnly 모드에서는 데이터를 포함하지 않음
      data = {
        meta: { version: 0, lastUpdated: '', sessionId: '', createdAt: '' },
        state: { phase: '', context: {}, agents: [], tasks: [] },
        knowledge: { facts: [], inferences: [], patterns: [] },
        decisions: { current: null, pending: [], opinions: [], history: [] },
      };
    } else if (compressed) {
      const json = JSON.stringify(serialized);
      try {
        const compressedString = compress(json, { level: 6 });
        data = compressedString;
        compressedSize = compressedString.length;

        // 압축 데이터 체크섬 검증
        compressedChecksum = await calculateChecksum(compressedString);
      } catch (e) {
        throw new Error(`Failed to compress snapshot data: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      data = serialized;
    }

    // 메타데이터 생성
    const meta: SnapshotMeta = {
      id: this.options.idGenerator(),
      formatVersion: SNAPSHOT_FORMAT_VERSION,
      createdAt: new Date(),
      sessionId: state.meta.sessionId,
      stateVersion: state.meta.version,
      description: options?.description,
      tags: options?.tags,
      checksum,
      compressedChecksum,
      compressed,
      originalSize,
      compressedSize,
    };

    return { meta, data };
  }

  /**
   * 메타데이터만 포함된 스냅샷 생성 (비동기)
   * @param state - 현재 상태
   * @param description - 설명
   * @returns 메타 전용 스냅샷
   */
  async createMetaSnapshot(
    state: BlackboardState,
    description?: string
  ): Promise<SnapshotMeta> {
    const snapshot = await this.createSnapshot(state, { metaOnly: true, description });
    return snapshot.meta;
  }
}
