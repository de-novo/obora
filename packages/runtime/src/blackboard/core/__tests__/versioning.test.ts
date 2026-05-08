import { describe, expect, it, vi } from "vitest";

import { VersionConflictError, VersionManager } from "../versioning";

describe("VersionManager", () => {
  it("validates, increments, and calculates fixed/exponential retry delays", () => {
    const fixed = new VersionManager({ maxRetries: 1, retryDelay: 25, exponentialBackoff: false });
    expect(() => fixed.validateVersion(2, 1, "state.phase")).toThrow(VersionConflictError);
    expect(fixed.incrementVersion(2)).toBe(3);
    expect(() => fixed.incrementVersion(-1)).toThrow("Invalid version: -1");
    expect(fixed.calculateDelay(3)).toBe(25);

    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const exponential = new VersionManager({ maxRetries: 1, retryDelay: 100, exponentialBackoff: true });
    expect(exponential.calculateDelay(2)).toBe(425);
    random.mockRestore();
  });

  it("retries version conflicts, stops at max retries, and rethrows non-conflict errors", async () => {
    const retried = new VersionManager({ maxRetries: 2, retryDelay: 0, exponentialBackoff: false });
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new VersionConflictError(1, 2, "state.phase"))
      .mockResolvedValueOnce("ok");

    await expect(retried.executeWithRetry(operation, "write state")).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);

    const exhausted = new VersionManager({ maxRetries: 1, retryDelay: 0, exponentialBackoff: false });
    await expect(
      exhausted.executeWithRetry(() => {
        throw new VersionConflictError(1, 2, "state.phase");
      }),
    ).rejects.toThrow(VersionConflictError);

    await expect(
      retried.executeWithRetry(() => {
        throw "boom";
      }),
    ).rejects.toThrow("boom");
  });

  it("updates config without leaking mutable state", () => {
    const manager = new VersionManager({ maxRetries: 1, retryDelay: 10, exponentialBackoff: false });
    const snapshot = manager.getConfig();

    manager.updateConfig({ maxRetries: 4, exponentialBackoff: true });

    expect(snapshot).toEqual({ maxRetries: 1, retryDelay: 10, exponentialBackoff: false });
    expect(manager.getConfig()).toEqual({ maxRetries: 4, retryDelay: 10, exponentialBackoff: true });
  });
});
