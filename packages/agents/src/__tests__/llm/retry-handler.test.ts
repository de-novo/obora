import { describe, it, expect, vi } from "vitest";

import { RetryHandler, RetryExhaustedError } from "../../llm/retry-handler";

describe("RetryHandler", () => {
  describe("execute", () => {
    it("should execute operation successfully on first try", async () => {
      const handler = new RetryHandler();
      const operation = vi.fn().mockResolvedValue("success");

      const result = await handler.execute(operation);

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should retry on retryable error", async () => {
      const handler = new RetryHandler(3, 10);
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error("rate limit exceeded"))
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValue("success");

      const result = await handler.execute(operation);

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it("should throw on non-retryable error", async () => {
      const handler = new RetryHandler();
      const operation = vi.fn().mockRejectedValue(new Error("non-retryable"));

      await expect(handler.execute(operation)).rejects.toThrow("non-retryable");
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should respect custom isRetryable function", async () => {
      const handler = new RetryHandler();
      const isRetryable = vi.fn().mockReturnValue(false);
      const operation = vi.fn().mockRejectedValue(new Error("error"));

      await expect(handler.execute(operation, isRetryable)).rejects.toThrow();
      expect(isRetryable).toHaveBeenCalled();
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should throw RetryExhaustedError after max retries", async () => {
      const handler = new RetryHandler(2, 1);
      const operation = vi.fn().mockRejectedValue(new Error("rate limit exceeded"));

      await expect(handler.execute(operation)).rejects.toThrow(RetryExhaustedError);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it("should include original error and attempts in RetryExhaustedError", async () => {
      const handler = new RetryHandler(1, 1);
      const error = new Error("rate limit");
      const operation = vi.fn().mockRejectedValue(error);

      try {
        await handler.execute(operation);
        expect.fail("Should have thrown RetryExhaustedError");
      } catch (e) {
        expect(e).toBeInstanceOf(RetryExhaustedError);
        expect((e as RetryExhaustedError).originalError).toBe(error);
        expect((e as RetryExhaustedError).attempts).toBe(2);
      }
    });

    it("should use exponential backoff", async () => {
      const handler = new RetryHandler(2, 100);
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error("rate limit"))
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValue("success");

      const start = Date.now();
      await handler.execute(operation);
      const duration = Date.now() - start;

      expect(operation).toHaveBeenCalledTimes(3);
      expect(duration).toBeGreaterThanOrEqual(200);
    });

    it("should cap delay at maxDelay", async () => {
      const handler = new RetryHandler(2, 10000, 50);
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error("rate limit"))
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValue("success");

      const start = Date.now();
      await handler.execute(operation);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(200);
    });
  });

  describe("defaultIsRetryable", () => {
    it("should return true for rate limit errors", () => {
      const handler = new RetryHandler();
      const error = new Error("rate limit exceeded");

      expect(handler["defaultIsRetryable"](error)).toBe(true);
    });

    it("should return true for timeout errors", () => {
      const handler = new RetryHandler();
      const error = new Error("request timeout");

      expect(handler["defaultIsRetryable"](error)).toBe(true);
    });

    it("should return true for econnreset errors", () => {
      const handler = new RetryHandler();
      const error = new Error("ECONNRESET");

      expect(handler["defaultIsRetryable"](error)).toBe(true);
    });

    it("should return true for econnrefused errors", () => {
      const handler = new RetryHandler();
      const error = new Error("ECONNREFUSED");

      expect(handler["defaultIsRetryable"](error)).toBe(true);
    });

    it("should return true for 5xx status codes", () => {
      const handler = new RetryHandler();
      const error: { statusCode: number; name: string; message: string } = {
        statusCode: 500,
        name: "Error",
        message: "Internal Server Error",
      };

      expect(handler["defaultIsRetryable"](error as unknown as Error)).toBe(true);
    });

    it("should return false for other errors", () => {
      const handler = new RetryHandler();
      const error = new Error("invalid request");

      expect(handler["defaultIsRetryable"](error)).toBe(false);
    });

    it("should return false for 4xx status codes", () => {
      const handler = new RetryHandler();
      const error: { statusCode: number; name: string; message: string } = {
        statusCode: 404,
        name: "Error",
        message: "Not Found",
      };

      expect(handler["defaultIsRetryable"](error as unknown as Error)).toBe(false);
    });
  });

  describe("RetryExhaustedError", () => {
    it("should create error with correct properties", () => {
      const originalError = new Error("original");
      const error = new RetryExhaustedError("Max retries exceeded", originalError, 5);

      expect(error.message).toBe("Max retries exceeded");
      expect(error.originalError).toBe(originalError);
      expect(error.attempts).toBe(5);
      expect(error.name).toBe("RetryExhaustedError");
    });
  });
});
