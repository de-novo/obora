---
name: production-review
description: Guide for thorough production readiness review. Use when reviewing completed features for production deployment. Covers build verification, code quality, test coverage, documentation, and operational readiness.
---

# Production Review Guide

## Review Process

### Step 1: Read Artifacts

Read these files in order:

1. `artifacts/command-status.env` - Exit codes for all commands
2. `artifacts/04-test-report.md` - Validation results
3. `artifacts/typecheck.log`, `artifacts/lint.log`, `artifacts/test.log` - Detailed logs
4. `artifacts/01-refined-idea.md` - Feature requirements
5. `artifacts/02-system-design.md` - Architecture decisions
6. `artifacts/03-implementation-notes.md` - Implementation details

### Step 2: Review Checklist

## Build Verification

### Required Checks

- [ ] `build_exit_code = 0` in command-status.env
- [ ] `typecheck_exit_code = 0` - No TypeScript errors
- [ ] `lint_exit_code = 0` - No ESLint errors (warnings OK)
- [ ] `test_exit_code = 0` - All tests pass

### Failure = Automatic FAIL

If any required check fails, the review FAILS immediately.

## Code Quality Review

### Separation of Concerns

- [ ] Each module has single responsibility
- [ ] No god classes or functions > 50 lines
- [ ] Clear layering (CLI → Service → Repository)
- [ ] No circular dependencies

### Error Handling

- [ ] All external calls wrapped in try/catch
- [ ] Errors include actionable messages
- [ ] No swallowed errors (empty catch blocks)
- [ ] Proper error types (not just strings)

### Input Validation

- [ ] All public functions validate inputs
- [ ] Type guards for runtime checks
- [ ] Early validation at boundaries
- [ ] Clear error messages for invalid input

### Code Standards

- [ ] No magic numbers - use named constants
- [ ] No hardcoded IDs or paths
- [ ] Consistent naming conventions
- [ ] No `console.log` in production code

## Test Quality Review

### Coverage Breadth

- [ ] Unit tests for all public methods
- [ ] Integration tests for key workflows
- [ ] Edge cases covered (empty, boundary, unicode)

### Mock Patterns

- [ ] Mocks at interface boundaries only
- [ ] No mocking internal implementation
- [ ] Proper cleanup in afterEach

### Test Quality

- [ ] Test names describe behavior
- [ ] No hardcoded IDs in assertions
- [ ] Fake timers for time-dependent tests
- [ ] All async properly awaited

### Expected Distribution

- Unit: ~60% of tests
- Integration: ~25% of tests
- Edge cases: ~15% of tests

## Documentation Review

### README Completeness

- [ ] Installation instructions
- [ ] Usage examples with CLI commands
- [ ] Configuration options documented
- [ ] Error messages explained

### Inline Documentation

- [ ] All public APIs have JSDoc
- [ ] Complex logic has inline comments
- [ ] No commented-out code

### API Documentation

- [ ] All exported functions documented
- [ ] Parameter types and return types specified
- [ ] Error conditions documented

## Operational Readiness

### No Hardcoding

- [ ] No hardcoded file paths
- [ ] No hardcoded URLs or hostnames
- [ ] No hardcoded timeouts
- [ ] Configuration via environment or config file

### Configurability

- [ ] All settings configurable
- [ ] Sensible defaults provided
- [ ] Config validated at startup

### Exit Codes

- [ ] Success exits with 0
- [ ] Errors exit with non-zero codes
- [ ] Different error types have distinct codes

### Logging

- [ ] Appropriate log levels (debug, info, warn, error)
- [ ] No sensitive data logged
- [ ] Logs include context for debugging

## Scoring Criteria

### PASS Threshold

All must be true:

- Build, typecheck, lint, test all pass
- Code quality: No critical issues
- Test quality: Coverage meets expectations
- Documentation: README complete
- Operations: No hardcoding

### FAIL with Return to refine_idea

When:

- Feature scope was wrong
- Architecture fundamentally flawed
- Missing core requirements

### FAIL with Return to implement_or_repair

When:

- Implementation bugs exist
- Test coverage insufficient
- Minor code quality issues
- Documentation incomplete

## Review Output

### Artifacts to Create

1. `artifacts/05-review-notes.md`:

```markdown
## Review Summary

### Build Status

- Build: PASS
- Typecheck: PASS
- Lint: PASS (2 warnings)
- Tests: PASS (42 tests)

### Code Quality

- Separation of concerns: GOOD
- Error handling: GOOD
- Input validation: NEEDS IMPROVEMENT (missing validation in updateTask)

### Test Quality

- Unit tests: 25 (GOOD)
- Integration tests: 8 (GOOD)
- Edge cases: 5 (GOOD)

### Documentation

- README: COMPLETE
- Inline docs: GOOD

### Operational

- Hardcoding: NONE
- Configurability: GOOD
- Exit codes: CORRECT

### Issues Found

1. [MEDIUM] Missing input validation in updateTask
2. [LOW] 2 ESLint warnings (unused vars)

### Recommendation

PASS with minor fixes
```

2. Update `artifacts/cycle-log.md` with cycle results

### Final JSON Response

```json
{
  "passed": true,
  "summary": "All checks passed. Minor improvements recommended.",
  "failedChecks": [],
  "signature": "pass"
}
```

Or for failure:

```json
{
  "passed": false,
  "summary": "Test coverage insufficient for edge cases",
  "failedChecks": [
    {
      "name": "test_coverage: edge cases",
      "message": "Missing tests for empty input, concurrent access"
    }
  ],
  "signature": "test_coverage:1"
}
```
