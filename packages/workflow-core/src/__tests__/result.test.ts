import { describe, it, expect } from "vitest";
import { ok, err, type Result } from "../types.js";

describe("Result Pattern", () => {
  describe("ok helper", () => {
    it("creates successful result with value", () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    it("creates successful result with object", () => {
      const data = { name: "test", count: 5 };
      const result = ok(data);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(data);
      }
    });
  });

  describe("err helper", () => {
    it("creates error result with error object", () => {
      const error = new Error("Test error");
      const result = err(error);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });

    it("creates error result with custom error type", () => {
      const error = { code: "NOT_FOUND", message: "Resource not found" };
      const result = err(error);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toEqual(error);
      }
    });
  });

  describe("Type safety", () => {
    it("narrows type based on ok property", () => {
      const result: Result<number, Error> = ok(42);

      if (result.ok) {
        // TypeScript should know result.value exists and is number
        const value: number = result.value;
        expect(value).toBe(42);
      } else {
        // TypeScript should know result.error exists and is Error
        const error: Error = result.error;
        expect(error).toBeInstanceOf(Error);
      }
    });

    it("handles custom error types", () => {
      type CustomError = { reason: string; context?: string };
      const result: Result<string, CustomError> = err({ reason: "failed" });

      if (!result.ok) {
        expect(result.error.reason).toBe("failed");
      }
    });
  });

  describe("Practical usage", () => {
    function divide(a: number, b: number): Result<number, string> {
      if (b === 0) {
        return err("Division by zero");
      }
      return ok(a / b);
    }

    it("returns success for valid division", () => {
      const result = divide(10, 2);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(5);
      }
    });

    it("returns error for division by zero", () => {
      const result = divide(10, 0);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Division by zero");
      }
    });
  });
});
