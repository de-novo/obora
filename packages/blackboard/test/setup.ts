import { beforeEach, afterEach, vi } from 'vitest';

// 전역 설정
beforeEach(() => {
  // Date.now() 모킹 (재현 가능한 테스트)
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-02-06T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
