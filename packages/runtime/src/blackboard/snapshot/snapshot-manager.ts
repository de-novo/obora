/**
 * @module snapshot/snapshot-manager
 * @description 스냅샷 관리자 (파사드 패턴)
 */

import type { BlackboardState } from '../types';
import type {
  Snapshot,
  SnapshotMeta,
  CreateSnapshotOptions,
  RestoreSnapshotOptions,
  SnapshotValidationResult,
} from './types';
import type {
  SnapshotCreatorOptions,
} from './snapshot-creator';
import type {
  SnapshotRestorerOptions,
} from './snapshot-restorer';
import type {
  SnapshotDiff,
  SectionDiff,
  SectionData,
} from './snapshot-comparer';

import { SnapshotCreator } from './snapshot-creator';
import { SnapshotValidator } from './snapshot-validator';
import {
  SnapshotRestorer,
  SnapshotRestoreError,
} from './snapshot-restorer';
import { SnapshotSerializer } from './snapshot-serializer';
import {
  SnapshotComparer,
} from './snapshot-comparer';

/**
 * 스냅샷 목록 필터 옵션
 */
export interface ListSnapshotOptions {
  /** 태그로 필터링 */
  tags?: string[];
  /** 세션 ID로 필터링 */
  sessionId?: string;
  /** 정렬 기준 */
  sortBy?: 'date' | 'id';
  /** 정렬 순서 */
  order?: 'asc' | 'desc';
}

/**
 * 스냅샷 관리자 설정
 */
export interface SnapshotManagerOptions extends SnapshotCreatorOptions, SnapshotRestorerOptions {
  /** 자동 압축 임계값 (바이트, 기본: 10KB) */
  autoCompressThreshold?: number;
  /** 기본 압축 사용 */
  defaultCompress?: boolean;
  /** ID 생성 함수 */
  idGenerator?: () => string;
}

/**
 * 스냅샷 복원 에러
 */
export { SnapshotRestoreError };

/**
 * 스냅샷 관리자
 * @description Blackboard 상태의 스냅샷 생성, 검증, 복원 담당
 *
 * 파사드 패턴으로 각 전문 클래스를 조합하여 기존 API 유지
 *
 * @example
 * ```typescript
 * const manager = new SnapshotManager();
 *
 * // 스냅샷 생성
 * const snapshot = await manager.createSnapshot(board.getState(), {
 *   description: 'Before major decision',
 *   tags: ['checkpoint', 'decision-001'],
 *   compress: true,
 * });
 *
 * // JSON으로 저장
 * const json = manager.toJSON(snapshot);
 * fs.writeFileSync('snapshot.json', json);
 *
 * // JSON에서 로드
 * const loaded = manager.fromJSON(fs.readFileSync('snapshot.json', 'utf-8'));
 *
 * // 검증
 * const validation = await manager.validate(loaded);
 * if (!validation.valid) {
 *   console.error('Invalid snapshot:', validation.errors);
 * }
 *
 * // 복원
 * const restoredState = manager.restore(loaded, {
 *   newSessionId: true,
 * });
 * board.replaceState(restoredState);
 * ```
 */
export class SnapshotManager {
  private creator: SnapshotCreator;
  private validator: SnapshotValidator;
  private restorer: SnapshotRestorer;
  private serializer: SnapshotSerializer;
  private comparer: SnapshotComparer;
  private storage: Map<string, Snapshot> = new Map();

  constructor(options: SnapshotManagerOptions = {}) {
    // 각 전문 클래스 초기화
    this.creator = new SnapshotCreator(options);
    this.validator = new SnapshotValidator();
    this.restorer = new SnapshotRestorer(options);
    this.serializer = new SnapshotSerializer();
    this.comparer = new SnapshotComparer();
  }

  // === 내부 저장소 관리 ===

  /**
   * 스냅샷 저장 (내부)
   */
  private storeSnapshot(snapshot: Snapshot): void {
    this.storage.set(snapshot.meta.id, snapshot);
  }

  /**
   * 저장된 스냅샷 목록 조회
   * @param options - 필터 및 정렬 옵션
   * @returns 스냅샷 목록
   */
  list(options?: ListSnapshotOptions): Snapshot[] {
    const snapshots = Array.from(this.storage.values())
      .filter(snapshot =>
        options?.tags && options.tags.length > 0
          ? options.tags.some(tag =>
            snapshot.meta.tags?.includes(tag)
          )
          : true
      )
      .filter(snapshot =>
        options?.sessionId
          ? snapshot.meta.sessionId === options.sessionId
          : true
      );

    if (!options?.sortBy) {
      return snapshots;
    }

    return [...snapshots].sort((a, b) => {
      const comparison = options.sortBy === 'date'
        ? a.meta.createdAt.getTime() - b.meta.createdAt.getTime()
        : a.meta.id.localeCompare(b.meta.id);

      return options.order === 'desc' ? -comparison : comparison;
    });
  }

  /**
   * ID로 스냅샷 조회
   * @param id - 스냅샷 ID
   * @returns 스냅샷 또는 undefined
   */
  get(id: string): Snapshot | undefined {
    return this.storage.get(id);
  }

  /**
   * ID로 스냅샷 삭제
   * @param id - 스냅샷 ID
   * @returns 삭제 성공 여부
   */
  delete(id: string): boolean {
    return this.storage.delete(id);
  }

  // === 생성 (SnapshotCreator 위임) ===

  /**
   * 스냅샷 생성 (동기)
   * @param state - 현재 Blackboard 상태
   * @param options - 생성 옵션
   * @returns 스냅샷
   */
  createSnapshot(
    state: BlackboardState,
    options?: CreateSnapshotOptions
  ): Snapshot {
    const snapshot = this.creator.createSnapshot(state, options);

    // store 옵션이 true면 내부 저장소에 저장
    if (options?.store === true) {
      this.storeSnapshot(snapshot);
    }

    return snapshot;
  }

  /**
   * 메타데이터만 포함된 스냅샷 생성 (동기)
   * @param state - 현재 상태
   * @param description - 설명
   * @returns 메타 전용 스냅샷
   */
  createMetaSnapshot(
    state: BlackboardState,
    description?: string
  ): SnapshotMeta {
    return this.creator.createMetaSnapshot(state, description);
  }

  // === 검증 (SnapshotValidator 위임) ===

  /**
   * 스냅샷 검증 (동기)
   * @param snapshot - 검증할 스냅샷
   * @returns 검증 결과
   */
  validate(snapshot: Snapshot): SnapshotValidationResult {
    return this.validator.validateSync(snapshot);
  }

  /**
   * 스냅샷 검증 (비동기)
   * @param snapshot - 검증할 스냅샷
   * @returns 검증 결과
   */
  async validateAsync(snapshot: Snapshot): Promise<SnapshotValidationResult> {
    return this.validator.validate(snapshot);
  }

  /**
   * 버전 호환성 체크
   * @param formatVersion - 스냅샷 형식 버전
   * @returns 호환 여부 및 상세 정보
   */
  checkVersionCompatibility(formatVersion: string): {
    compatible: boolean;
    current: string;
    snapshot: string;
    migrationRequired: boolean;
  } {
    return this.validator.checkVersionCompatibility(formatVersion);
  }

  /**
   * 동기 체크섬 검증 (구조적 검증만, 체크섬 제외)
   * @description restore()에서 사용하는 동기 검증 메서드
   * @param snapshot - 검증할 스냅샷
   * @returns 검증 결과
   */
  validateSyncStructure(snapshot: Snapshot): {
    valid: boolean;
    errors: string[];
  } {
    return this.validator.validateSyncStructure(snapshot);
  }

  // === 복원 (SnapshotRestorer 위임) ===

  /**
   * 스냅샷에서 상태 복원
   * @param snapshot - 스냅샷
   * @param options - 복원 옵션
   * @returns 복원된 상태
   * @throws {SnapshotRestoreError} 복원 실패 시
   * @description
   * **옵션 동작:**
   * - `skipVersionCheck`: 포맷 버전 호환성 검사 건너뜀
   * - `skipStructuralValidation`: 구조적 검증 건너뜀 (validateSync)
   * - `resetVersion`: 상태 버전 0으로 초기화 (기본: true)
   * - `newSessionId`: 새 세션 ID 생성 (기본: true)
   */
  restore(
    snapshot: Snapshot,
    options?: RestoreSnapshotOptions
  ): BlackboardState {
    return this.restorer.restore(snapshot, options);
  }

  /**
   * 부분 복원 (특정 섹션만)
   * @param snapshot - 스냅샷
   * @param currentState - 현재 상태
   * @param sections - 복원할 섹션
   * @returns 병합된 상태
   */
  partialRestore(
    snapshot: Snapshot,
    currentState: BlackboardState,
    sections: ('state' | 'knowledge' | 'decisions')[]
  ): BlackboardState {
    return this.restorer.partialRestore(snapshot, currentState, sections);
  }

  // === 직렬화 (SnapshotSerializer 위임) ===

  /**
   * 스냅샷 → JSON 문자열
   * @param snapshot - 스냅샷
   * @param pretty - 예쁜 출력 여부
   * @returns JSON 문자열
   */
  toJSON(snapshot: Snapshot, pretty = false): string {
    return this.serializer.toJSON(snapshot, pretty);
  }

  /**
   * JSON 문자열 → 스냅샷
   * @param json - JSON 문자열
   * @returns 스냅샷
   * @throws {Error} JSON 파싱 실패 시 명확한 에러 메시지
   */
  fromJSON(json: string): Snapshot {
    return this.serializer.fromJSON(json);
  }

  /**
   * 스냅샷 → Uint8Array (바이너리)
   * @param snapshot - 스냅샷
   * @returns Uint8Array
   */
  toUint8Array(snapshot: Snapshot): Uint8Array {
    return this.serializer.toUint8Array(snapshot);
  }

  /**
   * Uint8Array → 스냅샷
   * @param bytes - 바이트 배열
   * @returns 스냅샷
   * @throws {Error} 디코딩 실패 시 명확한 에러 메시지
   */
  fromUint8Array(bytes: Uint8Array): Snapshot {
    return this.serializer.fromUint8Array(bytes);
  }

  // === 비교 (SnapshotComparer 위임) ===

  /**
   * 스냅샷 비교
   * @param a - 첫 번째 스냅샷
   * @param b - 두 번째 스냅샷
   * @returns 차이점 목록
   */
  compare(a: Snapshot, b: Snapshot): SnapshotDiff {
    return this.comparer.compare(a, b);
  }

  /**
   * 섹션 차이점 생성
   * @param data1 - 첫 번째 데이터
   * @param data2 - 두 번째 데이터
   * @returns 섹션 차이점
   */
  createSectionDiff(data1: SectionData, data2: SectionData): SectionDiff {
    return this.comparer.createSectionDiff(data1, data2);
  }

  /**
   * 상태 데이터 추출
   * @param snapshot - 스냅샷
   * @returns 상태 데이터
   */
  extractStateData(snapshot: Snapshot): SectionData {
    return this.comparer.extractStateData(snapshot);
  }

  /**
   * 지식 데이터 추출
   * @param snapshot - 스냅샷
   * @returns 지식 데이터
   */
  extractKnowledgeData(snapshot: Snapshot): SectionData {
    return this.comparer.extractKnowledgeData(snapshot);
  }

  /**
   * 의사결정 데이터 추출
   * @param snapshot - 스냅샷
   * @returns 의사결정 데이터
   */
  extractDecisionsData(snapshot: Snapshot): SectionData {
    return this.comparer.extractDecisionsData(snapshot);
  }

  // === 유틸리티 ===

  /**
   * 스냅샷 메타데이터만 추출
   */
  extractMeta(snapshot: Snapshot): SnapshotMeta {
    return snapshot.meta;
  }

  /**
   * 스냅샷 크기 계산 (숫자)
   * @param snapshot - 스냅샷
   * @returns 바이트 크기
   */
  size(snapshot: Snapshot): number {
    const metaSize = JSON.stringify(snapshot.meta).length;
    const dataSize =
      typeof snapshot.data === 'string'
        ? snapshot.data.length
        : JSON.stringify(snapshot.data).length;

    return metaSize + dataSize;
  }

  /**
   * 스냅샷 크기 계산 (상세)
   */
  calculateSize(snapshot: Snapshot): {
    total: number;
    data: number;
    meta: number;
    compressed: boolean;
  } {
    const metaSize = JSON.stringify(snapshot.meta).length;
    const dataSize =
      typeof snapshot.data === 'string'
        ? snapshot.data.length
        : JSON.stringify(snapshot.data).length;

    return {
      total: metaSize + dataSize,
      data: dataSize,
      meta: metaSize,
      compressed: snapshot.meta.compressed,
    };
  }
}
