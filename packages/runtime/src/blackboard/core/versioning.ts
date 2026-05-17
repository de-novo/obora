/**
 * @module versioning
 * @description 버전 관리 (optimistic locking)
 */

// Global setTimeout declaration for non-Node environments
declare const setTimeout: (callback: () => void, ms: number) => unknown;

/**
 * 버전 관리 설정
 */
export interface VersioningConfig {
  /** 충돌 시 재시도 횟수 */
  maxRetries: number;
  /** 재시도 간격 (ms) */
  retryDelay: number;
  /** 지수 백오프 사용 여부 */
  exponentialBackoff: boolean;
}

/**
 * 기본 버전 관리 설정
 */
export const DEFAULT_VERSIONING_CONFIG: VersioningConfig = {
  maxRetries: 3,
  retryDelay: 100,
  exponentialBackoff: true,
};

/**
 * 버전 충돌 에러
 */
export class VersionConflictError extends Error {
  constructor(
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
    public readonly path: string
  ) {
    super(`Version conflict at ${path}: expected ${expectedVersion}, got ${actualVersion}`);
    this.name = "VersionConflictError";
  }
}

/**
 * Optimistic Locking 관리자
 * @description 동시 쓰기 충돌을 감지하고 처리
 */
export class VersionManager {
  constructor(private config: VersioningConfig = DEFAULT_VERSIONING_CONFIG) {}

  /**
   * 버전 검증
   * @param currentVersion - 현재 버전
   * @param expectedVersion - 예상 버전
   * @param path - 경로 (에러 메시지용)
   * @throws {VersionConflictError} 버전 불일치 시
   */
  validateVersion(currentVersion: number, expectedVersion: number, path: string): void {
    if (currentVersion !== expectedVersion) {
      throw new VersionConflictError(expectedVersion, currentVersion, path);
    }
  }

  /**
   * 버전 증가
   * @param currentVersion - 현재 버전
   * @returns 새 버전
   */
  incrementVersion(currentVersion: number): number {
    if (currentVersion < 0) {
      throw new Error(`Invalid version: ${currentVersion}`);
    }
    return currentVersion + 1;
  }

  /**
   * 재시도 가능한 쓰기 실행
   * @param operation - 실행할 쓰기 연산
   * @param context - 컨텍스트 정보 (로그용)
   * @returns 최종 결과
   */
  async executeWithRetry<T>(
    operation: () => T | Promise<T>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context?: string
  ): Promise<T> {
    // 최대 maxRetries번 시도 (첫 시도 + 재시도 maxRetries-1번)
    const attemptOperation = async (attempt: number, lastError: Error | null): Promise<T> => {
      if (attempt >= this.config.maxRetries) {
        throw lastError;
      }

      try {
        return await operation();
      } catch (error) {
        const currentError = error instanceof Error ? error : new Error(String(error));

        // VersionConflictError가 아니면 바로 throw
        if (!(currentError instanceof VersionConflictError)) {
          throw currentError;
        }

        // 마지막 시도면 throw
        if (attempt === this.config.maxRetries - 1) {
          throw currentError;
        }

        // 재시도 지연
        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
        return attemptOperation(attempt + 1, currentError);
      }
    };

    return attemptOperation(0, null);
  }

  /**
   * 재시도 지연 계산
   * @param attempt - 현재 시도 횟수 (0부터)
   * @returns 지연 시간 (ms)
   */
  calculateDelay(attempt: number): number {
    if (this.config.exponentialBackoff) {
      // 지수 백오프: delay * 2^attempt + random jitter
      const baseDelay = this.config.retryDelay * Math.pow(2, attempt);
      const jitter = Math.random() * this.config.retryDelay * 0.5;
      return Math.floor(baseDelay + jitter);
    }
    return this.config.retryDelay;
  }

  /**
   * 지연 (내부 유틸리티)
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 설정 업데이트
   * @param partialConfig - 업데이트할 설정 (부분)
   */
  updateConfig(partialConfig: Partial<VersioningConfig>): void {
    this.config = { ...this.config, ...partialConfig };
  }

  /**
   * 현재 설정 조회
   */
  getConfig(): Readonly<VersioningConfig> {
    return { ...this.config };
  }
}

/**
 * 기본 버전 관리자 인스턴스
 */
export const defaultVersionManager = new VersionManager();
