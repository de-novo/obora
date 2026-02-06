/**
 * @module snapshot/snapshot-restorer
 * @description 스냅샷 복원 담당
 */

import type { BlackboardState, SessionId } from '../types';
import type {
  Snapshot,
  RestoreSnapshotOptions,
} from './types';
import type { SerializedState } from './types';
import { StateSerializer } from './serializer';
import { decompressSnapshotData } from './utils';
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
  idGenerator?: () => string;
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
   * - `skipStructuralValidation`: 구조적 검증 건너뜀 (validateSync)
   *   - 참고: 체크섬 검증은 validate()에서 수행됨
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

    try {
      serialized = decompressSnapshotData(snapshot);
    } catch (e) {
      // P2: catch 블록 타입 명시
      const error = e instanceof Error ? e : new Error(String(e));
      throw new SnapshotRestoreError(
        `Failed to deserialize snapshot data: ${error.message}`,
        'DATA_CORRUPTED',
        error
      );
    }

    // 3. 구조/타입 검증 (체크섬 X)
    if (!opts.skipStructuralValidation) {
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
      skipStructuralValidation: true,
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
