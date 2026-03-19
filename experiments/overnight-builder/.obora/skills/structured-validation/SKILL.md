---
name: structured-validation
description: Guide for producing consistently structured validation judgments that enable conditional routing. Use when validating test results, build outputs, or any step that produces pass/fail decisions with routing implications.
---

# Structured Validation Guide

## Validation Process

### Step 1: Read Command Status

Always read `artifacts/command-status.env` FIRST:

```bash
build_exit_code=0
typecheck_exit_code=0
lint_exit_code=0
test_exit_code=1
```

### Step 2: Read Log Files

Read each log file for details:

- `artifacts/typecheck.log` - TypeScript errors
- `artifacts/lint.log` - ESLint errors/warnings
- `artifacts/test.log` - Test failures

### Step 3: Categorize Failures

Each failure MUST be categorized as one of:

## Failure Categories

### `implementation_bug`

Code logic is incorrect.

Indicators:

- Test assertion fails due to wrong return value
- Function throws unexpected error
- Output format differs from expected
- Logic error in business rules

Example:

```json
{
  "name": "implementation_bug: task completion",
  "message": "completeTask() does not update status to 'done'"
}
```

### `test_code_bug`

Test expectation is wrong (not the implementation).

Indicators:

- Hardcoded ID that doesn't match generated ID
- Stale assertion from previous implementation
- Test relies on timing without fake timers
- Test mocks wrong module path
- Assertion contradicts the spec

Example:

```json
{
  "name": "test_code_bug: hardcoded task ID",
  "message": "Test expects ID 'abc-123' but IDs are generated UUIDs"
}
```

### `build_config_issue`

Configuration problem, not code logic.

Indicators:

- tsconfig.json missing required settings
- package.json missing dependencies
- ESLint config conflicts
- Module resolution errors

Example:

```json
{
  "name": "build_config_issue: missing dependency",
  "message": "Module 'chalk' not found - add to package.json"
}
```

### `design_issue`

Architecture/interface problem requiring design changes.

Indicators:

- Interface mismatch between modules
- Missing method in service class
- Circular dependency
- Wrong abstraction level
- API contract violation

Example:

```json
{
  "name": "design_issue: missing interface method",
  "message": "TaskRepository.update() called but not defined in interface"
}
```

## Output Format

### Required JSON Structure

```json
{
  "passed": false,
  "summary": "2 tests failed due to hardcoded IDs in test code",
  "failedChecks": [
    {
      "name": "test_code_bug: task-list.test.ts:45",
      "message": "Expected ID 'abc-123' but got generated UUID"
    },
    {
      "name": "test_code_bug: task-complete.test.ts:23",
      "message": "Stale assertion expects old status format"
    }
  ],
  "signature": "test_code_bug:2",
  "suggestedTargets": ["design_and_write_tests"]
}
```

### Signature Generation

Signature MUST be deterministic based on failure categories + counts:

Pattern: `{category}:{count},{category}:{count}`

Examples:

- `"implementation_bug:3"` - 3 implementation bugs
- `"test_code_bug:2,implementation_bug:1"` - 2 test bugs, 1 impl bug
- `"design_issue:1"` - 1 design issue
- `"pass"` - All checks passed

## Conditional Routing

The `name` field in `failedChecks` enables routing:

```yaml
on_fail:
  goto:
    - when: 'failedChecks.some(c => c.name.includes("test_code_bug"))'
      target: design_and_write_tests
    - when: 'failedChecks.some(c => c.name.includes("design_issue"))'
      target: refine_idea
    - target: implement_or_repair
```

### Routing Rules

| Category             | Target Step            | Reason                      |
| -------------------- | ---------------------- | --------------------------- |
| `test_code_bug`      | design_and_write_tests | Tests need rewriting        |
| `design_issue`       | refine_idea            | Architecture needs redesign |
| `implementation_bug` | implement_or_repair    | Fix the code                |
| `build_config_issue` | implement_or_repair    | Fix configuration           |

## Validation Checklist

Before outputting judgment:

- [ ] Read `artifacts/command-status.env` first
- [ ] Read all relevant log files
- [ ] Each failure categorized with correct prefix
- [ ] Category name included in `failedChecks[].name`
- [ ] Signature follows `{category}:{count}` format
- [ ] JSON is valid and parseable
- [ ] `suggestedTargets` includes appropriate next step

## Examples

### All Pass

```json
{
  "passed": true,
  "summary": "All checks passed: typecheck, lint, 42 tests",
  "failedChecks": [],
  "signature": "pass"
}
```

### Implementation Bugs Only

```json
{
  "passed": false,
  "summary": "3 tests failed - edge cases not handled",
  "failedChecks": [
    { "name": "implementation_bug: empty input", "message": "Throws on empty array" },
    { "name": "implementation_bug: null handling", "message": "NPE on null config" },
    { "name": "implementation_bug: boundary value", "message": "Off-by-one at MAX_VALUE" }
  ],
  "signature": "implementation_bug:3",
  "suggestedTargets": ["implement_or_repair"]
}
```

### Mixed Failures

```json
{
  "passed": false,
  "summary": "Build failed with 2 issues: 1 config, 1 design",
  "failedChecks": [
    { "name": "build_config_issue: missing dep", "message": "Add 'zod' to dependencies" },
    {
      "name": "design_issue: interface mismatch",
      "message": "Parser returns string but Processor expects object"
    }
  ],
  "signature": "build_config_issue:1,design_issue:1",
  "suggestedTargets": ["refine_idea"]
}
```
