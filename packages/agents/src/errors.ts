export interface RetryErrorMetadata {
  code: string;
  message: string;
  provider?: string;
  statusCode?: number;
  attempts?: number;
  lastError?: string;
  lastErrorCode?: string;
  failedAt?: string;
}

export class RetryExhaustedError extends Error {
  readonly lastError: RetryErrorMetadata;
  readonly attemptCount: number;

  // Backward-compat fields
  readonly originalError?: Error;
  readonly attempts: number;

  constructor(lastError: RetryErrorMetadata, attemptCount: number);
  constructor(message: string, originalError: Error, attempts: number);
  constructor(
    arg1: RetryErrorMetadata | string,
    arg2: number | Error,
    arg3?: number
  ) {
    if (typeof arg1 === "string") {
      const message = arg1;
      const originalError = arg2 as Error;
      const attempts = arg3 ?? 1;
      super(message);
      this.name = "RetryExhaustedError";
      this.originalError = originalError;
      this.attempts = attempts;
      this.attemptCount = attempts;
      this.lastError = {
        code: "E4005",
        message: originalError?.message ?? message,
        lastError: originalError?.message,
        lastErrorCode: this.extractErrorCode(originalError),
      };
      return;
    }

    const lastError = arg1;
    const attemptCount = arg2 as number;
    super(`Retry exhausted after ${attemptCount} attempts: ${lastError.code}`);
    this.name = "RetryExhaustedError";
    this.lastError = lastError;
    this.attemptCount = attemptCount;
    this.attempts = attemptCount;
    this.originalError = lastError.lastError
      ? new Error(lastError.lastError)
      : undefined;
  }

  getRootCause(): unknown {
    return this.cause ?? this.originalError ?? this.lastError;
  }

  getLastErrorCode(): string | undefined {
    return this.lastError.lastErrorCode;
  }

  private extractErrorCode(error?: unknown): string | undefined {
    if (!error || typeof error !== "object" || !("code" in error)) {
      return undefined;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
}
