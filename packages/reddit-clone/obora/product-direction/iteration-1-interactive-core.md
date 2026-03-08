# @obora/reddit-clone — Iteration 1: Interactive Core PRD

**Date:** 2026-03-08
**Package:** @obora/reddit-clone v0.1.0
**Iteration:** 1 — Interactive Core
**Status:** Draft

---

## Goal

Transform the read-only prototype into a functionally interactive demo by adding vote state, comment creation, and post publishing capabilities. The objective is to validate that the existing UI foundation can support dynamic content and user interactions without major architectural changes.

**Primary Success Metric:** Users can perform all core social actions (vote, comment, post) with immediate visual feedback and state consistency.

---

## Target User Behavior

1. **Vote Engagement**
   - User sees a post in the feed and clicks the upvote arrow
   - Vote count increments immediately, upvote arrow becomes highlighted
   - User clicks again to toggle off; count decrements, arrow returns to neutral
   - Same behavior applies to downvote and comment votes

2. **Comment Contribution**
   - User clicks on a post to view its comment thread in the right rail
   - User types a comment in the input field at the bottom of the thread
   - User submits; new comment appears at the top of the thread immediately
   - Post card comment count increments to reflect the new comment

3. **Content Creation**
   - User clicks "Create post" button in the topbar
   - Modal overlay appears with community dropdown, title input, and body textarea
   - User fills fields and submits
   - Modal closes, new post appears at the top of the current feed view
   - Post is selectable and immediately interactive (voting, commenting)

---

## Scope

### In Scope

| Feature | Description |
|---------|-------------|
| **Vote interaction state** | Track upvote/downvote state per post and comment; toggle on/off; update counts with visual feedback |
| **Add comment flow** | Single-line comment input below comment thread; append to thread; update post comment count |
| **Create post modal** | Overlay modal with community selector, title, and body fields; prepend to feed on submit |
| **Vote persistence (session)** | Vote state maintained in React state during session (no backend) |
| **Form validation** | Basic validation (non-empty title/body) before submission |
| **Visual feedback** | Active vote button states, modal transitions, input focus states |

### Out of Scope (Explicitly Deferred)

| Feature | Reason |
|---------|--------|
| **Route-level navigation** | No `/post/:id` or `/r/:community` routes; continue with state-driven views |
| **Authentication** | No login/logout; continue with hardcoded `u/` usernames |
| **Nested comment replies** | Top-level comments only; no reply-to-reply UI |
| **Post/comment editing** | No edit or delete functionality |
| **Search functionality** | Search input remains decorative |
| **Post persistence** | All state is in-memory; refresh resets interactions |
| **Media uploads** | Text-only posts; no image/video support |
| **User profiles** | No profile pages or user switching |
| **Share/Save actions** | Buttons remain decorative |

---

## MVP Feature List

### 1. Vote Interaction
- [ ] Add `userPostVotes: Map<string, 1 | -1>` state
- [ ] Add `userCommentVotes: Map<string, 1 | -1>` state
- [ ] Implement `handlePostVote(postId, direction)` toggle logic
- [ ] Implement `handleCommentVote(commentId, direction)` toggle logic
- [ ] Update vote counts on UI with `formatVotes()` helper
- [ ] Apply active state styling to voted buttons
- [ ] Support undo (clicking same vote again removes it)

### 2. Add Comment Flow
- [ ] Add `newCommentDraft: string` state
- [ ] Add comment input component at bottom of comments panel
- [ ] Implement `handleAddComment()` function
- [ ] Append new comment to `selectedPost.commentsThread`
- [ ] Update `comments` count on post card when comment added
- [ ] Auto-focus input when post selected
- [ ] Clear input on successful submission

### 3. Create Post Modal
- [ ] Add `isCreatePostModalOpen: boolean` state
- [ ] Create `<CreatePostModal>` component with overlay
- [ ] Add post form fields:
  - [ ] Community dropdown (select from `communities` array)
  - [ ] Title input (required, max length validation)
  - [ ] Body textarea (optional, max length validation)
- [ ] Implement `handleCreatePost()` function
- [ ] Generate unique post ID and default metadata
- [ ] Prepend new post to `posts` array
- [ ] Reset form and close modal on submit
- [ ] Close modal on backdrop click or ESC key

### 4. Component Extraction (Optional but Recommended)
- [ ] Extract `<PostCard>` from feed map
- [ ] Extract `<CommentCard>` from thread map
- [ ] Extract `<VoteButton>` for reuse
- [ ] Extract `<CreatePostModal>` for isolation

---

## Acceptance Criteria

### Vote Interaction
- [ ] Clicking upvote on a post increments its vote count by 1
- [ ] Clicking upvote again removes the vote (count returns to original)
- [ ] Clicking downvote after upvote switches the vote (net change: -2)
- [ ] Downvote behavior mirrors upvote logic
- [ ] Vote state persists while navigating between posts (session scope)
- [ ] Visual feedback: voted buttons show distinct color (green for up, red for down)
- [ ] Comment votes follow identical behavior

### Add Comment Flow
- [ ] Comment input appears below comment thread when post is selected
- [ ] Typing in input updates draft state
- [ ] Submitting empty input shows validation error
- [ ] Submitting valid input appends comment to top of thread
- [ ] New comment displays immediately with current user (`u/me` or mock user)
- [ ] Post card comment count increments by 1
- [ ] Input clears after successful submission
- [ ] Multiple comments can be added sequentially

### Create Post Modal
- [ ] Clicking "Create post" button opens modal overlay
- [ ] Modal displays community dropdown, title input, and body textarea
- [ ] Community dropdown preselects current `activeCommunity` if applicable
- [ ] Submitting empty title shows validation error
- [ ] Submitting valid form creates new post object with:
  - [ ] Unique ID
  - [ ] Selected community and accent color
  - [ ] Current mock user as author
  - [ ] Relative time string ("Just now")
  - [ ] 0 votes, 0 comments, 0 awards
  - [ ] Empty commentsThread array
- [ ] New post appears at top of feed (respecting current sort mode)
- [ ] Modal closes on successful submission
- [ ] Modal closes on backdrop click
- [ ] Modal closes on ESC key press

### General Quality
- [ ] No console errors or warnings during interactions
- [ ] All TypeScript types are properly defined (no `any`)
- [ ] State updates are consistent across all three columns
- [ ] UI remains responsive on mobile during interactions
- [ ] Existing features (sort modes, community filter) continue to work
- [ ] Visual design matches existing aesthetic (no jarring changes)

---

## Technical Considerations

### State Management Approach
- Continue using `useState` for simplicity
- Vote maps keyed by `postId` and `commentId` for O(1) lookup
- Consider `useReducer` if state complexity grows in future iterations

### Form Validation
- Title: required, max 300 characters
- Body: optional, max 2000 characters
- Show inline error messages below invalid fields

### ID Generation
- Use `Date.now().toString()` or simple counter for unique IDs
- No UUID library to minimize dependencies

### Time Formatting
- New posts display "Just now"
- Existing posts retain their mock time strings
- No automatic relative-time updates (keep simple)

### Accessibility
- Keyboard navigation for vote buttons (tab, enter, space)
- ARIA labels on interactive elements
- Focus management for modal (trap focus when open, return to trigger on close)

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Vote interactions work without errors | 100% of votes register correctly |
| Comment submission success rate | 100% of valid comments appear immediately |
| Post creation success rate | 100% of valid posts appear in feed |
| Visual feedback consistency | All state changes reflected in UI within 16ms |
| No regression in existing features | All pre-iteration features remain functional |

---

## Next Steps (After This Iteration)

If this iteration succeeds, consider:
1. **Route-level navigation** — Add React Router for `/post/:id` and `/r/:community`
2. **Nested replies** — Add reply-to-comment UI with indentation
3. **Search functionality** — Implement real filtering on posts
4. **User switching** — Add simple user profile selector
5. **Post persistence** — Integrate localStorage for session persistence

If this iteration fails or reveals major architectural issues:
- Reconsider single-file component structure
- Evaluate need for external state management (Zustand, Redux)
- Assess if routing should be prioritized over interaction state

---

## Summary

This iteration adds the three core social actions (vote, comment, post) to transform the reddit-clone from a static prototype to a functionally interactive demo. The scope is intentionally narrow to validate the existing architecture before investing in routing, authentication, or more complex social features. Success here establishes confidence that the UI foundation can support dynamic content and user interactions at scale.
