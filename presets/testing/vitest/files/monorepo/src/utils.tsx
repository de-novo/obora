import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

/**
 * Custom render function with user event setup
 */
export function renderWithUser(
  ui: ReactElement,
  options?: RenderOptions
): RenderResult & { user: ReturnType<typeof userEvent.setup> } {
  return {
    user: userEvent.setup(),
    ...render(ui, options),
  };
}

/**
 * Create a wrapper provider for testing
 *
 * @example
 * ```ts
 * const wrapper = createWrapper([
 *   [QueryClientProvider, { client: queryClient }],
 *   [ThemeProvider, { theme: "dark" }],
 * ]);
 *
 * render(<MyComponent />, { wrapper });
 * ```
 */
export function createWrapper(
  providers: Array<[React.ComponentType<{ children: ReactNode }>, Record<string, unknown>?]>
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return providers.reduceRight<ReactNode>((acc, [Provider, props]) => {
      return <Provider {...(props || {})}>{acc}</Provider>;
    }, children);
  };
}

/**
 * Wait for a condition to be true
 */
export async function waitForCondition(
  condition: () => boolean,
  timeout = 5000,
  interval = 50
): Promise<void> {
  const startTime = Date.now();
  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error("Condition not met within timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * Create a mock function with typed return value
 */
export function createMockFn<T>(returnValue?: T) {
  return vi.fn(() => returnValue);
}

/**
 * Create async mock function
 */
export function createAsyncMockFn<T>(returnValue?: T) {
  return vi.fn(async () => returnValue);
}

/**
 * Delay utility for testing async behavior
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate random test data
 */
export const testData = {
  id: () => Math.random().toString(36).substring(2, 9),
  email: (name = "test") => `${name}${Date.now()}@example.com`,
  name: () => `User ${Math.floor(Math.random() * 1000)}`,
  timestamp: () => new Date().toISOString(),
};
