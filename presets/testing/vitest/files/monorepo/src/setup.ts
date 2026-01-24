import "@testing-library/dom";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, afterAll } from "vitest";

/**
 * Common test setup for React projects
 * Import this in your vitest.setup.ts
 */
export function setupReactTesting() {
  // Cleanup after each test
  afterEach(() => {
    cleanup();
  });
}

/**
 * Setup console error suppression for expected errors
 */
export function setupConsoleErrorSuppression(patterns: RegExp[]) {
  const originalError = console.error;

  beforeAll(() => {
    console.error = (...args: unknown[]) => {
      const message = args[0];
      if (typeof message === "string") {
        const shouldSuppress = patterns.some((pattern) => pattern.test(message));
        if (shouldSuppress) return;
      }
      originalError.call(console, ...args);
    };
  });

  afterAll(() => {
    console.error = originalError;
  });
}

/**
 * Setup window.matchMedia mock (for responsive components)
 */
export function setupMatchMedia() {
  beforeAll(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  });
}

/**
 * Setup IntersectionObserver mock
 */
export function setupIntersectionObserver() {
  beforeAll(() => {
    const mockIntersectionObserver = class {
      observe = () => {};
      disconnect = () => {};
      unobserve = () => {};
    };
    Object.defineProperty(window, "IntersectionObserver", {
      writable: true,
      value: mockIntersectionObserver,
    });
  });
}

/**
 * Setup ResizeObserver mock
 */
export function setupResizeObserver() {
  beforeAll(() => {
    const mockResizeObserver = class {
      observe = () => {};
      disconnect = () => {};
      unobserve = () => {};
    };
    Object.defineProperty(window, "ResizeObserver", {
      writable: true,
      value: mockResizeObserver,
    });
  });
}

/**
 * Setup all common browser API mocks
 */
export function setupBrowserMocks() {
  setupMatchMedia();
  setupIntersectionObserver();
  setupResizeObserver();
}
