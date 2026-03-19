# TypeScript Testing Reference

## Vitest Configuration

### Basic Setup

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
});
```

### Fake Timers Setup

```typescript
import { vi, beforeEach, afterEach, describe, it, expect } from "vitest";

describe("time-dependent feature", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should execute after delay", () => {
    const callback = vi.fn();
    setTimeout(callback, 1000);

    vi.advanceTimersByTime(1000);

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
```

## Common Patterns

### Testing Async Functions

```typescript
describe("async operations", () => {
  it("should resolve with expected value", async () => {
    const result = await asyncFunction();
    expect(result).toEqual(expectedValue);
  });

  it("should reject with error on failure", async () => {
    await expect(failingAsyncFunction()).rejects.toThrow("Expected error");
  });
});
```

### Testing Event Emitters

```typescript
import { EventEmitter } from "events";

describe("event emitter", () => {
  it("should emit event with data", () => {
    const emitter = new EventEmitter();
    const listener = vi.fn();
    emitter.on("event", listener);

    emitter.emit("event", { data: "test" });

    expect(listener).toHaveBeenCalledWith({ data: "test" });
  });
});
```

### Testing CLI Output

```typescript
import { execSync } from "child_process";

describe("CLI", () => {
  it("should output version", () => {
    const output = execSync("node dist/cli.js --version", { encoding: "utf-8" });

    // Parse and validate, don't hardcode
    expect(output).toMatch(/\d+\.\d+\.\d+/);
  });

  it("should handle errors gracefully", () => {
    try {
      execSync("node dist/cli.js --invalid-flag", { encoding: "utf-8" });
    } catch (error) {
      expect(error.message).toContain("unknown option");
    }
  });
});
```

### Mocking Modules

```typescript
import { vi } from "vitest";

// Mock at module level
vi.mock("fs", () => ({
  readFileSync: vi.fn(() => "mocked content"),
  writeFileSync: vi.fn(),
}));

// Mock with implementation
vi.mock("../database", () => ({
  Database: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue([{ id: 1 }]),
    close: vi.fn(),
  })),
}));
```

## Test Data Factories

### Using Factory Functions

```typescript
interface User {
  id: string;
  name: string;
  email: string;
}

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: crypto.randomUUID(),
    name: "Test User",
    email: "test@example.com",
    ...overrides,
  };
}

describe("user operations", () => {
  it("should process user", () => {
    const user = createUser({ name: "Custom Name" });
    expect(processUser(user)).toBeTruthy();
  });
});
```

### Using Fixtures

```typescript
// test/fixtures/users.ts
export const validUser = {
  id: "user-123",
  name: "Valid User",
  email: "valid@example.com",
};

export const invalidUser = {
  id: "",
  name: "",
  email: "not-an-email",
};
```

## Assertion Helpers

### Custom Matchers

```typescript
import { expect } from "vitest";

expect.extend({
  toBeValidEmail(received: string) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = emailRegex.test(received);
    return {
      pass,
      message: () => `expected ${received} ${pass ? "not " : ""}to be a valid email`,
    };
  },
});

// Usage
expect("user@example.com").toBeValidEmail();
```

### Snapshot Testing

```typescript
describe("output formatting", () => {
  it("should format output correctly", () => {
    const result = formatData({ key: "value" });
    expect(result).toMatchSnapshot();
  });
});
```

## Performance Testing

### Benchmarking

```typescript
import { bench, describe } from "vitest";

describe("performance", () => {
  bench("sorting 1000 items", () => {
    const arr = Array.from({ length: 1000 }, (_, i) => 1000 - i);
    arr.sort((a, b) => a - b);
  });
});
```

## Coverage Guidelines

### Minimum Coverage Targets

- Statements: 80%
- Branches: 75%
- Functions: 80%
- Lines: 80%

### What to Test

- All public functions and methods
- Error paths and edge cases
- Boundary conditions
- Integration points

### What Not to Test

- Third-party libraries (they have their own tests)
- Generated code
- Trivial getters/setters
