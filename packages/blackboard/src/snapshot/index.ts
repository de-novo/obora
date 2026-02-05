/**
 * @packageDocumentation
 * @module snapshot
 * @description 스냅샷/복원 기능
 */

// Type exports
export * from './types';

// ID Utils exports
export { createDefaultId, createIdGenerator } from './id-utils';

// Serializer exports
export { StateSerializer, calculateChecksum, verifyChecksum } from './serializer';
export type { SerializeOptions } from './serializer';

// Compression exports
export { compress, decompress, detectCompression } from './compression';
export type { CompressionAlgorithm, CompressionOptions } from './compression';

// SnapshotManager exports (파사드)
export {
  SnapshotManager,
  SnapshotRestoreError,
} from './snapshot-manager';
export type { SnapshotManagerOptions } from './snapshot-manager';

// 전문 클래스 exports 및 타일 exports
export { SnapshotCreator } from './snapshot-creator';
export type { SnapshotCreatorOptions } from './snapshot-creator';

export { SnapshotValidator } from './snapshot-validator';

export { SnapshotRestorer } from './snapshot-restorer';
export type { SnapshotRestorerOptions } from './snapshot-restorer';

export { SnapshotSerializer } from './snapshot-serializer';

export { SnapshotComparer } from './snapshot-comparer';
export type { SnapshotDiff, SectionDiff, SectionData } from './snapshot-comparer';
