# Implementation Backlog: reddit-clone

**Iteration**: 1 - Interactive Core
**Package**: @obora/reddit-clone
**Status**: Ready to Execute
**Last Updated**: 2026-03-08

---

## Overview

This backlog breaks down the implementation of voting interactions, comment composition, and post creation into discrete, testable commits. All work builds on the existing single-page state-driven architecture.

---

## Ordered Tasks

### Task 1: Vote Button Component & State Foundation
**Priority**: P0 (Blocking for other features)
**Estimated Effort**: 2-3 hours

**Subtasks**:
- [ ] Create `VoteButton` component with upvote/downvote/toggle logic
- [ ] Add `userPostVotes` and `userCommentVotes` state to App.tsx
- [ ] Implement vote toggle handlers with Map-based O(1) lookup
- [ ] Wire vote buttons into PostCard display
- [ ] Add vote-specific CSS states (active, inactive, hover)

**Implementation Notes**:
- Vote state: `Map<string, 1 | -1>` where key is post/comment ID
- Vote direction: 1 = upvote, -1 = downvote
- Visual feedback: color shift on voted state, number updates
- No persistence in this iteration (session-only)

**Dependencies**: None
**File Changes**:
- `src/App.tsx` (+120 lines)
- `src/styles.css` (+35 lines)

---

### Task 2: Comment Composer UI & Validation
**Priority**: P1
**Estimated Effort**: 2-3 hours

**Subtasks**:
- [ ] Create `CommentComposer` component
- [ ] Add `newCommentDraft` state to App.tsx
- [ ] Implement comment submit handler with validation
- [ ] Wire comment composer into right-side comments panel
- [ ] Add composer-specific CSS (textarea, submit button, error states)

**Implementation Notes**:
- Validation: non-empty comment body, max length check
- On submit: append to local comments array, clear draft
- Auto-focus composer when post is selected
- Show character count near limit

**Dependencies**: Task 1 (for comment vote buttons in same panel)
**File Changes**:
- `src/App.tsx` (+80 lines)
- `src/styles.css` (+40 lines)

---

### Task 3: Create Post Modal
**Priority**: P1
**Estimated Effort**: 3-4 hours

**Subtasks**:
- [ ] Create `CreatePostModal` component
- [ ] Add `isCreatePostModalOpen`, `postForm`, `postFormErrors` state
- [ ] Implement form validation (title, body, community)
- [ ] Implement post submission handler
- [ ] Wire modal trigger in topbar
- [ ] Add modal-specific CSS (backdrop, form, validation messages)

**Implementation Notes**:
- Form fields: title (required), body (required), community (required from dropdown)
- Validation: title 5-300 chars, body 10-4000 chars
- On submit: prepend to posts array with generated ID, close modal
- Community dropdown: populate from existing communities array
- Generate unique IDs using timestamp + random suffix

**Dependencies**: None (parallel with Task 2)
**File Changes**:
- `src/App.tsx` (+150 lines)
- `src/styles.css` (+45 lines)

---

### Task 4: Comment Card Refinement with Votes
**Priority**: P2
**Estimated Effort**: 1-2 hours

**Subtasks**:
- [ ] Refine `CommentCard` component to use VoteButton
- [ ] Ensure comment vote state syncs with global state
- [ ] Add author flair display styling
- [ ] Add reply toggle placeholder (UI only, no nested replies this iteration)
- [ ] Polish comment card spacing and typography

**Implementation Notes**:
- Reuse VoteButton component for consistency
- Comment votes display in left side of card
- Author flair displayed as pill next to username if present

**Dependencies**: Task 1, Task 2
**File Changes**:
- `src/App.tsx` (+30 lines)
- `src/styles.css` (+15 lines)

---

### Task 5: Polish & Edge Case Handling
**Priority**: P2
**Estimated Effort**: 2 hours

**Subtasks**:
- [ ] Add loading states for vote interactions (optional visual feedback)
- [ ] Add empty state for comments panel when no post selected
- [ ] Add empty state for feed when no posts (edge case)
- [ ] Ensure keyboard accessibility for all interactive elements
- [ ] Add transition animations for modal open/close
- [ ] Verify responsive behavior on mobile widths

**Implementation Notes**:
- Focus states for all buttons and inputs
- Modal animation: scale + fade in/out
- Empty states: friendly copy + icon

**Dependencies**: Tasks 1-4
**File Changes**:
- `src/App.tsx` (+40 lines)
- `src/styles.css` (+25 lines)

---

## Suggested Commit Boundaries

### Commit 1: `feat: add vote button component and state foundation`
- VoteButton component
- userPostVotes and userCommentVotes state
- Vote toggle handlers
- Vote button CSS states
- Integration with PostCard
- **Testable**: Click upvote/downvote, see state change and color update

### Commit 2: `feat: add comment composer with validation`
- CommentComposer component
- newCommentDraft state
- Comment submit handler with validation
- Composer CSS styles
- Integration with comments panel
- **Testable**: Type comment, validate, submit, see new comment appear

### Commit 3: `feat: add create post modal with form validation`
- CreatePostModal component
- Modal and form state
- Post submission handler
- Modal CSS styles
- Integration with topbar trigger
- **Testable**: Open modal, fill form, validate, submit, see new post in feed

### Commit 4: `refactor: refine comment cards with vote integration`
- CommentCard improvements using VoteButton
- Author flair styling
- Vote state sync for comments
- **Testable**: Vote on comments, see consistent state across UI

### Commit 5: `polish: add loading states, empty states, and animations`
- Loading state feedback
- Empty states for panels and feed
- Modal animations
- Accessibility improvements
- Responsive polish
- **Testable**: Navigate empty states, use keyboard navigation, check mobile layout

---

## Testing Checklist

### Vote Interaction Tests
- [ ] Upvoting a post increments vote count and shows upvote active state
- [ ] Downvoting a post decrements vote count and shows downvote active state
- [ ] Clicking same vote button again removes vote (toggle off)
- [ ] Clicking opposite vote button switches direction (up → down or down → up)
- [ ] Vote state persists while viewing different posts
- [ ] Vote buttons work on comments in the same way
- [ ] Vote counts update numerically in real-time
- [ ] Hover states work correctly before clicking

### Comment Composer Tests
- [ ] Composer appears at bottom of comments panel when post is selected
- [ ] Composer auto-focuses when post is selected
- [ ] Submit button is disabled when comment body is empty
- [ ] Submit is disabled when comment exceeds max length
- [ ] Character count displays correctly
- [ ] Submitting valid comment adds it to comments thread
- [ ] New comment appears with correct author ("u/you") and timestamp ("just now")
- [ ] Form clears after successful submission
- [ ] Validation error message appears when trying to submit invalid comment
- [ ] Comment composer is not visible when no post is selected

### Create Post Modal Tests
- [ ] Modal opens when clicking "Create Post" button in topbar
- [ ] Modal has backdrop overlay that blocks interaction with main content
- [ ] Modal closes when clicking backdrop or "Cancel" button
- [ ] Community dropdown shows all available communities
- [ ] Title field has min/max length validation
- [ ] Body field has min/max length validation
- [ ] Submit button is disabled when form is invalid
- [ ] Submitting valid form creates new post with generated ID
- [ ] New post appears at top of feed (prepend)
- [ ] New post has correct accent color from selected community
- [ ] New post has default votes (0), comments (0), awards (0)
- [ ] Modal closes and form resets after successful submission
- [ ] Validation errors display inline for each field

### Edge Case Tests
- [ ] Empty comments panel shows helpful message when no post selected
- [ ] Empty feed shows helpful message (if all posts removed)
- [ ] Rapid clicking on vote buttons doesn't cause state corruption
- [ ] All buttons are keyboard accessible (Tab focus, Enter/Space activation)
- [ ] Modal can be closed with Escape key
- [ ] Form inputs maintain focus during validation errors
- [ ] Layout remains usable on tablet width (768px)
- [ ] Layout remains usable on mobile width (375px)
- [ ] Comments panel collapses or hides on small screens

### Integration Tests
- [ ] Vote state and counts remain consistent across page interactions
- [ ] Multiple users can vote on same post (simulated via session state)
- [ ] Comments appear immediately after submission without page reload
- [ ] New posts appear immediately after submission without page reload
- [ ] Sort mode (Hot/New/Rising) works with user-generated posts
- [ ] Selecting different posts updates comments panel correctly
- [ ] Vote state resets correctly when switching between posts

---

## UI Risks and Edge Cases

### High Priority Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Vote state desync** | Users see inconsistent vote counts across UI | Use single source of truth (Map), derive counts from state + base votes |
| **Modal backdrop z-index** | Modal may appear behind other elements | Set explicit z-index hierarchy: ambient (0) → content (1) → modal (100) |
| **Form validation timing** | Users may submit invalid data during state updates | Validate on every input change, disable submit button during async operations |
| **Memory leaks in Map** | Infinite app session grows unbounded | Not a concern for session-only use; persistence layer will handle cleanup later |
| **Rapid clicks on vote button** | Multiple state updates may conflict | Debounce or use functional state updates to prevent race conditions |

### Medium Priority Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Mobile layout overflow** | Comments panel may push content off-screen | Use flex/grid with proper min/max constraints, hide panel on <768px |
| **Long comment truncation** | Very long comments may break layout | Add CSS max-height with scroll or truncate with "show more" |
| **Community color contrast** | Some accent colors may have poor contrast with text | Verify text color against community accent; use fallback colors if needed |
| **Empty state discoverability** | Users may not know what to do when feed is empty | Provide clear call-to-action and visual hierarchy in empty state |
| **Keyboard navigation flow** | Focus may get trapped in modal | Implement proper focus management: trap in modal, restore focus on close |

### Low Priority Risks (Acceptable for Iteration 1)

| Risk | Impact | Mitigation |
|------|--------|------------|
| **No reply nesting** | Can't reply to comments in thread | Accepted limitation; defer to Iteration 2 |
| **No post editing** | Can't correct typos in created posts | Accepted limitation; defer to Iteration 2 |
| **No image uploads** | Text-only posts only | Accepted limitation; defer to Iteration 2 |
| **No user profiles** | All posts show "u/you" | Accepted limitation; defer to Iteration 2 |
| **No vote persistence** | Votes reset on page refresh | Accepted limitation; session-only for validation |

### Known Edge Cases

1. **Concurrent post creation**: Multiple rapid submissions should each generate unique IDs
2. **Special characters in posts**: Unicode and emoji should render correctly
3. **Very long titles**: Should truncate gracefully in card preview
4. **Community selection**: What happens if communities array is empty? → Disable submit
5. **Comment on newly created post**: Comments should work on user-created posts immediately
6. **Vote count overflow**: Extremely high vote counts should use formatVotes function (e.g., 10k)
7. **Zero-width posts**: Edge case if all post fields are empty but valid → show minimal card
8. **Deleted post selection**: If selected post is somehow removed → clear selection state

---

## Implementation Notes

### File Structure
All implementation will be within existing files:
- `src/App.tsx` - Main component with state and logic
- `src/styles.css` - All styles

### Code Conventions
- Use TypeScript for all new code (types defined in-file)
- Follow existing naming conventions (kebab-case for CSS classes)
- Use functional component hooks only (useState, useMemo, useCallback)
- No external dependencies beyond existing React setup

### State Management Pattern
```typescript
// Vote state pattern
const [userPostVotes, setUserPostVotes] = useState<Map<string, 1 | -1>>(new Map());

const handlePostVote = (postId: string, direction: 1 | -1) => {
  setUserPostVotes(prev => {
    const next = new Map(prev);
    const current = next.get(postId);
    if (current === direction) {
      next.delete(postId); // Toggle off
    } else {
      next.set(postId, direction); // Toggle on or switch
    }
    return next;
  });
};
```

### Validation Pattern
```typescript
// Form validation pattern
const validatePostForm = (form: PostForm): PostFormErrors => {
  const errors: PostFormErrors = {};
  
  if (form.title.length < 5) errors.title = "Title must be at least 5 characters";
  if (form.title.length > 300) errors.title = "Title must be under 300 characters";
  if (form.body.length < 10) errors.body = "Body must be at least 10 characters";
  if (form.body.length > 4000) errors.body = "Body must be under 4000 characters";
  if (!form.community) errors.community = "Please select a community";
  
  return errors;
};
```

---

## Next Steps

1. **Begin Task 1**: Create VoteButton component and state foundation
2. **Run tests**: Verify each commit against testing checklist
3. **Iterate**: Address any blocking issues discovered during implementation
4. **Final review**: Ensure all P0 and P1 tasks complete before Polish phase

---

## Deferred to Iteration 2

- Route-level post detail pages (currently state-driven single-page)
- Nested comment replies
- Post editing and deletion
- Image/media uploads
- User profiles and authentication
- Vote persistence (localStorage or backend)
- Real-time updates
- Infinite scroll pagination
