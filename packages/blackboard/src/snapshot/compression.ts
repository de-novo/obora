/**
 * @module snapshot/compression
 * @description 압축 유틸리티 (브라우저/Node.js 호환)
 */

import { gzip, ungzip, type InflateFunctionOptions } from 'pako';

/**
 * 압축 알고리즘
 * @note brotli는 pako에서 지원하지 않음
 */
export type CompressionAlgorithm = 'gzip' | 'none';

/**
 * 압축 레벨 타입 (pako 호환)
 */
export type CompressionLevel = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/**
 * 압축 옵션
 */
export interface CompressionOptions {
  /** 알고리즘 (기본: 'gzip') */
  algorithm?: CompressionAlgorithm;
  /** 압축 레벨 (-1~9, 기본: 6) */
  level?: CompressionLevel;
}

/**
 * Pako 압축 해제 옵션 타입 정의
 */
interface PakoUngzipOptions extends InflateFunctionOptions {
  windowBits?: number;
}

/**
 * 문자열을 Uint8Array로 변환
 */
function stringToUint8Array(str: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

/**
 * Uint8Array를 문자열로 변환
 */
function uint8ArrayToString(bytes: Uint8Array): string {
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

/**
 * Uint8Array를 Base64로 변환
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  // Node.js 환경에서는 Buffer가 더 효율적
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  // 브라우저 환경
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Base64를 Uint8Array로 변환
 */
function base64ToUint8Array(base64: string): Uint8Array {
  // Node.js 환경
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  // 브라우저 환경
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 데이터 압축
 * @param data - 압축할 문자열
 * @param options - 압축 옵션
 * @returns Base64 인코딩된 압축 데이터
 */
export function compress(
  data: string,
  options?: CompressionOptions
): string {
  const algorithm = options?.algorithm ?? 'gzip';

  if (algorithm === 'none') {
    return data;
  }

  const input = stringToUint8Array(data);

  // pako gzip 압축 옵션 (동기)
  // 기본 level은 6, 범위는 0-9 (-1은 기본값)
  const defaultLevel = 6 as const;
  const compressed = gzip(input, { level: options?.level ?? defaultLevel });

  return uint8ArrayToBase64(compressed);
}

/**
 * 데이터 압축 해제
 * @param compressed - Base64 인코딩된 압축 데이터
 * @param algorithm - 압축 알고리즘
 * @param maxSize - 최대 허용 크기 (DoS 방지, 기본: 100MB)
 * @returns 원본 문자열
 * @throws {Error} 데이터 크기 제한 초과 시
 */
export function decompress(
  compressed: string,
  algorithm: CompressionAlgorithm = 'gzip',
  maxSize: number = 100 * 1024 * 1024 // 100MB
): string {
  if (algorithm === 'none') {
    return compressed;
  }

  const buffer = base64ToUint8Array(compressed);

  // DoS 방지: 압축 해제 전 크기 체크
  if (buffer.length > maxSize) {
    throw new Error(
      `Compressed data too large: ${buffer.length} bytes (max: ${maxSize} bytes)`
    );
  }

  // pako gzip 압축 해제 옵션 (동기)
  const ungzipOptions: PakoUngzipOptions = {};
  let decompressed: Uint8Array;

  try {
    decompressed = ungzip(buffer, ungzipOptions);
  } catch (e) {
    throw new Error(`Failed to decompress data: ${e instanceof Error ? e.message : String(e)}`);
  }

  // DoS 방지: 압축 해제 후 크기 체크
  if (decompressed.length > maxSize) {
    throw new Error(
      `Decompressed data too large: ${decompressed.length} bytes (max: ${maxSize} bytes)`
    );
  }

  return uint8ArrayToString(decompressed);
}

/**
 * 압축 여부 감지
 * @param data - 검사할 데이터
 * @returns 압축 알고리즘 또는 null
 */
export function detectCompression(data: string): CompressionAlgorithm | null {
  // Base64 디코딩 시도
  try {
    const buffer = base64ToUint8Array(data);

    // 최소 2바이트 필요
    if (buffer.length < 2) {
      return null;
    }

    // Gzip magic number: 0x1f 0x8b
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
      return 'gzip';
    }

    return null;
  } catch {
    return null;
  }
}
