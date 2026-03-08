# Reddit Clone — Final Plan Summary

---

## Recommended Next Implementation Target

**Interactive Core (Iteration 1)** — Complete vote interaction state, comment composition flow, and post creation modal. This establishes the fundamental engagement layer on top of the existing feed rail architecture.

---

## Why This Sequence Is Correct

| Priority | Feature | Rationale |
|----------|---------|-----------|
| **P0** | Vote state | Foundation for all engagement metrics; enables users to signal agreement before contributing content |
| **P1** | Comment composer | Extends engagement from passive (vote) to active (reply); validates vote state persistence in context |
| **P1** | Create post modal | Completes the content loop; relies on vote state being stable to show post scores immediately |
| **P2** | Route-level detail pages | Deferred—existing selected-post state already provides sufficient UX for prototype validation |
| **P2** | Per-community transitions | Deferred—community filter exists in rail; routing overhead not required yet |

The progression follows **signal → participate → contribute** — the natural user journey. Each layer builds on the previous one without requiring routing or data fetching infrastructure beyond the current session state.

---

## Immediate Next Action List

### Task 1: Vote Button Component & State Foundation (2–3h)
- [ ] Create `voteState: Map<string, number>` in `App.tsx` (stores post/comment ID → -1/0/+1)
- [ ] Implement `<VoteButton>` component with up/down arrows and vote count display
- [ ] Wire toggle handler: -1 → 0 → +1 → 0 cycle, update `voteState` map
- [ ] Display computed score (`original + voteState.get(id)`) on all posts and comments
- [ ] Add CSS classes for active/neutral states (accent color tint for active vote)
- [ ] Test: Toggle votes on multiple posts/comments, verify independence

### Task 2: Comment Composer UI & Validation (2–3h)
- [ ] Create `<CommentComposer>` component with textarea and submit button
- [ ] Add validation: non-empty content, max length (e.g., 10,000 chars)
- [ ] On submit: create new comment object with auto-generated ID, prepend to selected post's `commentsThread`
- [ ] Increment post's `comments` count in feed
- [ ] Auto-focus composer when post selected; clear after submit
- [ ] Test: Submit comment, verify thread update, comment count increment, sort mode stability

### Task 3: Create Post Modal (3–4h)
- [ ] Create `<CreatePostModal>` component with fields: title, body, community select, optional tags
- [ ] Validation: required fields, title length, body length, community must exist
- [ ] On submit: create new post object with auto-generated ID, accent from community, default stats
- [ ] Prepend to `posts` array, reset sort mode to "New" to make new post visible
- [ ] Add modal open/close state in `App.tsx` with backdrop click to close
- [ ] Test: Create post, verify appearance in feed, correct community accent, sort order

### Task 4: Comment Card Refinement with Votes (1–2h)
- [ ] Add `<VoteButton>` to each comment in thread
- [ ] Display comment scores using same `formatVotes` utility as posts
- [ ] Ensure vote state persists when switching between posts
- [ ] Test: Vote on comments across multiple posts, verify score display and state isolation

### Task 5: Polish & Edge Case Handling (2h)
- [ ] Add loading/disabled states during form submission
- [ ] Handle empty thread state (show "No comments yet" message)
- [ ] Verify responsive behavior: composer and modal on mobile
- [ ] Add subtle animations for vote toggles and new comments/posts
- [ ] Regression test: sort modes, community filter, selection state unchanged

---

## Success Criteria

- [ ] Vote interactions work without errors across all posts and comments
- [ ] Comment submission appends to thread and updates post comment count immediately
- [ ] Create post modal validates input, creates post, and inserts into feed with correct community accent
- [ ] No regression in existing features (sort modes, community filter, selection state)
- [ ] All P0 and P1 tasks complete per testing checklist
- [ ] `App.tsx` grows acceptably (~820 lines) with consistent patterns; no breaking changes

---

## Adjusted Scope Notes

- **Deferred:** Component extraction to separate files (`PostCard.tsx`, `CommentCard.tsx`, `VoteButton.tsx`, `CreatePostModal.tsx`) — move to pre-Iteration 2 refactoring to avoid interleave risk
- **Deferred:** Route-level post detail pages — existing selected-post state provides sufficient UX for prototype validation
- **Deferred:** Per-community page transitions — community rail filter already meets requirements

The backlog is execution-ready. Proceed with Task 1.
