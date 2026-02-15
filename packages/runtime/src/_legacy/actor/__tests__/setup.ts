import { vi, beforeEach, afterEach } from "vitest";

// 전역 타이머 mock
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
