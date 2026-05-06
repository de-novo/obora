import { describe, expect, it } from "vitest";

import { RetryExhaustedError, type RetryErrorMetadata } from "../errors";

describe("adapter errors", () => {
  it("normalizes string retry constructor metadata with original error codes", () => {
    const original = Object.assign(new Error("rate limit"), { code: "RATE_LIMIT" });
    const error = new RetryExhaustedError("Max retries exceeded", original, 4);

    expect(error).toMatchObject({
      name: "RetryExhaustedError",
      message: "Max retries exceeded",
      attempts: 4,
      attemptCount: 4,
      originalError: original,
      lastError: {
        code: "E4005",
        message: "rate limit",
        lastError: "rate limit",
        lastErrorCode: "RATE_LIMIT",
      },
    });
    expect(error.getRootCause()).toBe(original);
    expect(error.getLastErrorCode()).toBe("RATE_LIMIT");
  });

  it("supports structured retry metadata without a nested original error", () => {
    const metadata: RetryErrorMetadata = {
      code: "E429",
      message: "provider throttled",
      provider: "openai",
    };

    const error = new RetryExhaustedError(metadata, 2);

    expect(error.message).toBe("Retry exhausted after 2 attempts: E429");
    expect(error.originalError).toBeUndefined();
    expect(error.getRootCause()).toBe(metadata);
    expect(error.getLastErrorCode()).toBeUndefined();
  });

  it("defaults string retry metadata when the original error has no string code", () => {
    const original = Object.assign(new Error("provider failed"), { code: 429 });
    const error = new RetryExhaustedError("Max retries exceeded", original, undefined as unknown as number);

    expect(error.attempts).toBe(1);
    expect(error.lastError).toEqual({
      code: "E4005",
      message: "provider failed",
      lastError: "provider failed",
      lastErrorCode: undefined,
    });
    expect(error.getLastErrorCode()).toBeUndefined();
  });

  it("wraps structured retry metadata with nested last error text", () => {
    const metadata: RetryErrorMetadata = {
      code: "E503",
      message: "provider unavailable",
      provider: "anthropic",
      lastError: "upstream timeout",
      lastErrorCode: "ETIMEDOUT",
    };

    const error = new RetryExhaustedError(metadata, 3);

    expect(error.originalError).toBeInstanceOf(Error);
    expect(error.originalError?.message).toBe("upstream timeout");
    expect(error.getRootCause()).toBe(error.originalError);
    expect(error.getLastErrorCode()).toBe("ETIMEDOUT");
  });
});
