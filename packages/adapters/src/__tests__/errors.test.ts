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
});
