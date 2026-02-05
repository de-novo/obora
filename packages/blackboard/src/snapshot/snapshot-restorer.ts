/**
 * @module snapshot/snapshot-restorer
 * @description 스냅샷 복원 담당
 */

import type { BlackboardState, SessionId } from '../types';
import type {
  Snapshot,
  RestoreSnapshotOptions,
  SerializedState,
} from './types';
import { StateSerializer } from './serializer';
import { decompress, detectCompression } from './compression';
import { SnapshotValidator } from './snapshot-validator';
import { createIdGenerator, type IdGenerator } from './id-utils';

/**
 * 스냅샷 복원 에러
 */
export class SnapshotRestoreError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'SnapshotRestoreError';
  }
}

/**
 * 스냅샷 복원자 설정
 */
export interface SnapshotRestorerOptions {
  /** ID 생성 함수 */
  idGenerator?: IdGenerator;
}

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
 * 스냅샷 복원자
 * @description 스냅샷 복원 전담 클래스
 */
export class SnapshotRestorer {
  private serializer: StateSerializer;
  private validator: SnapshotValidator;
  private idGenerator: IdGenerator;

  constructor(options: SnapshotRestorerOptions = {}) {
    this.serializer = new StateSerializer({ sortKeys: true });
    this.validator = new SnapshotValidator(this.serializer);
    this.idGenerator = createIdGenerator(options.idGenerator);
  }

  /**
   * 스냅샷에서 상태 복원
   * @param snapshot - 스냅샷
   * @param options - 복원 옵션
   * @returns 복원된 상태
   * @throws {SnapshotRestoreError} 복원 실패 시
   * @description
   * **옵션 동작:**
   * - `skipVersionCheck`: 포맷 버전 호환성 검사 건너뜀
   * - `skipChecksumValidation`: 메타데이터 체크섬 검증 건너뜀
   *   - 참고: `validateSync()`는 구조/타입 검증만 수행, 체크섬 검증 X
   * - `resetVersion`: 상태 버전 0으로 초기화 (기본: true)
   * - `newSessionId`: 새 세션 ID 생성 (기본: true)
   */
  restore(
    snapshot: Snapshot,
    options?: RestoreSnapshotOptions
  ): BlackboardState {
    const opts = options ?? {};

    // 1. 버전 호환성 체크
    if (!opts.skipVersionCheck) {
      const versionCheck = this.validator.checkVersionCompatibility(snapshot.meta.formatVersion);
      if (!versionCheck.compatible) {
        throw new SnapshotRestoreError(
          `Incompatible snapshot format: ${versionCheck.snapshot}`,
          'VERSION_MISMATCH',
          { current: versionCheck.current, snapshot: versionCheck.snapshot }
        );
      }
    }

    // 2. 데이터 역직렬화
    let serialized: SerializedState;

    if (snapshot.meta.compressed) {
      if (typeof snapshot.data !== 'string') {
        throw new SnapshotRestoreError(
          'Invalid compressed data format',
          'DATA_CORRUPTED'
        );
      }

      try {
        const algorithm = detectCompression(snapshot.data) ?? 'gzip';
        const json = decompress(snapshot.data, algorithm);
        const parsed = JSON.parse(json);

        // 타입 가드로 안전하게 타입 확인
        if (!isSerializedState(parsed)) {
          throw new SnapshotRestoreError(
            'Invalid snapshot data structure',
            'DATA_CORRUPTED'
          );
        }

        serialized = parsed;
      } catch (e) {
        if (e instanceof Error) {
          throw new SnapshotRestoreError(
            `Failed to decompress snapshot data: ${e.message}`,
            'DATA_CORRUPTED',
            e
          );
        }
        throw new SnapshotRestoreError(
          'Failed to decompress snapshot data',
          'DATA_CORRUPTED',
          e
        );
      }
    } else {
      // 타입 가드로 안전하게 타입 확인
      if (!isSerializedState(snapshot.data)) {
        throw new SnapshotRestoreError(
          'Invalid snapshot data structure',
          'DATA_CORRUPTED'
        );
      }
      serialized = snapshot.data;
    }

    // 3. 구조/타입 검증 (체크섬 X)
    if (!opts.skipChecksumValidation) {
      const syncValidation = this.validator.validateSync(snapshot);
      if (!syncValidation.valid) {
        throw new SnapshotRestoreError(
          `Snapshot validation failed: ${syncValidation.errors.join(', ')}`,
          'VALIDATION_FAILED',
          syncValidation.errors
        );
      }
    }

    // 4. State 역직렬화
    let state = this.serializer.deserialize(serialized);

    // 5. 버전/세션 ID 처리
    if (opts.resetVersion !== false) {
      state.meta.version = 0;
      state.meta.lastUpdated = new Date();
    }

    if (opts.newSessionId !== false) {
      const newId = this.idGenerator();
      if (typeof newId !== 'string') {
        throw new SnapshotRestoreError(
          'idGenerator must return a string',
          'INVALID_SESSION_ID'
        );
      }
      state.meta.sessionId = newId as SessionId;
    }

    return state;
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
    // 스냅샷 복원
    const snapshotState = this.restore(snapshot, {
      skipVersionCheck: true,
      skipChecksumValidation: true,
      resetVersion: false,
      newSessionId: false,
    });

    // 깊은 복사
    const result: BlackboardState = structuredClone(currentState);

    // 섹션별 병합
    if (sections.includes('state') && snapshotState.state) {
      result.state = snapshotState.state;
      result.meta.version = snapshotState.meta.version;
      result.meta.lastUpdated = snapshotState.meta.lastUpdated;
    }

    if (sections.includes('knowledge') && snapshotState.knowledge) {
      result.knowledge = snapshotState.knowledge;
    }

    if (sections.includes('decisions') && snapshotState.decisions) {
      result.decisions = snapshotState.decisions;
    }

    return result;
  }
}
