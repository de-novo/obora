// Configuration
export { baseConfig, createConfig, createLibraryConfig } from "./config";

// Setup utilities
export {
  setupReactTesting,
  setupConsoleErrorSuppression,
  setupMatchMedia,
  setupIntersectionObserver,
  setupResizeObserver,
  setupBrowserMocks,
} from "./setup";

// Testing utilities
export {
  renderWithUser,
  createWrapper,
  waitForCondition,
  createMockFn,
  createAsyncMockFn,
  delay,
  testData,
} from "./utils";

// Re-export testing libraries
export { render, screen, waitFor, within, fireEvent, cleanup } from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
export {
  describe,
  it,
  expect,
  test,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
export type { Mock } from "vitest";
