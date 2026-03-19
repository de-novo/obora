---
name: cycle-planning
description: Guide for scoping cycles realistically in iterative development. Use when planning which features to implement in a development cycle. Covers prioritization, scope management, and cycle budgeting.
---

# Cycle Planning Guide

## Core Principle

**One cycle = 1-2 features, done production-quality.**

Not a laundry list. Not "as much as possible." Focus on delivering complete, polished features.

## Planning Process

### Step 1: Read Previous State

Always read before planning:

1. `artifacts/cycle-log.md` - What's already done
2. `workspace/` - Current code state
3. `input/idea.md` - Full project vision
4. `input/constraints.md` - Any constraints

### Step 2: Assess Current State

- What features are complete?
- What's partially done?
- What's not started?
- What bugs/issues exist?

### Step 3: Select 1-2 Features

## Prioritization Framework

### Priority by User Value

| Priority | Criteria                       | Example             |
| -------- | ------------------------------ | ------------------- |
| P0       | Core functionality, must-have  | Create/read tasks   |
| P1       | Key feature, significant value | Update/delete tasks |
| P2       | Enhancement, nice-to-have      | Task categories     |
| P3       | Polish, marginal value         | Color output        |

### NOT by Technical Complexity

Avoid:

- "Let's do the hard stuff first"
- "Quick wins to feel productive"
- "Everything is P0"

Choose:

- What delivers most user value this cycle?
- What enables future features?
- What reduces risk?

## Feature Definition

### Clear Acceptance Criteria

Each feature must have:

```markdown
## Feature: Task Completion

### Acceptance Criteria

- [ ] User can mark task as complete via CLI
- [ ] Completed tasks show completion date
- [ ] Completed tasks excluded from default list
- [ ] Error if task already completed
- [ ] Error if task doesn't exist

### Test Count Estimate

- Unit: 8 tests
- Integration: 3 tests
- Edge: 4 tests
```

### Test Count Estimation

Helps architect plan test suite:

| Feature Type     | Unit  | Integration | Edge | Total |
| ---------------- | ----- | ----------- | ---- | ----- |
| Simple CRUD      | 4-6   | 2-3         | 2-3  | 8-12  |
| Business logic   | 8-12  | 3-5         | 4-6  | 15-23 |
| Complex workflow | 12-20 | 5-8         | 6-10 | 23-38 |

## Scope Management

### Explicit In-Scope

```markdown
## In Scope (This Cycle)

1. Task completion command
2. Completion date tracking
3. Filter by status

## Out of Scope (Future Cycles)

- Task priorities
- Due dates
- Task categories
- Batch operations
```

### Scope Creep Prevention

Watch for and reject:

- "While we're here, let's also..."
- "It's just a small change..."
- "Might as well add..."

Ask:

- Does this support the 1-2 selected features?
- Can it wait for next cycle?
- Does it increase risk?

## Repair Loop Budget

### Complexity = More Repair Attempts

| Feature Complexity | Expected Repair Loops |
| ------------------ | --------------------- |
| Simple             | 0-2                   |
| Moderate           | 2-4                   |
| Complex            | 4-6                   |

### Budget Accordingly

If selecting a complex feature:

- Consider it as 2 features
- Allow more repair iterations
- Plan for partial completion

### Warning Signs

Reduce scope if:

- Feature requires new dependencies
- Multiple modules affected
- Unclear acceptance criteria
- No similar code exists

## Cycle Output

### artifacts/01-refined-idea.md Template

```markdown
# Refined Idea - Cycle N

## Project Overview

[One paragraph describing the project]

## This Cycle's Features

### Feature 1: [Name]

- **Description**: What it does
- **Acceptance Criteria**:
  - [ ] Criterion 1
  - [ ] Criterion 2
- **Test Estimate**: X unit, Y integration, Z edge
- **Complexity**: Simple/Moderate/Complex

### Feature 2: [Name] (if applicable)

[Same structure]

## Production Quality Standards

- Error handling: All edge cases handled
- Input validation: All public APIs validated
- Documentation: README + JSDoc complete
- Testing: Coverage as estimated above

## Completion Criteria

- All acceptance criteria met
- All tests passing
- No lint errors
- Documentation complete

## Out of Scope

- [List what's explicitly not included]

## Project Progress

- Cycle 1: Core CRUD (DONE)
- Cycle 2: Status management (THIS CYCLE)
- Cycle 3: Priorities (PLANNED)
- Cycle 4: Categories (PLANNED)

**Overall Progress**: ~40%
```

## Planning Checklist

Before finalizing cycle plan:

- [ ] Read `artifacts/cycle-log.md` for previous work
- [ ] Selected exactly 1-2 features (not more)
- [ ] Each feature has clear acceptance criteria
- [ ] Test counts estimated per feature
- [ ] Explicit "Out of Scope" section exists
- [ ] Considered repair loop budget
- [ ] No scope creep from original idea
- [ ] Progress estimate is realistic

## Anti-Patterns to Avoid

### The Kitchen Sink

"Let's do CRUD + search + export + import in one cycle"
→ FAIL: Guaranteed incomplete or low quality

### The Technical Debt Trap

"Let's refactor everything before adding features"
→ FAIL: No user value delivered

### The Gold Plating

"The feature works, but let's add caching, logging, metrics..."
→ FAIL: Diminishing returns, delays delivery

### The Underestimation

"This complex feature is probably simple"
→ FAIL: Exceeds repair budget, blocks progress
