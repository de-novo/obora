import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HealthChecker, createStuckExecutionCheck } from "../health-check.js";

describe("HealthChecker", () => {
  let checker: HealthChecker;

  beforeEach(() => {
    checker = new HealthChecker({ intervalMs: 50 });
  });

  afterEach(() => {
    checker.dispose();
    vi.useRealTimers();
  });

  it("starts with no checks registered", async () => {
    const status = await checker.check();
    expect(status.healthy).toBe(true);
    expect(status.checks).toHaveLength(0);
    expect(status.timestamp).toBeDefined();
  });

  it("registers and runs checks", async () => {
    checker.register("test-check", async () => ({
      status: "pass",
      message: "all good",
    }));

    const status = await checker.check();
    expect(status.healthy).toBe(true);
    expect(status.checks).toHaveLength(1);
    expect(status.checks[0]).toMatchObject({
      name: "test-check",
      status: "pass",
      message: "all good",
    });
  });

  it("marks unhealthy when any check fails", async () => {
    checker.register("passing", async () => ({ status: "pass" }));
    checker.register("failing", async () => ({ status: "fail", message: "error" }));

    const status = await checker.check();
    expect(status.healthy).toBe(false);
    expect(status.checks).toHaveLength(2);
  });

  it("handles check exceptions as failures", async () => {
    checker.register("broken", async () => {
      throw new Error("check crashed");
    });

    const status = await checker.check();
    expect(status.healthy).toBe(false);
    expect(status.checks[0]).toMatchObject({
      name: "broken",
      status: "fail",
      message: "check crashed",
    });
  });

  it("caches last status", async () => {
    expect(checker.getLastStatus()).toBeUndefined();
    
    await checker.check();
    expect(checker.getLastStatus()).toBeDefined();
    expect(checker.getLastStatus()?.healthy).toBe(true);
  });

  it("notifies listeners on check", async () => {
    const listener = vi.fn();
    const unsubscribe = checker.onStatusChange(listener);

    checker.register("test", async () => ({ status: "pass" }));
    await checker.check();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({ healthy: true });

    unsubscribe();
  });

  it("allows unsubscribing listeners", async () => {
    const listener = vi.fn();
    const unsubscribe = checker.onStatusChange(listener);
    unsubscribe();

    checker.register("test", async () => ({ status: "pass" }));
    await checker.check();

    expect(listener).not.toHaveBeenCalled();
  });

  it("ignores listener errors", async () => {
    checker.onStatusChange(() => {
      throw new Error("listener crash");
    });

    checker.register("test", async () => ({ status: "pass" }));
    // Should not throw
    await expect(checker.check()).resolves.toBeDefined();
  });

  it("starts and stops periodic checking", async () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    checker.onStatusChange(listener);

    checker.register("test", async () => ({ status: "pass" }));
    checker.start();

    // Should run immediately + on interval
    await vi.advanceTimersByTimeAsync(0);
    expect(listener).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(50);
    expect(listener).toHaveBeenCalledTimes(2);

    checker.stop();
    await vi.advanceTimersByTimeAsync(100);
    expect(listener).toHaveBeenCalledTimes(2); // No more calls
  });

  it("handles multiple start calls gracefully", () => {
    checker.start();
    checker.start(); // Should not create duplicate timer
    expect(checker).toBeDefined();
  });

  it("dispose stops and clears everything", async () => {
    checker.register("test", async () => ({ status: "pass" }));
    checker.start();
    checker.dispose();

    expect(checker.getLastStatus()).toBeUndefined(); // Cleared
  });

  it("uses default config when not provided", () => {
    const defaultChecker = new HealthChecker();
    expect(defaultChecker).toBeDefined();
    defaultChecker.dispose();
  });
});

describe("createStuckExecutionCheck", () => {
  it("passes when no executions are stuck", async () => {
    const check = createStuckExecutionCheck(() => [
      { id: "1", startedAt: new Date(Date.now() - 1000), workflowName: "test" },
    ], 5000);

    const result = await check();
    expect(result.status).toBe("pass");
  });

  it("fails when executions are stuck", async () => {
    const check = createStuckExecutionCheck(() => [
      { id: "1", startedAt: new Date(Date.now() - 10000), workflowName: "test" },
    ], 5000);

    const result = await check();
    expect(result.status).toBe("fail");
    expect(result.message).toContain("1 execution(s) stuck");
    expect(result.metadata?.stuckExecutions).toHaveLength(1);
  });

  it("uses default threshold", async () => {
    const check = createStuckExecutionCheck(() => []);
    const result = await check();
    expect(result.status).toBe("pass");
  });
});
