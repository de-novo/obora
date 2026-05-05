import { describe, expect, it, vi } from "vitest";

import { calculateDelay, waitWithAbort } from "../retry-policy.js";

describe("calculateDelay", () => {
  it("uses default exponential backoff and jitter", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);

    expect(calculateDelay(0, { baseDelayMs: 100, maxDelayMs: 5_000 })).toBe(100);
    expect(calculateDelay(2, { baseDelayMs: 100, maxDelayMs: 5_000 })).toBe(400);

    random.mockRestore();
  });

  it("caps delay and clamps negative jitter at zero", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);

    expect(
      calculateDelay(3, {
        baseDelayMs: 100,
        maxDelayMs: 250,
        backoffMultiplier: 3,
        jitterRatio: 2,
      })
    ).toBe(0);

    random.mockRestore();
  });

  it("treats negative attempts as the first attempt", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(1);

    expect(
      calculateDelay(-1, {
        baseDelayMs: 100,
        maxDelayMs: 150,
        jitterRatio: 1,
      })
    ).toBe(150);

    random.mockRestore();
  });
});

describe("waitWithAbort", () => {
  it("resolves after the timeout", async () => {
    vi.useFakeTimers();
    const wait = waitWithAbort(25);

    await vi.advanceTimersByTimeAsync(25);

    await expect(wait).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(waitWithAbort(25, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("clears the timeout and rejects when aborted while waiting", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const wait = waitWithAbort(100, controller.signal);
    const assertion = expect(wait).rejects.toMatchObject({ name: "AbortError" });

    controller.abort();
    await vi.advanceTimersByTimeAsync(100);

    await assertion;
    vi.useRealTimers();
  });
});
