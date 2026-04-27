# TASK-021: 스냅샷/복원 기능

## 개요
- **상태**: ✅ 완료
- **우선순위**: P1
- **예상 소요**: 4시간
- **담당**: 개발자
- **의존성**: TASK-019 (Blackboard Core)

## 목표
Blackboard 상태의 스냅샷 생성 및 복원 기능 구현. JSON 직렬화/역직렬화, 버전 호환성 체크 포함.

---

## 작업 내용

### 1. 스냅샷 타입 정의 (`snapshot/types.ts`)

```typescript
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
    agents: Array<[string, unknown]>; // Map entries
    tasks: Array<[string, unknown]>;
  };
  knowledge: {
    facts: unknown[];
    inferences: unknown[];
    patterns: unknown[];
  };
  decisions: {
    current: unknown | null;
    pending: unknown[];
    opinions: Array<[string, unknown]>;
    history: unknown[];
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
```

### 2. 직렬화/역직렬화 (`snapshot/serializer.ts`)

```typescript
import type { BlackboardState, AgentId, TaskId, AgendaId } from '../types';
import type { SerializedState } from './types';

/**
 * 직렬화 옵션
 */
export interface SerializeOptions {
  /** 날짜 형식 (기본: 'iso') */
  dateFormat?: 'iso' | 'timestamp';
  /** 정렬된 키 (재현 가능한 출력용) */
  sortKeys?: boolean;
  /** 들여쓰기 (기본: 0 = 압축) */
  indent?: number;
}

/**
 * 상태 직렬화기
 * @description Map, Date 등을 JSON 호환 형식으로 변환
 */
export class StateSerializer {
  constructor(private options: SerializeOptions = {}) {}

  /**
   * BlackboardState → SerializedState
   * @param state - 원본 상태
   * @returns 직렬화된 상태
   */
  serialize(state: BlackboardState): SerializedState;

  /**
   * SerializedState → BlackboardState
   * @param serialized - 직렬화된 상태
   * @returns 복원된 상태
   */
  deserialize(serialized: SerializedState): BlackboardState;

  /**
   * JSON 문자열로 변환
   * @param state - 원본 상태
   * @returns JSON 문자열
   */
  toJSON(state: BlackboardState): string;

  /**
   * JSON 문자열에서 복원
   * @param json - JSON 문자열
   * @returns 복원된 상태
   */
  fromJSON(json: string): BlackboardState;

  // === 내부 헬퍼 ===

  /**
   * Map → Array 변환
   */
  private serializeMap<K extends string, V>(map: Map<K, V>): Array<[K, V]>;

  /**
   * Array → Map 변환
   */
  private deserializeMap<K extends string, V>(entries: Array<[K, V]>): Map<K, V>;

  /**
   * Date → string 변환
   */
  private serializeDate(date: Date): string;

  /**
   * string → Date 변환
   */
  private deserializeDate(str: string): Date;

  /**
   * Branded ID 복원
   */
  private restoreIds<T extends string>(obj: unknown): T;
}

/**
 * 체크섬 계산
 * @param data - 대상 데이터
 * @returns SHA-256 해시
 */
export function calculateChecksum(data: unknown): string;

/**
 * 체크섬 검증
 * @param data - 대상 데이터
 * @param expectedChecksum - 예상 체크섬
 * @returns 일치 여부
 */
export function verifyChecksum(data: unknown, expectedChecksum: string): boolean;
```

### 3. 압축 유틸리티 (`snapshot/compression.ts`)

```typescript
/**
 * 압축 알고리즘
 */
export type CompressionAlgorithm = 'gzip' | 'brotli' | 'none';

/**
 * 압축 옵션
 */
export interface CompressionOptions {
  /** 알고리즘 (기본: 'gzip') */
  algorithm?: CompressionAlgorithm;
  /** 압축 레벨 (1-9, 기본: 6) */
  level?: number;
}

/**
 * 데이터 압축
 * @param data - 압축할 문자열
 * @param options - 압축 옵션
 * @returns Base64 인코딩된 압축 데이터
 */
export async function compress(
  data: string,
  options?: CompressionOptions
): Promise<string>;

/**
 * 데이터 압축 해제
 * @param compressed - Base64 인코딩된 압축 데이터
 * @param algorithm - 압축 알고리즘
 * @returns 원본 문자열
 */
export async function decompress(
  compressed: string,
  algorithm?: CompressionAlgorithm
): Promise<string>;

/**
 * 압축 여부 감지
 * @param data - 검사할 데이터
 * @returns 압축 알고리즘 또는 null
 */
export function detectCompression(data: string): CompressionAlgorithm | null;
```

### 4. 스냅샷 관리자 (`snapshot/snapshot-manager.ts`)

```typescript
import type { BlackboardState, SessionId } from '../types';
import type {
  Snapshot,
  SnapshotMeta,
  CreateSnapshotOptions,
  RestoreSnapshotOptions,
  SnapshotValidationResult,
} from './types';
import { StateSerializer } from './serializer';

/**
 * 스냅샷 관리자 설정
 */
export interface SnapshotManagerOptions {
  /** 자동 압축 임계값 (바이트, 기본: 10KB) */
  autoCompressThreshold?: number;
  /** 기본 압축 사용 */
  defaultCompress?: boolean;
  /** ID 생성 함수 */
  idGenerator?: () => string;
}

/**
 * 스냅샷 관리자
 * @description Blackboard 상태의 스냅샷 생성, 검증, 복원 담당
 * 
 * @example
 * ```typescript
 * const manager = new SnapshotManager();
 * 
 * // 스냅샷 생성
 * const snapshot = manager.createSnapshot(board.getState(), {
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
 * const validation = manager.validate(loaded);
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
  private serializer: StateSerializer;
  private options: Required<SnapshotManagerOptions>;

  constructor(options: SnapshotManagerOptions = {}) {
    this.options = this.normalizeOptions(options);
    this.serializer = new StateSerializer({ sortKeys: true });
  }

  // === 생성 ===

  /**
   * 스냅샷 생성
   * @param state - 현재 Blackboard 상태
   * @param options - 생성 옵션
   * @returns 스냅샷
   */
  createSnapshot(
    state: BlackboardState,
    options?: CreateSnapshotOptions
  ): Snapshot;

  /**
   * 메타데이터만 포함된 스냅샷 생성
   * @param state - 현재 상태
   * @param description - 설명
   * @returns 메타 전용 스냅샷
   */
  createMetaSnapshot(
    state: BlackboardState,
    description?: string
  ): SnapshotMeta;

  // === 검증 ===

  /**
   * 스냅샷 검증
   * @param snapshot - 검증할 스냅샷
   * @returns 검증 결과
   */
  validate(snapshot: Snapshot): SnapshotValidationResult;

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
  };

  // === 복원 ===

  /**
   * 스냅샷에서 상태 복원
   * @param snapshot - 스냅샷
   * @param options - 복원 옵션
   * @returns 복원된 상태
   * @throws {SnapshotRestoreError} 복원 실패 시
   */
  restore(
    snapshot: Snapshot,
    options?: RestoreSnapshotOptions
  ): BlackboardState;

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
  ): BlackboardState;

  // === 직렬화 ===

  /**
   * 스냅샷 → JSON 문자열
   */
  toJSON(snapshot: Snapshot, pretty?: boolean): string;

  /**
   * JSON 문자열 → 스냅샷
   */
  fromJSON(json: string): Snapshot;

  /**
   * 스냅샷 → Buffer (바이너리)
   */
  toBuffer(snapshot: Snapshot): Buffer;

  /**
   * Buffer → 스냅샷
   */
  fromBuffer(buffer: Buffer): Snapshot;

  // === 유틸리티 ===

  /**
   * 스냅샷 비교
   * @param a - 첫 번째 스냅샷
   * @param b - 두 번째 스냅샷
   * @returns 차이점 목록
   */
  compare(a: Snapshot, b: Snapshot): SnapshotDiff;

  /**
   * 스냅샷 메타데이터만 추출
   */
  extractMeta(snapshot: Snapshot): SnapshotMeta;

  /**
   * 스냅샷 크기 계산
   */
  calculateSize(snapshot: Snapshot): {
    total: number;
    data: number;
    meta: number;
    compressed: boolean;
  };
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
```

### 5. Blackboard 통합 (`core/blackboard.ts` 확장)

```typescript
// Blackboard 클래스에 스냅샷 메서드 추가

export class Blackboard extends EventEmitter {
  // ... 기존 코드 ...

  private snapshotManager: SnapshotManager;

  /**
   * 현재 상태 스냅샷 생성
   * @param options - 스냅샷 옵션
   * @returns 스냅샷
   */
  createSnapshot(options?: CreateSnapshotOptions): Snapshot;

  /**
   * 스냅샷에서 상태 복원
   * @param snapshot - 복원할 스냅샷
   * @param options - 복원 옵션
   */
  restoreSnapshot(snapshot: Snapshot, options?: RestoreSnapshotOptions): void;

  /**
   * 스냅샷 검증
   * @param snapshot - 검증할 스냅샷
   */
  validateSnapshot(snapshot: Snapshot): SnapshotValidationResult;

  /**
   * 전체 상태 교체 (내부용)
   * @param newState - 새 상태
   */
  private replaceState(newState: BlackboardState): void;
}
```

---

## 파일 구조

```
packages/blackboard/
└── src/
    ├── types/                  # (TASK-018)
    ├── core/                   # (TASK-019)
    │   └── blackboard.ts       # 스냅샷 메서드 추가
    ├── events/                 # (TASK-020)
    └── snapshot/
        ├── index.ts            # Snapshot exports
        ├── types.ts            # 스냅샷 타입 정의
        ├── serializer.ts       # 직렬화/역직렬화
        ├── compression.ts      # 압축 유틸리티
        └── snapshot-manager.ts # 스냅샷 관리자
```

---

## 사용 예시

```typescript
import { Blackboard, createSessionId } from '@obora-kit/blackboard';
import * as fs from 'fs/promises';

const board = new Blackboard({ sessionId: createSessionId('session-001') });

// 상태 변경
board.state.phase = 'discussion';
board.decisions.submitAgenda({...});

// 스냅샷 생성
const snapshot = board.createSnapshot({
  description: 'Before voting phase',
  tags: ['checkpoint', 'pre-voting'],
  compress: true,
});

// 파일로 저장
await fs.writeFile(
  'checkpoints/pre-voting.json',
  board.snapshotManager.toJSON(snapshot, true)
);

// 파일에서 로드
const loaded = board.snapshotManager.fromJSON(
  await fs.readFile('checkpoints/pre-voting.json', 'utf-8')
);

// 검증
const validation = board.validateSnapshot(loaded);
if (!validation.valid) {
  console.error('Invalid snapshot:', validation.errors);
  process.exit(1);
}

// 복원
board.restoreSnapshot(loaded, {
  newSessionId: true,
  restoreSections: ['decisions'], // decisions만 복원
});

// 버전 호환성 확인
const compat = board.snapshotManager.checkVersionCompatibility(loaded.meta.formatVersion);
if (!compat.compatible) {
  console.warn(`Migration required: ${compat.snapshot} → ${compat.current}`);
}
```

---

## 완료 조건

- [x] 스냅샷 타입 정의 완료
- [x] 직렬화/역직렬화 구현 완료
- [x] 압축/압축해제 동작 확인
- [x] 버전 호환성 체크 동작 확인
- [x] 체크섬 검증 동작 확인
- [x] Blackboard 통합 완료
- [x] `tsc --noEmit` 통과

---

## 참고 문서

- [TASK-019: Blackboard Core](./TASK-019-blackboard-core.md)
- [Blackboard + Actor 설계 문서](../../architecture/blackboard-actor-design.md)
- Node.js zlib 모듈 문서

---

## 재동기화 판정 (2026-02-13)
- 최종 판정: **✅ 완료**
- 근거 코드:
  - `packages/blackboard/src/snapshot/types.ts`
  - `packages/blackboard/src/snapshot/serializer.ts`
  - `packages/blackboard/src/snapshot/compression.ts`
  - `packages/blackboard/src/snapshot/snapshot-manager.ts`
  - `packages/blackboard/src/core/blackboard.ts`
- 검증 결과: 스냅샷 생성/검증/복원 및 직렬화/압축 기능이 구현되어 스냅샷 테스트가 통과합니다.
- 검증 명령:
  - `pnpm --filter @obora-kit/blackboard test` ✅ (14 files, 470 tests passed)
  - `pnpm --filter @obora-kit/blackboard typecheck` ✅
  - `pnpm --filter @obora-kit/blackboard build` ✅

