---
name: tdd-test-design
description: Guide for writing high-quality, robust tests FIRST in TDD workflow. Use when designing and writing test suites. Covers test organization, mock patterns, implementation-agnostic testing, and edge case coverage.
---

# TDD Test Design Guide

## Test File Organization

### Directory Structure

```
test/
├── unit/           # Fast, isolated tests (60% of tests)
├── integration/    # Real component interactions (25% of tests)
└── edge/           # Boundary and edge cases (15% of tests)
```

### Naming Conventions

- Test files: `{module}.test.ts`
- Describe blocks: `describe('{ModuleName}')`
- Test names: `should {verb} when {condition}`

```
describe('TaskManager', () => {
  it('should create task when valid input provided', () => {})
  it('should throw error when title is empty', () => {})
})
```

## Implementation-Agnostic Testing

### Test Behavior, Not Internals

```typescript
// BAD: Tests implementation detail
it("should set _status to pending", () => {
  expect(task._status).toBe("pending");
});

// GOOD: Tests observable behavior
it("should start in pending status", () => {
  expect(task.getStatus()).toBe("pending");
});
```

### Use Public API Only

- Test through the module's exported interface
- Avoid accessing private properties or internal functions
- If you need to test internals, the API may need redesign

## Mock Patterns

### Mock at Interface Boundaries

```typescript
// GOOD: Mock at the module boundary
vi.mock('../services/database', () => ({
  Database: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue([{ id: 1 }]),
    save: vi.fn().mockResolvedValue(undefined),
  })),
}))

// BAD: Mock deep internals
vi.mock('../services/database/connection-pool', () => ...)
```

### Mock Cleanup

```typescript
afterEach(() => {
  vi.clearAllMocks();
});
```

## Integration Test Patterns

### Real CLI Execution

```typescript
import { execSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("CLI integration", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should create task and output ID", () => {
    const output = execSync(`node dist/cli.js create "Test task" --dir ${tempDir}`, {
      encoding: "utf-8",
    });
    const idMatch = output.match(/Task created: ([a-f0-9-]+)/);
    expect(idMatch).not.toBeNull();
    const taskId = idMatch![1];
    // Use the extracted ID in subsequent operations
    const listOutput = execSync(`node dist/cli.js list --dir ${tempDir}`, { encoding: "utf-8" });
    expect(listOutput).toContain(taskId);
  });
});
```

### NEVER Hardcode Generated IDs

```typescript
// BAD: Hardcoded ID will fail
expect(task.id).toBe("abc-123-def");

// GOOD: Parse output to extract ID
const output = execSync('node dist/cli.js create "Task"');
const id = parseTaskId(output);
expect(id).toMatch(/^[a-f0-9-]+$/);
```

## Date/Time Testing

### Always Use Fake Timers

```typescript
describe("scheduling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should calculate due date correctly", () => {
    const task = createTask({ dueIn: 7 });
    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000);
    expect(task.isOverdue()).toBe(true);
  });
});
```

### Fixed Date Patterns

- Set a fixed "now" for all time-dependent tests
- Use `vi.advanceTimersByTime()` for time progression
- Never rely on actual system time in tests

## Edge Case Categories

Always cover these categories for each feature:

### 1. Empty Input

```typescript
it("should handle empty array", () => {});
it("should handle empty string", () => {});
it("should handle null/undefined where allowed", () => {});
```

### 2. Boundary Values

```typescript
it("should handle minimum value", () => {});
it("should handle maximum value", () => {});
it("should reject value below minimum", () => {});
it("should reject value above maximum", () => {});
```

### 3. Concurrent Access

```typescript
it("should handle concurrent modifications", async () => {
  const promises = [
    manager.update(id, { status: "done" }),
    manager.update(id, { status: "cancelled" }),
  ];
  await Promise.all(promises);
  // Verify consistent final state
});
```

### 4. Corrupted Data

```typescript
it("should recover from corrupted file", () => {});
it("should handle malformed JSON", () => {});
it("should handle missing required fields", () => {});
```

### 5. Unicode/Special Characters

```typescript
it("should handle unicode in task title", () => {
  const task = createTask({ title: "任务 🎉 café" });
  expect(task.title).toBe("任务 🎉 café");
});

it("should escape special regex characters in search", () => {});
it("should handle newlines and tabs in input", () => {});
```

## Expected Test Distribution

For each feature:

- **60% Unit tests**: Fast, isolated, test individual functions/classes
- **25% Integration tests**: Test component interactions, use real dependencies where practical
- **15% Edge case tests**: Boundary conditions, error states, malformed input

## Test Quality Checklist

Before submitting tests, verify:

- [ ] All test names follow "should {verb} when {condition}" pattern
- [ ] No hardcoded IDs, UUIDs, or timestamps
- [ ] Fake timers used for all time-dependent tests
- [ ] Mocks are at interface boundaries, not internals
- [ ] Edge cases from all 5 categories are covered
- [ ] Integration tests use real CLI execution with temp directories
- [ ] All async operations are properly awaited
- [ ] Resources are cleaned up in afterEach/afterAll
