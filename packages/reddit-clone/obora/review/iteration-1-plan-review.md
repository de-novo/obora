# Iteration 1 Plan Review — Interactive Core

**Date:** 2026-03-08
**Package:** @obora/reddit-clone
**Reviewer:** Technical Reviewer
**Reviewed Artifacts:**
- `obora/implementation/backlog.md`
- `obora/product-direction/iteration-1-interactive-core.md`
- Existing source: `src/App.tsx`, `src/styles.css`

---

## Executive Summary

The implementation backlog is well-structured, realistically scoped, and directly aligned with the Iteration 1 PRD. The task ordering, commit boundaries, and testing checklist are all execution-ready.

**Recommendation:** Proceed with implementation starting with Task 1 (Vote Button Component & State Foundation), with one minor scope adjustment.

---

## What Is Strong

### 1. Task Ordering is Logical
- **Task 1 (P0)** correctly identifies vote state as the foundation for all interaction features
- **Task 2 and Task 3 (P1)** are properly positioned as parallel work streams once votes are stable
- **Task 4 and Task 5 (P2)** layer polish and refinement on top of working core features

### 2. State Management Pattern is Solid
```typescript
const [userPostVotes, setUserPostVotes] = useState<Map<string, 1 | -1>>(new Map());
```
- O(1) lookup via Map is appropriate for session-only state
- Clear vote direction semantics (`1 | -1`) make logic easy to follow
- Functional state updates (`prev => new Map(prev)`) prevent race conditions

### 3. Commit Boundaries are Atomic and Testable
Each commit has:
- A clear, single-responsibility message
- Explicit testable outcomes listed
- Coherent file changes (no mixing unrelated features)

### 4. Testing Checklist is Comprehensive
- Covers happy paths, edge cases, and integration scenarios
- Includes accessibility checks (keyboard navigation, focus management)
- Explicitly calls out state consistency across interactions

### 5. Risk Table is Pragmatic
- High-priority risks have concrete mitigations
- Low-priority risks are explicitly documented as "acceptable for Iteration 1"
- No attempt to boil the ocean—deferred features are clearly listed

### 6. Code Patterns are Consistent with Existing Codebase
- TypeScript types are defined in-file (matches `App.tsx` pattern)
- CSS naming follows existing `kebab-case` convention
- No external dependencies introduced

---

## What Is Over-Scoped

The backlog is **not over-scoped**. The feature set is appropriately narrow for a 10-14 hour implementation window:

| Feature | Estimated Effort | Assessment |
|---------|------------------|------------|
| Vote state foundation | 2-3h | Realistic |
| Comment composer | 2-3h | Realistic |
| Create post modal | 3-4h | Realistic |
| Comment card refinement | 1-2h | Realistic |
| Polish & edge cases | 2h | Realistic |

**Total: 10-14 hours** — appropriate for validating interaction patterns before investing in routing, persistence, or more complex social features.

---

## What Should Be Simplified

### 1. Remove "Component Extraction" from PRD Scope (Minor)

The PRD lists **"Component Extraction (Optional but Recommended)"** as a sub-task:
- Extract `<PostCard>` from feed map
- Extract `<CommentCard>` from thread map
- Extract `<VoteButton>` for reuse
- Extract `<CreatePostModal>` for isolation

**Issue:** This introduces refactoring risk alongside feature work. The existing `App.tsx` is already large (400+ lines), and component extraction should be a **separate refactoring step** done after core interactions are stable, not interleaved with feature implementation.

**Recommendation:** 
- Move component extraction to a **pre-iteration 2 refactoring task**
- Keep all new components in `App.tsx` for this iteration (maintain existing pattern)
- This reduces the risk of breaking state management while adding features

---

## Maintainability Risks

### Risk: `App.tsx` Will Grow Substantially
- Current size: ~400 lines
- After implementation: ~400 + 120 + 80 + 150 + 30 + 40 = **~820 lines**
- This approaches the practical limit for single-file components

**Mitigation:** The backlog correctly defers routing and persistence to Iteration 2, which is when component extraction should happen. The temporary growth is acceptable for validating interaction patterns quickly.

### Risk: No State Validation Layer
- Vote state relies on manual consistency between `userPostVotes`, `userCommentVotes`, and base vote counts
- No runtime validation to ensure derived counts are correct

**Mitigation:** The testing checklist includes "Integration tests" that verify state consistency across interactions. This is sufficient for session-only state. A more robust solution (e.g., deriving vote counts from a single source of truth) can be added in Iteration 2 if issues arise.

---

## UX Risks

### Risk: Comment Composer May Be Hard to Discover
- The composer is described as appearing at the "bottom of comments panel"
- If the comment thread is long, the composer may be off-screen

**Mitigation (already in backlog):**
- Auto-focus composer when post is selected (scrolls composer into view)
- This is a good interim solution; consider sticky composer in Iteration 2

### Risk: Vote State Resets on Refresh
- Session-only state means votes disappear on page refresh
- This may confuse users expecting persistence

**Mitigation (already in backlog):**
- Explicitly documented as "acceptable for Iteration 1"
- No action needed; this is expected behavior for a prototype

---

## Final Recommendation

### Approved for Execution

Proceed with implementation of the backlog as written, with **one scope adjustment**:

| Change | Rationale |
|--------|-----------|
| **Defer component extraction to pre-Iteration 2** | Reduces refactoring risk during feature development; keep new components in `App.tsx` for consistency with existing pattern |

### Execution Order

1. **Task 1: Vote Button Component & State Foundation** (2-3h)
   - Create `VoteButton` component
   - Add vote state Maps to `App.tsx`
   - Implement toggle handlers
   - Wire into PostCard display

2. **Task 2: Comment Composer UI & Validation** (2-3h)
   - Create `CommentComposer` component
   - Add draft state and submit handler
   - Wire into comments panel
   - Add validation and character count

3. **Task 3: Create Post Modal** (3-4h)
   - Create `CreatePostModal` component
   - Add form state and validation
   - Wire modal trigger in topbar
   - Implement submission handler

4. **Task 4: Comment Card Refinement with Votes** (1-2h)
   - Refine `CommentCard` to use `VoteButton`
   - Add author flair styling
   - Ensure vote state sync

5. **Task 5: Polish & Edge Case Handling** (2h)
   - Add loading/empty states
   - Add modal animations
   - Verify keyboard accessibility
   - Test responsive behavior

### Success Criteria for Proceeding to Next Step

- [ ] All P0 and P1 tasks (Tasks 1-3) are complete and tested
- [ ] Vote interactions work without errors across posts and comments
- [ ] Comment submission appends to thread and updates post comment count
- [ ] Create post modal validates and prepends to feed
- [ ] No regression in existing features (sort modes, community filter, selection state)

### Next Step After This Review

**Proceed to implementation** with the adjusted scope. No additional planning artifacts are required—the backlog is execution-ready.
