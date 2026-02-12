import { vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { globalToolRegistry } from "../tools/registry";
import { globalPromptRegistry } from "../prompts/registry";

beforeAll(() => {
  // 테스트 시작 전 설정
});

beforeEach(() => {
  // fake timers는 필요한 테스트에서 개별적으로 사용
});

afterEach(() => {
  vi.clearAllMocks();
  globalToolRegistry.clear();
  globalPromptRegistry.clear();
});

afterAll(() => {
  // 테스트 종료 후 정리
});
