import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CircuitBreaker, CircuitOpenError } from "../circuit-breaker.js";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 100,
      successThreshold: 2,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in closed state", () => {
    expect(breaker.getState()).toBe("closed");
    expect(breaker.getStats()).toMatchObject({
      state: "closed",
      failureCount: 0,
      successCount: 0,
    });
  });

  it("allows successful execution in closed state", async () => {
    const result = await breaker.execute(() => Promise.resolve("success"));
    expect(result).toBe("success");
    expect(breaker.getState()).toBe("closed");
  });

  it("counts failures and stays closed below threshold", async () => {
    for (let i = 0; i < 2; i++) {
      await expect(
        breaker.execute(() => Promise.reject(new Error("fail")))
      ).rejects.toThrow("fail");
    }
    expect(breaker.getState()).toBe("closed");
    expect(breaker.getStats().failureCount).toBe(2);
  });

  it("trips to open after threshold failures", async () => {
    for (let i = 0; i < 3; i++) {
      await expect(
        breaker.execute(() => Promise.reject(new Error("fail")))
      ).rejects.toThrow("fail");
    }
    expect(breaker.getState()).toBe("open");
  });

  it("rejects execution with CircuitOpenError when open", async () => {
    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      await expect(
        breaker.execute(() => Promise.reject(new Error("fail")))
      ).rejects.toThrow();
    }

    await expect(
      breaker.execute(() => Promise.resolve("success"))
    ).rejects.toThrow(CircuitOpenError);
  });

  it("transitions to half_open after reset timeout", async () => {
    vi.useFakeTimers();
    
    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
    }
    expect(breaker.getState()).toBe("open");

    // Advance past reset timeout
    vi.advanceTimersByTime(150);
    expect(breaker.getState()).toBe("half_open");
  });

  it("closes circuit after success threshold in half_open", async () => {
    vi.useFakeTimers();
    
    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
    }

    // Advance to half_open
    vi.advanceTimersByTime(150);
    expect(breaker.getState()).toBe("half_open");

    // First success
    await breaker.execute(() => Promise.resolve("ok"));
    expect(breaker.getState()).toBe("half_open");
    expect(breaker.getStats().successCount).toBe(1);

    // Second success → closes
    await breaker.execute(() => Promise.resolve("ok"));
    expect(breaker.getState()).toBe("closed");
    expect(breaker.getStats().failureCount).toBe(0);
  });

  it("reopens circuit on failure in half_open", async () => {
    vi.useFakeTimers();
    
    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
    }

    // Advance to half_open
    vi.advanceTimersByTime(150);
    expect(breaker.getState()).toBe("half_open");

    // Failure in half_open → back to open
    await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
    expect(breaker.getState()).toBe("open");
  });

  it("resets failure count on success in closed state", async () => {
    // One failure
    await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
    expect(breaker.getStats().failureCount).toBe(1);

    // Success resets count
    await breaker.execute(() => Promise.resolve("ok"));
    expect(breaker.getStats().failureCount).toBe(0);
  });

  it("reset() restores closed state", async () => {
    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
    }
    expect(breaker.getState()).toBe("open");

    breaker.reset();
    expect(breaker.getState()).toBe("closed");
    expect(breaker.getStats()).toMatchObject({
      failureCount: 0,
      successCount: 0,
      lastFailureTime: 0,
    });
  });

  it("uses default config when not provided", () => {
    const defaultBreaker = new CircuitBreaker();
    expect(defaultBreaker.getStats()).toBeDefined();
  });

  it("CircuitOpenError has correct code", () => {
    const error = new CircuitOpenError("test");
    expect(error.code).toBe("CIRCUIT_OPEN");
    expect(error.name).toBe("CircuitOpenError");
  });
});
