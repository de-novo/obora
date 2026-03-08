# @obora/reddit-clone — Architecture Documentation

This directory contains implementation plans for each iteration of the reddit-clone project.

## Iteration 1: Interactive Core (2026-03-08)

**Status:** Implementation Plan Ready  
**File:** [`iteration-1-interactive-core.md`](./iteration-1-interactive-core.md)

### Overview
Transforms the read-only prototype into a functionally interactive demo by adding:
- Vote interaction state (upvote/downvote for posts and comments)
- Add comment flow (inline composer in comment thread)
- Create post modal (overlay with community selector, title, and body)

### Key Decisions

| Decision | Rationale |
|----------|-----------|
| Vote state via `Map<string, 1 \| -1>` | O(1) lookup, simple toggle logic, no library overhead |
| Top-level comments only | Reduces complexity; nested replies deferred |
| Session-only persistence | Validates interaction state before adding localStorage/backend |
| No routing in this iteration | Keeps architectural changes minimal; focus on state management |
| Single-file React structure | Reduces iteration overhead; easier to validate end-to-end |

### Architecture Highlights

**State Model:**
```typescript
// New state additions
userPostVotes: Map<string, 1 | -1>
userCommentVotes: Map<string, 1 | -1>
isCreatePostModalOpen: boolean
postForm: { community, title, body }
postFormErrors: { title, body }
newCommentDraft: string
```

**Component Breakdown:**
- `VoteButton` (new, reusable)
- `CreatePostModal` (new, isolated)
- `CommentComposer` (new, in-panel input)
- `PostCard` (updated with vote handlers)
- `CommentCard` (updated with vote handlers)

**File Changes:**
- `src/App.tsx`: ~200 lines added (state, handlers, JSX updates)
- `src/styles.css`: ~120 lines added (vote states, modal, form styles)
- `src/types.ts`: Optional new file for type extraction

### Implementation Order
1. Vote interactions (highest priority, most visible)
2. Add comment flow
3. Create post modal
4. Polish (keyboard shortcuts, transitions, accessibility)

### Success Metrics
- 100% of vote/comment/post interactions work correctly
- Immediate visual feedback on all state changes
- No regressions to existing features (sort modes, community filter, post selection)

---

## Future Iterations

| Iteration | Status | Focus |
|-----------|--------|-------|
| 1 | Planned | Interactive Core (votes, comments, posts) |
| 2 | Not Started | Route-level navigation (`/post/:id`, `/r/:community`) |
| 3 | Not Started | Nested comment replies |
| 4 | Not Started | Search functionality |
| 5 | Not Started | Persistence layer (localStorage) |

---

## Architecture Principles

1. **Incremental Validation** - Each iteration validates a core capability before adding complexity
2. **No Premature Abstraction** - Keep it in the file until patterns are proven
3. **Single Source of Truth** - All state lives in React; derived values computed on render
4. **Visual Feedback First** - Every interaction has immediate, visible confirmation
5. **Type Safety** - Full TypeScript coverage; no `any` types

---

## File Naming Convention

Architecture files follow the pattern:
```
obora/architecture/iteration-{N}-{slug}.md
```

Where:
- `N` is the iteration number (1-indexed)
- `slug` is a kebab-case description of the iteration focus
