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
 * 압축 레벨 (테스트 호환 타입)
 */
export type CompressionLevel = 'none' | 'fast' | 'balanced' | 'max';

/**
 * 내부 pako 압축 레벨 숫자 타입
 */
type PakoCompressionLevel = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/**
 * 압축 옵션
 */
export interface CompressionOptions {
  /** 알고리즘 (기본: 'gzip') */
  algorithm?: CompressionAlgorithm;
  /** 압축 레벨 (기본: 'balanced') */
  level?: CompressionLevel | PakoCompressionLevel;
  /** 출력 형식 (기본: 'base64') */
  outputFormat?: 'base64' | 'buffer' | 'uint8array';
  /** 메타데이터 포함 여부 */
  includeMetadata?: boolean;
}

/**
 * 압축 해제 옵션
 */
export interface DecompressionOptions {
  /** 압축 알고리즘 */
  algorithm?: CompressionAlgorithm;
  /** 입력 형식 (기본: 'base64') */
  inputFormat?: 'base64' | 'buffer' | 'uint8array';
  /** 유효성 검사 건너뛰기 (algorithm='none'인 경우 자동 true) */
  skipValidation?: boolean;
}

/**
 * 압축 메타데이터
 */
export interface CompressionMetadata {
  /** 원본 크기 */
  originalSize: number;
  /** 압축된 크기 */
  compressedSize: number;
  /** 사용된 알고리즘 */
  algorithm: CompressionAlgorithm;
  /** 사용된 압축 레벨 */
  level: CompressionLevel | PakoCompressionLevel;
  /** 타임스탬프 */
  timestamp: string;
}

/**
 * 메타데이터가 포함된 압축 결과
 */
export interface CompressedWithMeta {
  /** 압축된 데이터 */
  data: string;
  /** 메타데이터 */
  metadata: CompressionMetadata;
}

/**
 * 압축 통계
 */
export interface CompressionStats {
  /** 원본 크기 */
  originalSize: number;
  /** 압축된 크기 */
  compressedSize: number;
  /** 압축 비율 (originalSize / compressedSize) */
  ratio: number;
  /** 절감된 크기 (bytes) */
  savings: number;
  /** 절감 비율 (%) */
  savingsPercent: number;
}

/**
 * Pako 압축 해제 옵션 타입 정의
 */
interface PakoUngzipOptions extends InflateFunctionOptions {
  windowBits?: number;
}

/**
 * 문자열 압축 레벨을 pako 레벨로 변환
 */
function normalizeCompressionLevel(
  level?: CompressionLevel | PakoCompressionLevel
): PakoCompressionLevel {
  if (level === undefined || level === 'balanced') {
    return 6;
  }
  if (level === 'none') {
    return 0;
  }
  if (level === 'fast') {
    return 1;
  }
  if (level === 'max') {
    return 9;
  }
  // 이미 숫자인 경우 (PakoCompressionLevel)
  return level as PakoCompressionLevel;
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
 * 입력 데이터를 Uint8Array로 변환
 */
function inputToUint8Array(data: string | Uint8Array | Buffer): Uint8Array {
  if (typeof data === 'string') {
    return stringToUint8Array(data);
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return new Uint8Array(data);
  }
  throw new Error(`Unsupported input type: ${typeof data}`);
}

/**
 * 출력 데이터 변환
 */
function formatOutput(
  data: Uint8Array,
  format: 'base64' | 'buffer' | 'uint8array'
): string | Uint8Array | Buffer {
  if (format === 'base64') {
    return uint8ArrayToBase64(data);
  }
  if (format === 'buffer' && typeof Buffer !== 'undefined') {
    return Buffer.from(data);
  }
  return data;
}

/**
 * 입력 데이터를 Uint8Array로 변환 (decompression용)
 */
function inputToUint8ArrayForDecompress(
  data: string | Uint8Array | Buffer,
  format?: 'base64' | 'buffer' | 'uint8array'
): Uint8Array {
  // format이 지정된 경우 해당 형식으로 처리
  if (format === 'base64' && typeof data === 'string') {
    return base64ToUint8Array(data);
  }
  if (format === 'buffer' && Buffer.isBuffer(data)) {
    return new Uint8Array(data);
  }
  if (format === 'uint8array' && data instanceof Uint8Array) {
    return data;
  }

  // format이 지정되지 않은 경우 자동 감지
  if (typeof data === 'string') {
    // string이면 base64로 처리 (gzip 압축된 데이터는 항상 base64 인코딩됨)
    try {
      return base64ToUint8Array(data);
    } catch {
      // base64 디코딩 실패시 일반 문자열로 처리
      return stringToUint8Array(data);
    }
  }

  return inputToUint8Array(data);
}

/**
 * 체크섬 계산 (간단한 해시)
 */
function calculateChecksum(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * 데이터 압축
 * @param data - 압축할 데이터 (string | Uint8Array | Buffer)
 * @param options - 압축 옵션
 * @returns 압축된 데이터 (string | Uint8Array | Buffer)
 */
export function compress(
  data: string | Uint8Array | Buffer,
  options?: CompressionOptions
): string | Uint8Array | Buffer {
  // 빈 데이터 처리 - 빈 문자열은 허용
  if (data === null || data === undefined) {
    throw new Error('compress(): input data must not be null or undefined');
  }

  const algorithm = options?.algorithm ?? 'gzip';
  const outputFormat = options?.outputFormat ?? 'base64';
  const level = options?.level ?? 'balanced';

  // level: 'none'인 경우 압축하지 않음 - 원본 타입 유지
  if (level === 'none' || algorithm === 'none') {
    if (typeof data === 'string') {
      return data;
    }
    if (Buffer.isBuffer(data)) {
      return data;
    }
    if (data instanceof Uint8Array) {
      return data;
    }
    return data;
  }

  try {
    const input = inputToUint8Array(data);
    const normalizedLevel = normalizeCompressionLevel(level);

    // pako gzip 압축 옵션 (동기)
    const compressed = gzip(input, { level: normalizedLevel });

    // 원본 타입에 따라 반환 형식 결정 (outputFormat이 명시된 경우 제외)
    if (options?.outputFormat) {
      return formatOutput(compressed, outputFormat);
    }
    if (typeof data === 'string') {
      return uint8ArrayToBase64(compressed);
    }
    if (Buffer.isBuffer(data) && typeof Buffer !== 'undefined') {
      return Buffer.from(compressed);
    }
    return compressed;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to compress data: ${msg}`, { cause: error });
  }
}

/**
 * 데이터 압축 해제
 * @param compressed - 압축된 데이터
 * @param options - 압축 해제 옵션
 * @returns 원본 데이터
 * @throws {Error} 데이터 크기 제한 초과 시
 */
export function decompress(
  compressed: string | Uint8Array | Buffer,
  options?: DecompressionOptions
): string | Uint8Array | Buffer {
  // 빈 데이터 처리
  if (compressed === null || compressed === undefined) {
    throw new Error('decompress(): input data must not be null or undefined');
  }

  const algorithm = options?.algorithm ?? 'gzip';
  const skipValidation = options?.skipValidation ?? false;

  // 빈 데이터 처리 (압축하지 않은 경우)
  if (
    (typeof compressed === 'string' && compressed === '') ||
    (Buffer.isBuffer(compressed) && compressed.length === 0) ||
    (compressed instanceof Uint8Array && compressed.length === 0)
  ) {
    return compressed;
  }

  // algorithm이 'none'인 경우 또는 skipValidation이 true인 경우
  if (algorithm === 'none' || skipValidation) {
    if (typeof compressed === 'string') {
      return compressed;
    }
    if (Buffer.isBuffer(compressed)) {
      return compressed;
    }
    return compressed;
  }

  try {
    const buffer = inputToUint8ArrayForDecompress(compressed, options?.inputFormat);

    // gzip 헤더 확인
    if (buffer.length >= 2) {
      if (!(buffer[0] === 0x1f && buffer[1] === 0x8b)) {
        // string 입력이고 gzip 헤더가 없으면 원본 반환 (level: 'none'으로 압축된 경우)
        if (typeof compressed === 'string') {
          return compressed;
        }
        // Buffer/Uint8Array 입력이고 gzip 헤더가 없으면 에러
        throw new Error('Invalid gzip header: data does not appear to be gzip-compressed');
      }
    }

    // pako gzip 압축 해제 옵션 (동기)
    const ungzipOptions: PakoUngzipOptions = {};
    const decompressed = ungzip(buffer, ungzipOptions);

    // 원본 타입에 따라 반환
    if (typeof compressed === 'string') {
      return uint8ArrayToString(decompressed);
    }
    if (Buffer.isBuffer(compressed) && typeof Buffer !== 'undefined') {
      return Buffer.from(decompressed);
    }
    return decompressed;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to decompress data: ${msg}`, { cause: error });
  }
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

/**
 * 체크섬 계산 (비동기)
 */
export async function calculateChecksumAsync(data: string): Promise<string> {
  return calculateChecksum(data);
}

/**
 * 체크섬 검증
 */
export async function verifyChecksum(
  data: string,
  expectedChecksum: string
): Promise<boolean> {
  const checksum = await calculateChecksumAsync(data);
  return checksum === expectedChecksum;
}

/**
 * Compressor 클래스 - 상태 저장형 압축
 */
export class Compressor {
  private options: CompressionOptions;
  private history: CompressionStats[] = [];

  constructor(options?: CompressionOptions) {
    this.options = {
      algorithm: options?.algorithm ?? 'gzip',
      level: options?.level ?? 'balanced',
      outputFormat: options?.outputFormat ?? 'base64',
      includeMetadata: options?.includeMetadata ?? false,
    };
  }

  /**
   * 데이터 압축
   */
  compress(data: string | Uint8Array | Buffer): Uint8Array {
    const bytes = inputToUint8Array(data);
    const level = normalizeCompressionLevel(this.options.level);

    if (this.options.algorithm === 'none') {
      return bytes;
    }

    const compressed = gzip(bytes, { level });

    // 통계 기록
    const stats = this.calculateStatsInternal(bytes.length, compressed.length);
    this.history.push(stats);

    return compressed;
  }

  /**
   * 데이터 압축 해제
   */
  decompress(data: Uint8Array): string {
    if (this.options.algorithm === 'none') {
      return uint8ArrayToString(data);
    }

    const decompressed = ungzip(data);
    return uint8ArrayToString(decompressed);
  }

  /**
   * 비동기 압축
   */
  async compressAsync(data: string | Uint8Array | Buffer): Promise<Uint8Array> {
    return this.compress(data);
  }

  /**
   * 비동기 압축 해제
   */
  async decompressAsync(data: Uint8Array): Promise<string> {
    return this.decompress(data);
  }

  /**
   * 압축 비율 계산
   */
  ratio(originalSize: number, compressedSize: number): number {
    if (compressedSize === 0) {
      return originalSize === 0 ? 1 : Infinity;
    }
    return originalSize / compressedSize;
  }

  /**
   * 압축 통계 계산
   */
  stats(originalSize: number, compressedSize: number): CompressionStats {
    return this.calculateStatsInternal(originalSize, compressedSize);
  }

  /**
   * 내부 통계 계산
   */
  private calculateStatsInternal(
    originalSize: number,
    compressedSize: number
  ): CompressionStats {
    const ratio = this.ratio(originalSize, compressedSize);
    const savings = originalSize - compressedSize;
    const savingsPercent = originalSize > 0 ? (savings / originalSize) * 100 : 0;

    return {
      originalSize,
      compressedSize,
      ratio,
      savings,
      savingsPercent,
    };
  }

  /**
   * 메타데이터 포함 압축
   */
  compressWithMeta(data: string | Uint8Array | Buffer): CompressedWithMeta {
    const bytes = inputToUint8Array(data);
    const compressed = this.compress(bytes);

    const metadata: CompressionMetadata = {
      originalSize: bytes.length,
      compressedSize: compressed.length,
      algorithm: this.options.algorithm ?? 'gzip',
      level: this.options.level ?? 'balanced',
      timestamp: new Date().toISOString(),
    };

    // 메타데이터와 데이터를 결합하여 base64로 변환
    const metaJson = JSON.stringify(metadata);
    const metaBytes = stringToUint8Array(metaJson);

    // 포맷: [metaLength(4 bytes)][metadata][compressed data]
    const combined = new Uint8Array(4 + metaBytes.length + compressed.length);
    const view = new DataView(combined.buffer);

    view.setUint32(0, metaBytes.length, false); // big endian
    combined.set(metaBytes, 4);
    combined.set(compressed, 4 + metaBytes.length);

    return {
      data: uint8ArrayToBase64(combined),
      metadata,
    };
  }

  /**
   * 메타데이터 포함 압축 해제
   */
  decompressWithMeta(compressed: CompressedWithMeta | string): string {
    let base64Data: string;

    if (typeof compressed === 'string') {
      base64Data = compressed;
    } else {
      base64Data = compressed.data;
    }

    const combined = base64ToUint8Array(base64Data);
    const view = new DataView(combined.buffer);

    const metaLength = view.getUint32(0, false);
    const metaBytes = combined.slice(4, 4 + metaLength);
    const compressedData = combined.slice(4 + metaLength);

    // 메타데이터 파싱 (검증용)
    try {
      const metaJson = uint8ArrayToString(metaBytes);
      JSON.parse(metaJson);
    } catch {
      // 메타데이터 파싱 실패 시 무시하고 계속 진행
    }

    // 압축 해제
    return this.decompress(compressedData);
  }

  /**
   * 기록된 압축 통계 가져오기
   */
  getHistory(): CompressionStats[] {
    return [...this.history];
  }

  /**
   * 기록된 통계 지우기
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * 옵션 업데이트
   */
  setOptions(options: Partial<CompressionOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * 현재 옵션 가져오기
   */
  getOptions(): CompressionOptions {
    return { ...this.options };
  }
}
