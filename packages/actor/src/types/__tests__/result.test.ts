import { describe, it, expect } from "vitest";
import {
  createResultId,
  isValidResultId,
  createSuccessResult,
  createFailureResult,
  type ResultId,
} from "../result";

describe("createResultId", () => {
  it("should create a valid ResultId with correct prefix", () => {
    const id = createResultId("result-001");
    expect(id).toBe("result-001");
    expect(isValidResultId(id)).toBe(true);
  });

  it("should throw error for id without 'result-' prefix", () => {
    expect(() => createResultId("invalid-001")).toThrow("ResultId must start with 'result-'");
    expect(() => createResultId("001")).toThrow("ResultId must start with 'result-'");
    expect(() => createResultId("result")).toThrow("ResultId must start with 'result-'");
  });

  it("should accept various valid result IDs", () => {
    const validIds = [
      "result-1",
      "result-123",
      "result-test",
      "result-with-hyphens",
      "result-with_underscores",
      "result-with.multiple.parts",
    ];
    validIds.forEach((id) => {
      expect(createResultId(id)).toBe(id);
    });
  });
});

describe("isValidResultId", () => {
  it("should validate correct ResultId format", () => {
    expect(isValidResultId("result-001")).toBe(true);
    expect(isValidResultId("result-test-123")).toBe(true);
    expect(isValidResultId("result-with-hyphens")).toBe(true);
  });

  it("should reject invalid ResultId formats", () => {
    expect(isValidResultId("invalid")).toBe(false);
    expect(isValidResultId("test-001")).toBe(false);
    expect(isValidResultId("result")).toBe(false);
    expect(isValidResultId("")).toBe(false);
    expect(isValidResultId(123)).toBe(false);
    expect(isValidResultId(null)).toBe(false);
    expect(isValidResultId(undefined)).toBe(false);
    expect(isValidResultId({})).toBe(false);
  });

  it("should type narrow correctly", () => {
    const value: unknown = "result-123";
    if (isValidResultId(value)) {
      expect(value.startsWith("result-")).toBe(true);
      expect(value).toStrictEqual(expect.any(String));
    } else {
      expect(true).toBe(false);
    }
  });
});

describe("createSuccessResult", () => {
  const mockActionId = "action-123" as any;
  const mockActorId = "actor-123" as any;
  const mockOutput = { data: "test output" };
  const duration = 100;

  it("should create a success result with correct properties", () => {
    const result = createSuccessResult(mockActionId, mockActorId, mockOutput, duration);

    expect(result.id).toMatch(
      /^result-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(result.actionId).toBe(mockActionId);
    expect(result.actorId).toBe(mockActorId);
    expect(result.status).toBe("success");
    expect(result.output).toBe(mockOutput);
    expect(result.error).toBeUndefined();
    expect(result.metrics?.duration).toBe(duration);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it("should create success result with various output types", () => {
    const stringOutput = createSuccessResult(mockActionId, mockActorId, "string output", 50);
    expect(stringOutput.output).toBe("string output");

    const numberOutput = createSuccessResult(mockActionId, mockActorId, 42, 50);
    expect(numberOutput.output).toBe(42);

    const arrayOutput = createSuccessResult(mockActionId, mockActorId, [1, 2, 3], 50);
    expect(arrayOutput.output).toEqual([1, 2, 3]);

    const objectOutput = createSuccessResult(mockActionId, mockActorId, { key: "value" }, 50);
    expect(objectOutput.output).toEqual({ key: "value" });

    const nullOutput = createSuccessResult(mockActionId, mockActorId, null, 50);
    expect(nullOutput.output).toBeNull();
  });

  it("should generate unique IDs for each result", () => {
    const result1 = createSuccessResult(mockActionId, mockActorId, mockOutput, 100);
    const result2 = createSuccessResult(mockActionId, mockActorId, mockOutput, 100);

    expect(result1.id).not.toBe(result2.id);
    expect(isValidResultId(result1.id)).toBe(true);
    expect(isValidResultId(result2.id)).toBe(true);
  });

  it("should handle different duration values", () => {
    const fastResult = createSuccessResult(mockActionId, mockActorId, mockOutput, 1);
    expect(fastResult.metrics?.duration).toBe(1);

    const slowResult = createSuccessResult(mockActionId, mockActorId, mockOutput, 99999);
    expect(slowResult.metrics?.duration).toBe(99999);

    const zeroResult = createSuccessResult(mockActionId, mockActorId, mockOutput, 0);
    expect(zeroResult.metrics?.duration).toBe(0);
  });
});

describe("createFailureResult", () => {
  const mockActionId = "action-123" as any;
  const mockActorId = "actor-123" as any;
  const mockError = "Something went wrong";
  const duration = 50;

  it("should create a failure result with correct properties", () => {
    const result = createFailureResult(mockActionId, mockActorId, mockError, duration);

    expect(result.id).toMatch(
      /^result-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(result.actionId).toBe(mockActionId);
    expect(result.actorId).toBe(mockActorId);
    expect(result.status).toBe("failure");
    expect(result.error).toBe(mockError);
    expect(result.output).toBeUndefined();
    expect(result.metrics?.duration).toBe(duration);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it("should create failure result with various error messages", () => {
    const shortError = createFailureResult(mockActionId, mockActorId, "err", 50);
    expect(shortError.error).toBe("err");

    const longError = createFailureResult(mockActionId, mockActorId, "A".repeat(1000), 50);
    expect(longError.error).toBe("A".repeat(1000));

    const multiLineError = createFailureResult(
      mockActionId,
      mockActorId,
      "Line 1\nLine 2\nLine 3",
      50
    );
    expect(multiLineError.error).toBe("Line 1\nLine 2\nLine 3");

    const specialCharsError = createFailureResult(
      mockActionId,
      mockActorId,
      "Error: !@#$%^&*()",
      50
    );
    expect(specialCharsError.error).toBe("Error: !@#$%^&*()");
  });

  it("should generate unique IDs for each result", () => {
    const result1 = createFailureResult(mockActionId, mockActorId, mockError, 50);
    const result2 = createFailureResult(mockActionId, mockActorId, mockError, 50);

    expect(result1.id).not.toBe(result2.id);
    expect(isValidResultId(result1.id)).toBe(true);
    expect(isValidResultId(result2.id)).toBe(true);
  });

  it("should handle different duration values", () => {
    const fastResult = createFailureResult(mockActionId, mockActorId, mockError, 1);
    expect(fastResult.metrics?.duration).toBe(1);

    const slowResult = createFailureResult(mockActionId, mockActorId, mockError, 99999);
    expect(slowResult.metrics?.duration).toBe(99999);

    const zeroResult = createFailureResult(mockActionId, mockActorId, mockError, 0);
    expect(zeroResult.metrics?.duration).toBe(0);
  });
});

describe("Result type behavior", () => {
  it("should distinguish between success and failure results", () => {
    const success = createSuccessResult("action-1" as any, "actor-1" as any, "data", 100);
    const failure = createFailureResult("action-2" as any, "actor-2" as any, "error", 50);

    expect(success.status).toBe("success");
    expect(success.output).toBeDefined();
    expect(success.error).toBeUndefined();

    expect(failure.status).toBe("failure");
    expect(failure.error).toBeDefined();
    expect(failure.output).toBeUndefined();
  });
});
