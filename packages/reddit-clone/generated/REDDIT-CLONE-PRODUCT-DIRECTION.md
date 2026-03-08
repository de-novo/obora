I've created the product direction for Iteration 1: Interactive Core.

**Deliverables:**

1. **`obora/product-direction/iteration-1-interactive-core.md`** — Full PRD with:
   - **Goal**: Transform read-only prototype into functionally interactive demo
   - **Target user behavior**: Clear scenarios for voting, commenting, and post creation
   - **Scope**: Explicit in-scope (vote state, add comment, create post modal) and out-of-scope (routing, auth, nested replies)
   - **MVP feature list**: 4 feature groups with 23 concrete checklist items
   - **Acceptance criteria**: 25+ testable criteria across all features

2. **`obora/product-direction/README.md`** — Index document with iteration overview and project principles

**Key Decisions:**

| Decision | Rationale |
|----------|-----------|
| Vote state via `Map<string, 1 | -1>` | O(1) lookup, simple toggle logic, no library overhead |
| Top-level comments only | Reduces complexity; nested replies deferred |
| Session-only persistence | Validates interaction state before adding localStorage/backend |
| No routing in this iteration | Keeps architectural changes minimal; focus on state management |
| Component extraction optional | Recommended but not required; keeps iteration flexible |

**Success Metrics:** 100% of vote/comment/post interactions work correctly with immediate visual feedback and no regressions to existing features.

The PRD is implementation-ready and provides clear boundaries for the next build step.
