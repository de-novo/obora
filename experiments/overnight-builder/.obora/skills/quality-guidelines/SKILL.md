---
name: quality-guidelines
description: Code quality guidelines for TDD-based development. Use when writing tests, implementing code, or reviewing code quality. Includes testing best practices, code standards, error handling patterns, and integration test patterns.
---

# Quality Guidelines for Production Code

## Testing Best Practices

### Fake Timers

- Always use fake timers for time-dependent tests
- Call `vi.useFakeTimers()` before testing time-dependent code
- Call `vi.useRealTimers()` in afterEach or after the test
- Use `vi.advanceTimersByTime(ms)` or `vi.advanceTimersToNextTimer()` to control time

### Static Imports

- Import modules at the top of the file, not inside functions or tests
- Use `vi.mock()` at the top level for mocking modules
- Avoid dynamic imports in test files unless specifically testing lazy loading

### Mock Cleanup

- Always clean up mocks in `afterEach` or `afterAll` hooks
- Use `vi.clearAllMocks()` to reset call counts
- Use `vi.resetAllMocks()` to reset implementations and call counts
- Use `vi.restoreAllMocks()` to restore original implementations

### Test Structure

- Use descriptive test names that explain the expected behavior
- Follow the pattern: "should [expected behavior] when [condition]"
- Group related tests with `describe` blocks
- Keep tests focused on a single behavior

### Assertions

- Use specific matchers (`toBe`, `toEqual`, `toThrow`) over generic ones (`toBeTruthy`)
- Avoid testing implementation details; test behavior and outputs
- Use `expect.objectContaining()` for partial object matching when appropriate

## Code Quality Standards

### No Magic Numbers

- Extract numeric literals into named constants
- Constants should have descriptive names explaining their purpose
- Example: Use `const MAX_RETRY_COUNT = 3` instead of hardcoded `3`

### No Hardcoded IDs

- Never hardcode UUIDs, database IDs, or other identifiers
- Generate IDs dynamically or accept them as parameters
- Use factories or fixtures for test data with IDs

### Naming Conventions

- Use descriptive variable and function names
- Boolean variables should start with `is`, `has`, `should`, or `can`
- Functions that return booleans should start with `is`, `has`, `can`
- Constants should be SCREAMING_SNAKE_CASE

### Code Organization

- One module per file, one primary export per module
- Keep functions small and focused on a single responsibility
- Avoid deeply nested conditionals; use early returns

## Error Handling Patterns

### Input Validation

- Validate all external inputs at function/module boundaries
- Use type guards for runtime type checking when needed
- Provide clear error messages for validation failures

### Error Types

- Use custom error classes for different error types
- Include relevant context in error messages
- Preserve the original error when wrapping exceptions

### Error Propagation

- Let errors bubble up when the caller can handle them
- Catch and handle errors at appropriate abstraction levels
- Use Result types for expected failures, exceptions for unexpected ones

### Logging

- Log at appropriate levels (debug, info, warn, error)
- Include context that aids debugging
- Never log sensitive information (passwords, tokens, PII)

## Integration Test Patterns

### Parse Output, Don't Hardcode

- When testing CLI output, parse the output rather than hardcoding exact strings
- Use regex patterns for flexible matching
- Test for presence of expected content, not exact output format

### Test Isolation

- Each test should be independent and not rely on other tests
- Use setup/teardown to create clean test environments
- Avoid shared mutable state between tests

### Resource Cleanup

- Always clean up resources (files, connections, processes) in teardown
- Use try/finally or afterEach for guaranteed cleanup
- Consider using temp directories for file-based tests

### Asynchronous Testing

- Always await async operations in tests
- Use proper async/await syntax, not callbacks
- Set reasonable timeouts for async operations

## TypeScript-Specific Guidelines

### Type Safety

- Avoid `any` type; use `unknown` when type is truly unknown
- Use type guards to narrow types
- Prefer interfaces over type aliases for object shapes

### Strict Mode

- Enable strict mode in tsconfig.json
- Handle null and undefined explicitly
- Use optional chaining (`?.`) and nullish coalescing (`??`)

### Module Imports

- Use ES module syntax (import/export)
- Avoid require() except for configuration
- Use barrel exports (index.ts) for clean public APIs
