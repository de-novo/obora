/**
 * @module snapshot/types
 * @description 스냅샷 타입 정의
 */

import type { BlackboardState, SessionId } from '../types';

/**
 * 스냅샷 형식 버전
 * @description 역직렬화 시 호환성 체크에 사용
 */
export const SNAPSHOT_FORMAT_VERSION = '1.0.0';

/**
 * 스냅샷 메타데이터
 */
export interface SnapshotMeta {
  /** 스냅샷 ID */
  readonly id: string;
  /** 스냅샷 형식 버전 */
  readonly formatVersion: string;
  /** 생성 시간 */
  readonly createdAt: Date;
  /** 원본 세션 ID */
  readonly sessionId: SessionId;
  /** 원본 상태 버전 */
  readonly stateVersion: number;
  /** 스냅샷 설명 (선택) */
  readonly description?: string;
  /** 스냅샷 태그 (선택) */
  readonly tags?: string[];
  /** 체크섬 (무결성 검증용) */
  readonly checksum: string;
  /** 압축 데이터 체크섬 */
  readonly compressedChecksum?: string;
  /** 압축 여부 */
  readonly compressed: boolean;
  /** 원본 크기 (바이트) */
  readonly originalSize: number;
  /** 압축 크기 (바이트, 압축 시) */
  readonly compressedSize?: number;
}

/**
 * 직렬화된 상태
 * @description Map, Date 등이 JSON 호환 형식으로 변환됨
 */
export interface SerializedState {
  meta: {
    version: number;
    lastUpdated: string; // ISO 8601
    sessionId: string;
    createdAt: string;
  };
  state: {
    phase: string;
    context: Record<string, unknown>;
    agents: Array<[string, unknown]>; // Map<AgentId, AgentStatus> entries
    tasks: Array<[string, unknown]>; // Map<TaskId, Task> entries
  };
  knowledge: {
    facts: unknown[]; // Fact[]
    inferences: unknown[]; // Inference[]
    patterns: unknown[]; // Pattern[]
  };
  decisions: {
    current: unknown | null; // Agenda | null
    pending: unknown[]; // Agenda[]
    opinions: Array<[string, unknown]>; // Map<string, Opinion> entries
    history: unknown[]; // Resolution[]
  };
}

/**
 * 전체 스냅샷 구조
 */
export interface Snapshot {
  /** 메타데이터 */
  meta: SnapshotMeta;
  /** 직렬화된 상태 데이터 */
  data: SerializedState | string; // string when compressed
}

/**
 * 스냅샷 생성 옵션
 */
export interface CreateSnapshotOptions {
  /** 스냅샷 설명 */
  description?: string;
  /** 태그 */
  tags?: string[];
  /** 압축 사용 여부 (기본: false) */
  compress?: boolean;
  /** 특정 섹션만 포함 */
  includeSections?: ('state' | 'knowledge' | 'decisions')[];
  /** 메타만 포함 (상태 제외) */
  metaOnly?: boolean;
}

/**
 * 스냅샷 복원 옵션
 */
export interface RestoreSnapshotOptions {
  /** 버전 체크 건너뛰기 */
  skipVersionCheck?: boolean;
  /** 체크섬 검증 건너뛰기 */
  skipChecksumValidation?: boolean;
  /** 특정 섹션만 복원 */
  restoreSections?: ('state' | 'knowledge' | 'decisions')[];
  /** 복원 후 버전 리셋 여부 (기본: true) */
  resetVersion?: boolean;
  /** 새 세션 ID 발급 (기본: true) */
  newSessionId?: boolean;
}

/**
 * 스냅샷 검증 결과
 */
export interface SnapshotValidationResult {
  /** 유효 여부 */
  valid: boolean;
  /** 에러 목록 */
  errors: SnapshotValidationError[];
  /** 경고 목록 */
  warnings: SnapshotValidationWarning[];
}

/**
 * 검증 에러
 */
export interface SnapshotValidationError {
  code: 'VERSION_MISMATCH' | 'CHECKSUM_INVALID' | 'DATA_CORRUPTED' | 'FORMAT_INVALID';
  message: string;
  details?: unknown;
}

/**
 * 검증 경고
 */
export interface SnapshotValidationWarning {
  code: 'DEPRECATED_FORMAT' | 'UNKNOWN_FIELDS' | 'PARTIAL_DATA';
  message: string;
  details?: unknown;
}

/**
 * 스냅샷 마이그레이션 인터페이스
 * @description 스냅샷 데이터 버전 간 마이그레이션을 위한 인터페이스
 */
export interface SnapshotMigration {
  /** 원본 버전 */
  fromVersion: number;
  /** 대상 버전 */
  toVersion: number;
  /** 마이그레이션 함수 */
  migrate(data: unknown): unknown;
}
