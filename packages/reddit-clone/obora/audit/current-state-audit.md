# @obora/reddit-clone — Current State Audit

**Date:** 2026-03-08
**Package:** @obora/reddit-clone v0.1.0
**Purpose:** Reddit-style community feed clone validating project-scale frontend execution

---

## What Already Exists

### Core UI Layout
- Three-column responsive layout (280px / 1fr / 360px)
- Top navigation bar with brand block, search shell, and action buttons
- Hero card section with pulse stats
- Left community rail with browsable communities list
- Central multi-post feed with sort mode switcher
- Right-side comment thread panel tied to selected post
- Mobile breakpoints collapsing layout gracefully

### Data & State
- Mock data: 6 communities, 4 posts with nested comments, 3 live rooms, 5 trending topics
- Community filter state (`activeCommunity`)
- Sort mode state (`Hot | New | Rising`)
- Post selection state (`selectedPostId`) driving right panel display
- TypeScript types: `SortMode`, `Comment`, `Post`

### Visual Design System
- Dark theme with custom CSS variables (colors, shadows, radii)
- Fraunces + Instrument Sans typography via Google Fonts
- Ambient gradient orbs with dot grid overlay
- Glassmorphism panels with backdrop blur
- Micro-interactions (hover transforms, button transitions)
- Community accent colors (orange, green, blue, yellow)

### Infrastructure
- Vite 7.1.3 + React 18.3.1 + TypeScript 5.9
- Build scripts: dev, build, preview, typecheck
- No external routing library — single-page app with state-driven views

---

## Missing Core Features (vs. Useful Mini Reddit Clone)

| Feature | Current State | Impact |
|---------|---------------|--------|
| **Vote interaction state** | Static vote buttons, no state updates | Cannot upvote/downvote posts or comments |
| **Add comment flow** | "Reply" button present, no modal/input | Cannot post new comments to threads |
| **Create post flow** | "Create post" button present, no modal/form | Cannot publish new posts |
| **Route-level post detail page** | Comments always in right rail | No dedicated `/post/:id` view, no deep-linking |
| **Per-community page transitions** | Feed filters by community in-place | No `/r/:community` routes or page navigation |
| **Search functionality** | Search input present (default value only) | No actual filtering/search behavior |
| **User authentication state** | Hardcoded `u/` usernames | No login/logout or user switching |
| **Post actions** | Share/Save buttons present, no handlers | Cannot save or share posts |
| **Reply to comments** | No nested reply UI | Flat comment thread only |
| **Post editing/deletion** | Not implemented | Cannot modify or remove content |

---

## Recommended Next Iteration (Smallest Meaningful)

### Iteration: Interactive Core
Add interaction state to the read-only feed to make it functionally complete at the demo level.

**Scope:**
1. **Vote interaction state**
   - Track user votes per post and per comment (`Map<string, 1 | -1>`)
   - Update vote counts on upvote/downvote
   - Visual feedback: active button states, vote color changes

2. **Add comment flow**
   - Simple comment input below comment thread
   - Append new comment to `selectedPost.commentsThread`
   - Update comment count on post card

3. **Create post modal**
   - Modal overlay with title/body inputs + community selector
   - Prepend new post to feed list
   - Reset form and close modal on submit

**Exclusions:**
- Routing (keep single-page state-driven approach)
- Authentication (continue with mock users)
- Nested replies (top-level comments only)
- Post persistence (state-only, no backend)

**Success Criteria:**
- User can upvote/downvote posts and comments with live count updates
- User can add comments to the selected post thread
- User can create new posts that appear in feed
- All interactions are undo-able (vote toggling)

---

## Risks & Constraints

### Technical Constraints
- **No routing library:** Current implementation uses pure React state. Adding routes would require React Router or similar — non-trivial refactor.
- **Single-file component:** All logic in `App.tsx`. Adding complex interactions may warrant component extraction.
- **State management:** Local `useState` only. Vote/comment maps across many items may benefit from useReducer or Zustand.

### Design Risks
- **Right-rail comment panel:** At scale, comments overflow panel height. Needs scrolling/virtualization for long threads.
- **Mobile comment view:** Right rail stacks on mobile — comment viewing UX degrades on small screens without dedicated page.

### Scope Risk
- Feature creep could push toward full Reddit clone (authentication, backend, nested comments, media uploads). This exceeds "mini clone" validation goal.

### Data Consistency
- Mock data is static. New posts/comments are in-memory only. App refresh resets all interactions.
- No validation on inputs (empty posts, max lengths, etc.).

### Dependency Footprint
- Currently minimal (React + DOM + TypeScript). Adding routing/state libraries increases bundle size and complexity.

---

## Architecture Notes

### Current State Flow
```
activeCommunity + sortMode → filteredPosts
selectedPostId → selectedPost (for right rail)
```

### Proposed State Extensions
```
userPostVotes: Map<string, 1 | -1>
userCommentVotes: Map<string, 1 | -1>
isCreatePostModalOpen: boolean
newCommentDraft: string
```

### Component Extraction Opportunities
- `<PostCard>` — extract from map with vote handlers
- `<CommentCard>` — extract from map with vote handlers
- `<CreatePostModal>` — isolate modal logic
- `<VoteButton>` — reusable vote component

---

## Summary

The reddit-clone has a solid read-only foundation with polished UI, responsive layout, and well-structured mock data. The next meaningful step is adding interaction state (voting, commenting, posting) to transform it from a static prototype to a functional demo. Routing and deeper social features should be deferred until the interactive core is validated.
