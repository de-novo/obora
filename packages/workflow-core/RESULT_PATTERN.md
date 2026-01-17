# Result Pattern in workflow-core

The `workflow-core` package now uses the Result pattern for explicit error handling instead of try-catch blocks.

## Overview

The Result pattern makes error handling explicit and type-safe:

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

## Benefits

1. **Type-safe error handling** - Errors are tracked in the type system
2. **Explicit error flow** - No hidden exceptions
3. **Better debugging** - Error context is preserved
4. **Composable** - Easy to chain operations

## Usage

### Basic Example

```typescript
import { ok, err, type Result } from "@obora/workflow-core";

function divide(a: number, b: number): Result<number, string> {
  if (b === 0) {
    return err("Division by zero");
  }
  return ok(a / b);
}

const result = divide(10, 2);

if (result.ok) {
  console.log("Result:", result.value); // 5
} else {
  console.error("Error:", result.error);
}
```

### Custom Error Types

```typescript
import { ok, err, type Result, type JsonParseError } from "@obora/workflow-core";

// JsonParseError is exported from workflow-core
type ParseResult = Result<unknown, JsonParseError>;

function parseJson(text: string): ParseResult {
  try {
    return ok(JSON.parse(text));
  } catch (e) {
    return err({
      reason: "Invalid JSON",
      context: e instanceof Error ? e.message : undefined,
    });
  }
}

const result = parseJson('{"name": "test"}');

if (result.ok) {
  console.log("Parsed:", result.value);
} else {
  console.error("Parse failed:", result.error.reason);
  if (result.error.context) {
    console.error("Details:", result.error.context);
  }
}
```

### Chaining Operations

```typescript
function processData(input: string): Result<number, string> {
  const parseResult = parseJson(input);
  
  if (!parseResult.ok) {
    return err(`Parse failed: ${parseResult.error.reason}`);
  }

  const data = parseResult.value as { count?: number };
  
  if (typeof data.count !== "number") {
    return err("Missing count field");
  }

  return ok(data.count * 2);
}
```

## Internal Usage

The `extractJsonFromOutput` function in `engine.ts` uses Result pattern:

```typescript
// Before (null on error, no context)
const json = extractJsonFromOutput(output);
if (json) {
  // use json
}

// After (Result with error details)
const result = extractJsonFromOutput(output);
if (result.ok) {
  // use result.value
} else {
  console.error("JSON extraction failed:", result.error.reason);
  if (result.error.context) {
    console.error("Context:", result.error.context);
  }
}
```

## Migration Guide

If you're using workflow-core and encounter breaking changes:

### Before
```typescript
const json = extractJsonFromOutput(output);
if (json) {
  const validated = schema.safeParse(json);
  // ...
}
```

### After
```typescript
const result = extractJsonFromOutput(output);
if (result.ok) {
  const validated = schema.safeParse(result.value);
  // ...
} else {
  // Now you have access to error details
  console.warn("JSON extraction failed:", result.error);
}
```

## API Reference

### Types

```typescript
// Result type
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// JSON parse error
interface JsonParseError {
  reason: string;
  context?: string;
}
```

### Helpers

```typescript
// Create successful result
function ok<T>(value: T): Result<T, never>

// Create error result
function err<E>(error: E): Result<never, E>
```

## Best Practices

1. **Use specific error types** - Don't just use `string` or `Error`
2. **Include context** - Provide helpful debugging information
3. **Check result.ok first** - TypeScript will narrow the type
4. **Don't mix patterns** - Use Result consistently across your codebase
5. **Export error types** - Make them available for consumers

## Examples

See `src/__tests__/result.test.ts` for comprehensive examples.
