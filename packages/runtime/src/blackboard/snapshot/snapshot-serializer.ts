/**
 * @module snapshot/snapshot-serializer
 * @description 스냅샷 직렬화 담당
 */

import type { Snapshot } from './types';

/**
 * 스냅샷 직렬화 옵션
 */
export interface SnapshotSerializeOptions {
  /** 예쁜 출력 여부 */
  pretty?: boolean;
}

/**
 * 스냅샷 직렬화자
 * @description 스냅샷 직렬화/역직렬화 전담 클래스
 */
export class SnapshotSerializer {
  /**
   * 스냅샷 → JSON 문자열
   * @param snapshot - 스냅샷
   * @param pretty - 예쁜 출력 여부
   * @returns JSON 문자열
   */
  toJSON(snapshot: Snapshot, pretty: boolean = false): string {
    // Date 객체 직렬화 처리
    const json = JSON.stringify(snapshot, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    }, pretty ? 2 : 0);

    return json;
  }

  /**
   * JSON 문자열 → 스냅샷
   * @param json - JSON 문자열
   * @returns 스냅샷
   * @throws {Error} JSON 파싱 실패 시 명확한 에러 메시지
   */
  fromJSON(json: string): Snapshot {
    // P1: 빈 문자열 입력 검증 추가
    if (!json || json.trim() === '') {
      throw new Error('fromJSON(): input JSON must not be empty or whitespace-only');
    }

    try {
      const parsed = JSON.parse(json);

      // Date 역직렬화
      const snapshot: Snapshot = {
        meta: {
          ...parsed.meta,
          createdAt: new Date(parsed.meta.createdAt),
        },
        data: parsed.data,
      };

      return snapshot;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in snapshot: ${error.message}`, { cause: error });
      }
      throw error;
    }
  }

  /**
   * 스냅샷 → Uint8Array (바이너리)
   * @param snapshot - 스냅샷
   * @returns Uint8Array
   */
  toUint8Array(snapshot: Snapshot): Uint8Array {
    const json = this.toJSON(snapshot);
    const encoder = new TextEncoder();
    return encoder.encode(json);
  }

  /**
   * Uint8Array → 스냅샷
   * @param bytes - 바이트 배열
   * @returns 스냅샷
   * @throws {Error} 디코딩 실패 시 명확한 에러 메시지
   */
  fromUint8Array(bytes: Uint8Array): Snapshot {
    try {
      const decoder = new TextDecoder();
      const json = decoder.decode(bytes);
      return this.fromJSON(json);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to decode Uint8Array to snapshot: ${error.message}`, {
          cause: error,
        });
      }
      throw error;
    }
  }
}
