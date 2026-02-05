/**
 * @module snapshot/snapshot-validator
 * @description 스냅샷 검증 담당
 */

import type { BlackboardState } from '../types';
import type {
  Snapshot,
  SnapshotValidationResult,
  SnapshotValidationError,
  SnapshotValidationWarning,
  SerializedState,
} from './types';
import { StateSerializer, verifyChecksum } from './serializer';
import { decompress, detectCompression } from './compression';
import { SNAPSHOT_FORMAT_VERSION } from './types';

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
 * 스냅샷 검증자
 * @description 스냅샷 검증 전담 클래스
 */
export class SnapshotValidator {
  private serializer: StateSerializer;

  constructor(serializer?: StateSerializer) {
    this.serializer = serializer ?? new StateSerializer({ sortKeys: true });
  }

  /**
   * 스냅샷 검증 (비동기)
   * @param snapshot - 검증할 스냅샷
   * @returns 검증 결과
   */
  async validate(snapshot: Snapshot): Promise<SnapshotValidationResult> {
    const errors: SnapshotValidationError[] = [];
    const warnings: SnapshotValidationWarning[] = [];

    // 1. 기본 구조 검증
    if (!snapshot.meta || !snapshot.data) {
      errors.push({
        code: 'FORMAT_INVALID',
        message: 'Snapshot missing required fields (meta or data)',
      });
      return { valid: false, errors, warnings };
    }

    // 2. 필수 메타데이터 필드 검증
    const { meta } = snapshot;
    if (!meta.id || !meta.formatVersion || !meta.sessionId || !meta.checksum) {
      errors.push({
        code: 'FORMAT_INVALID',
        message: 'Snapshot metadata missing required fields',
        details: meta,
      });
    }

    // 3. 형식 버전 호환성 체크
    const versionCheck = this.checkVersionCompatibility(meta.formatVersion);
    if (!versionCheck.compatible) {
      if (versionCheck.migrationRequired) {
        warnings.push({
          code: 'DEPRECATED_FORMAT',
          message: `Snapshot format ${versionCheck.snapshot} may require migration to ${versionCheck.current}`,
        });
      } else {
        errors.push({
          code: 'VERSION_MISMATCH',
          message: `Incompatible snapshot format: ${versionCheck.snapshot} (current: ${versionCheck.current})`,
        });
      }
    }

    // 4. 데이터 무결성 검증
    if (!meta.compressed && typeof snapshot.data === 'object' && snapshot.data !== null) {
      const isValid = await verifyChecksum(snapshot.data, meta.checksum);
      if (!isValid) {
        errors.push({
          code: 'CHECKSUM_INVALID',
          message: 'Snapshot data checksum does not match metadata',
          details: { expected: meta.checksum },
        });
      }
    }

    // 5. 압축 데이터 검증
    if (meta.compressed && typeof snapshot.data === 'string') {
      try {
        const algorithm = detectCompression(snapshot.data);
        if (!algorithm) {
          errors.push({
            code: 'FORMAT_INVALID',
            message: 'Snapshot marked as compressed but data is not valid compressed format',
          });
        }

        // 압축 데이터 체크섬 검증
        if (meta.compressedChecksum) {
          const checksumValid = await verifyChecksum(snapshot.data, meta.compressedChecksum);
          if (!checksumValid) {
            errors.push({
              code: 'CHECKSUM_INVALID',
              message: 'Compressed data checksum does not match metadata',
              details: { expected: meta.compressedChecksum },
            });
          }
        }
      } catch (e) {
        errors.push({
          code: 'DATA_CORRUPTED',
          message: 'Failed to detect compression format',
          details: e,
        });
      }
    }

    // 6. 런타임 검증 (P0: agents/tasks/opinions 구조 검증)
    if (errors.length === 0) {
      const runtimeValidation = this.validateRuntimeStructure(snapshot);
      if (!runtimeValidation.valid) {
        errors.push(...runtimeValidation.errors);
        warnings.push(...runtimeValidation.warnings);
      }
    }

    // 7. 역직렬화 테스트
    if (errors.length === 0) {
      try {
        let state: SerializedState | undefined;

        if (meta.compressed && typeof snapshot.data === 'string') {
          // 압축 데이터: 먼저 압축 해제 후 역직렬화
          const algorithm = detectCompression(snapshot.data) ?? 'gzip';
          const json = decompress(snapshot.data, algorithm);
          const parsed = JSON.parse(json);

          if (!isSerializedState(parsed)) {
            errors.push({
              code: 'DATA_CORRUPTED',
              message: 'Deserialized state is invalid',
            });
          } else {
            state = parsed;
          }
        } else if (typeof snapshot.data === 'object') {
          // 비압축 데이터: 직접 역직렬화
          if (!isSerializedState(snapshot.data)) {
            errors.push({
              code: 'DATA_CORRUPTED',
              message: 'Deserialized state is invalid',
            });
          } else {
            state = snapshot.data;
          }
        } else {
          errors.push({
            code: 'DATA_CORRUPTED',
            message: 'Invalid snapshot data format',
          });
        }

        if (state && (!state.meta || !state.state)) {
          errors.push({
            code: 'DATA_CORRUPTED',
            message: 'Deserialized state is missing required fields',
          });
        }
      } catch (e) {
        errors.push({
          code: 'DATA_CORRUPTED',
          message: 'Failed to deserialize snapshot data',
          details: e,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
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
    const current = SNAPSHOT_FORMAT_VERSION;
    const snapshot = formatVersion;

    // 동일 버전
    if (current === snapshot) {
      return { compatible: true, current, snapshot, migrationRequired: false };
    }

    // 메이저 버전 체크 (semver 간단 구현)
    const currentMajor = parseInt(current.split('.')[0], 10);
    const snapshotMajor = parseInt(snapshot.split('.')[0], 10);

    if (snapshotMajor > currentMajor) {
      // 미래 버전 - 호환 불가
      return { compatible: false, current, snapshot, migrationRequired: false };
    }

    // 이전 버전 - 마이그레이션 필요 (현재는 미구현)
    return { compatible: true, current, snapshot, migrationRequired: true };
  }

  /**
   * 동기 체크섬 검증 (구조적 검증만, 체크섬 제외)
   * @description restore()에서 사용하는 동기 검증 메서드
   * 체크섬 검증은 비동기이므로 validate()에서 수행해야 함
   * @param snapshot - 검증할 스냅샷
   * @returns 검증 결과
   */
  validateSync(snapshot: Snapshot): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // 1. 기본 구조 검증
    if (!snapshot.meta || !snapshot.data) {
      errors.push('Snapshot missing required fields (meta or data)');
      return { valid: false, errors };
    }

    // 2. 필수 메타데이터 필드 검증
    const { meta } = snapshot;
    if (!meta.id || !meta.formatVersion || !meta.sessionId || !meta.checksum) {
      errors.push('Snapshot metadata missing required fields');
    }

    // 3. 형식 버전 호환성 체크
    const versionCheck = this.checkVersionCompatibility(meta.formatVersion);
    if (!versionCheck.compatible) {
      errors.push(
        `Incompatible snapshot format: ${versionCheck.snapshot} (current: ${versionCheck.current})`
      );
    }

    // 4. 데이터 타입 검증
    if (!meta.compressed && typeof snapshot.data !== 'object') {
      errors.push('Snapshot data must be an object when not compressed');
    }

    if (meta.compressed && typeof snapshot.data !== 'string') {
      errors.push('Snapshot data must be a string when compressed');
    }

    // 5. 압축 데이터 형식 검증
    if (meta.compressed && typeof snapshot.data === 'string') {
      try {
        const algorithm = detectCompression(snapshot.data);
        if (!algorithm) {
          errors.push('Snapshot marked as compressed but data is not valid compressed format');
        }
      } catch (e) {
        errors.push('Failed to detect compression format');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 런타임 구조 검증 (P0: agents/tasks/opinions)
   * @description 역직렬화 후 실제 데이터 구조 검증
   */
  private validateRuntimeStructure(snapshot: Snapshot): {
    valid: boolean;
    errors: SnapshotValidationError[];
    warnings: SnapshotValidationWarning[];
  } {
    const errors: SnapshotValidationError[] = [];
    const warnings: SnapshotValidationWarning[] = [];

    try {
      let serializedState: SerializedState | undefined;

      // 압축 데이터 처리
      if (snapshot.meta.compressed && typeof snapshot.data === 'string') {
        const algorithm = detectCompression(snapshot.data) ?? 'gzip';
        const json = decompress(snapshot.data, algorithm);
        const parsed = JSON.parse(json);
        serializedState = isSerializedState(parsed) ? parsed : undefined;
      } else if (typeof snapshot.data === 'object' && isSerializedState(snapshot.data)) {
        serializedState = snapshot.data;
      }

      // 타입 가드 실패 시 에러 반환
      if (!serializedState) {
        errors.push({
          code: 'DATA_CORRUPTED',
          message: 'Failed to parse serialized state data',
        });
        return { valid: false, errors, warnings };
      }

      // state 섹션 검증
      if (serializedState.state) {
        const stateSection = serializedState.state;

        // agents 검증: Array<[string, unknown]> 형식
        if (stateSection.agents) {
          if (!Array.isArray(stateSection.agents)) {
            errors.push({
              code: 'DATA_CORRUPTED',
              message: 'state.agents must be an array of [id, data] tuples',
            });
          } else {
            for (let i = 0; i < stateSection.agents.length; i++) {
              const item = stateSection.agents[i];
              if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string') {
                errors.push({
                  code: 'DATA_CORRUPTED',
                  message: `state.agents[${i}] must be a [string, unknown] tuple`,
                });
                break;
              }
            }
          }
        }

        // tasks 검증: Array<[string, unknown]> 형식
        if (stateSection.tasks) {
          if (!Array.isArray(stateSection.tasks)) {
            errors.push({
              code: 'DATA_CORRUPTED',
              message: 'state.tasks must be an array of [id, data] tuples',
            });
          } else {
            for (let i = 0; i < stateSection.tasks.length; i++) {
              const item = stateSection.tasks[i];
              if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string') {
                errors.push({
                  code: 'DATA_CORRUPTED',
                  message: `state.tasks[${i}] must be a [string, unknown] tuple`,
                });
                break;
              }
            }
          }
        }
      }

      // decisions 섹션 검증
      if (serializedState?.decisions) {
        const decisionsSection = serializedState.decisions;

        // opinions 검증: Array<[string, unknown]> 형식
        if (decisionsSection.opinions) {
          if (!Array.isArray(decisionsSection.opinions)) {
            errors.push({
              code: 'DATA_CORRUPTED',
              message: 'decisions.opinions must be an array of [id, data] tuples',
            });
          } else {
            for (let i = 0; i < decisionsSection.opinions.length; i++) {
              const item = decisionsSection.opinions[i];
              if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string') {
                errors.push({
                  code: 'DATA_CORRUPTED',
                  message: `decisions.opinions[${i}] must be a [string, unknown] tuple`,
                });
                break;
              }
            }
          }
        }
      }
    } catch (e) {
      errors.push({
        code: 'DATA_CORRUPTED',
        message: 'Failed to validate runtime structure',
        details: e,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
