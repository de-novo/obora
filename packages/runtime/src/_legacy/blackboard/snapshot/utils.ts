/**
 * @module snapshot/utils
 * @description 유틸리티 함수들 (중복 제거)
 */

import type { Snapshot, SerializedState } from "./types";
import { decompress, detectCompression } from "./compression";
import { isSerializedState } from "./type-guards";

/**
 * JSON.stringify replacer for key sorting
 * @param key - Property key
 * @param value - Property value
 * @returns Value with sorted keys for objects
 */
export function sortedKeyReplacer(key: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
    const sortedObj: Record<string, unknown> = {};
    Object.keys(value as Record<string, unknown>)
      .sort()
      .forEach((k) => {
        sortedObj[k] = (value as Record<string, unknown>)[k];
      });
    return sortedObj;
  }
  return value;
}

/**
 * 스냅샷 데이터 압축 해제 (공통 헬퍼)
 * @description P0: decompressData 로직 중복 제거를 위한 공통 함수
 * @param snapshot - 스냅샷
 * @returns 역직렬화된 상태 데이터
 * @throws {Error} 압축 해제 실패 또는 타입 불일치 시
 */
export function decompressSnapshotData(snapshot: Snapshot): SerializedState {
  if (!snapshot.meta.compressed) {
    if (!isSerializedState(snapshot.data)) {
      throw new Error("Invalid snapshot data: not a SerializedState");
    }
    return snapshot.data;
  }

  if (typeof snapshot.data !== "string") {
    throw new Error("Invalid compressed data: expected string");
  }

  const algorithm = detectCompression(snapshot.data) ?? "gzip";
  const json = decompress(snapshot.data, { algorithm }) as string;
  const parsed = JSON.parse(json);

  if (!isSerializedState(parsed)) {
    throw new Error("Invalid snapshot data: deserialized data is not a SerializedState");
  }

  return parsed;
}
