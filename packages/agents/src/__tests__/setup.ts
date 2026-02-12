import { vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { globalToolRegistry } from "../tools/registry";
import { globalPromptRegistry } from "../prompts/registry";

beforeAll(() => {
  // 테스트 시작 전 설정
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  globalToolRegistry.clear();
  globalPromptRegistry.clear();
});

afterAll(() => {
  // 테스트 종료 후 정리
});
