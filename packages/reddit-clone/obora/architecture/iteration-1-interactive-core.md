# @obora/reddit-clone — Iteration 1: Architecture Plan

**Date:** 2026-03-08
**Package:** @obora/reddit-clone v0.1.0
**Iteration:** 1 — Interactive Core
**Status:** Implementation Plan

---

## Overview

This plan transforms the read-only prototype into a functionally interactive demo by adding vote state, comment creation, and post publishing capabilities. The architecture maintains the existing single-file structure while extending state management to support user interactions.

**Key Constraints:**
- No routing in this iteration (deferred to Iteration 2)
- Session-only state persistence (no localStorage yet)
- Single-file React component structure (App.tsx)
- No external state management libraries

---

## Route Structure

### Current State
The application uses a state-driven single-page view without client-side routing:

```
/ (single view)
├── All communities feed
│   ├── Hot / New / Rising sort modes
│   └── Post selection drives right-rail comments
└── Per-community filtered feeds
```

### Target State (No Changes)
The route structure remains unchanged. All interactions happen within the existing view hierarchy.

**Deferred to Iteration 2:**
- `/post/:id` - Route-level post detail page
- `/r/:community` - Per-community page with dedicated URL

---

## State Model

### Existing State
```typescript
// Current top-level state
const [activeCommunity, setActiveCommunity] = useState<string>("All");
const [sortMode, setSortMode] = useState<SortMode>("Hot");
const [selectedPostId, setSelectedPostId] = useState<string>(posts[0]?.id ?? "");
```

### New State Additions

```typescript
// Vote interaction state
type VoteDirection = 1 | -1;
const [userPostVotes, setUserPostVotes] = useState<Map<string, VoteDirection>>(new Map());
const [userCommentVotes, setUserCommentVotes] = useState<Map<string, VoteDirection>>(new Map());

// Create post modal state
const [isCreatePostModalOpen, setIsCreatePostModalOpen] = useState<boolean>(false);
const [postForm, setPostForm] = useState({
  community: "r/webdev", // default community
  title: "",
  body: ""
});
const [postFormErrors, setPostFormErrors] = useState({
  title: "",
  body: ""
});

// Comment composition state
const [newCommentDraft, setNewCommentDraft] = useState<string>("");
const [isCommentSubmitting, setIsCommentSubmitting] = useState<boolean>(false);

// Posts array as state (to allow appending)
const [posts, setPosts] = useState<Post[]>(initialPosts);
```

### State Flow Diagrams

#### Vote Interaction Flow
```
User clicks vote button
    ↓
handlePostVote(postId, direction)
    ↓
Check existing vote in userPostVotes
    ↓
┌─────────────────┬──────────────────┬─────────────────┐
│ No existing vote│ Same direction   │ Opposite dir    │
└─────────────────┴──────────────────┴─────────────────┘
    ↓                   ↓                   ↓
Add vote to map    Remove from map      Replace in map
    ↓                   ↓                   ↓
Update post.votes   -2 for switch      +1 for new
```

#### Add Comment Flow
```
User types in comment input
    ↓
newCommentDraft state updates
    ↓
User submits (Enter or click)
    ↓
handleAddComment()
    ↓
Validate draft (non-empty)
    ↓
Create new comment object
    ↓
Append to selectedPost.commentsThread
    ↓
Increment post.comments count
    ↓
Clear newCommentDraft
```

#### Create Post Flow
```
User clicks "Create post" button
    ↓
isCreatePostModalOpen = true
    ↓
User fills form fields
    ↓
postForm state updates
    ↓
User submits
    ↓
Validate (title required, max lengths)
    ↓
If errors → setPostFormErrors
    ↓
If valid → handleCreatePost()
    ↓
Generate post object with defaults
    ↓
Prepend to posts array
    ↓
Close modal, reset form
```

---

## Component Breakdown

### Current Components (Inline in App.tsx)
| Component | Lines | Responsibility |
|-----------|-------|----------------|
| `App` | ~320 | Root component with all layout and state |
| `LogoMark` | ~12 | Brand logo icon |
| `IconArrow` | ~4 | Vote direction arrow icon |

### New Components to Extract

#### 1. `VoteButton` (Reusable)
```typescript
interface VoteButtonProps {
  direction: "up" | "down";
  count: number;
  userVote?: 1 | -1;
  onVote: (direction: 1 | -1) => void;
  size?: "sm" | "md"; // for comments vs posts
}
```
**Responsibilities:**
- Display up/down arrow
- Show vote count
- Highlight if user has voted in this direction
- Handle click events

**Styling states:**
- Neutral: default styling
- Upvoted: `color: var(--green)`
- Downvoted: `color: #ff6b6b` (new red variable)

#### 2. `CreatePostModal` (Isolated)
```typescript
interface CreatePostModalProps {
  isOpen: boolean;
  communities: readonly string[];
  form: PostFormState;
  errors: PostFormErrors;
  onFieldChange: (field: keyof PostFormState, value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

interface PostFormState {
  community: string;
  title: string;
  body: string;
}

interface PostFormErrors {
  title: string | null;
  body: string | null;
}
```
**Responsibilities:**
- Overlay backdrop with click-to-close
- ESC key listener
- Community dropdown selector
- Title input with character counter
- Body textarea with character counter
- Inline validation errors
- Submit/cancel buttons

#### 3. `CommentComposer` (In-Panel Input)
```typescript
interface CommentComposerProps {
  draft: string;
  isSubmitting: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}
```
**Responsibilities:**
- Single-line text input
- Character limit indicator (max 1000 chars)
- Submit button (enabled only when non-empty)
- Loading state during submission

#### 4. `CommentCard` (Refined)
```typescript
interface CommentCardProps {
  comment: Comment;
  userVote?: 1 | -1;
  onVote: (direction: 1 | -1) => void;
}
```
**Responsibilities:**
- Display comment metadata
- Display comment body
- Include vote buttons with state
- Show flair badge if present

### Updated `PostCard` Component
```typescript
interface PostCardProps {
  post: Post;
  isSelected: boolean;
  userVote?: 1 | -1;
  onSelect: () => void;
  onVote: (direction: 1 | -1) => void;
}
```
**Changes:**
- Accept `userVote` prop for vote state
- Accept `onVote` callback
- Use `VoteButton` component internally

---

## File-by-File Change Plan

### `src/App.tsx` (Primary Changes)

#### Section 1: Type Extensions (Lines 1-30)
```typescript
// Add new types
type VoteDirection = 1 | -1;

interface PostFormState {
  community: string;
  title: string;
  body: string;
}

interface PostFormErrors {
  title: string | null;
  body: string | null;
}

// Extend Comment type (if needed for vote tracking)
// Note: Existing Comment type has `score: number` - sufficient
```

#### Section 2: State Additions (After existing useState calls, ~Line 285)
```typescript
// Vote state
const [userPostVotes, setUserPostVotes] = useState<Map<string, VoteDirection>>(new Map());
const [userCommentVotes, setUserCommentVotes] = useState<Map<string, VoteDirection>>(new Map());

// Create post modal state
const [isCreatePostModalOpen, setIsCreatePostModalOpen] = useState(false);
const [postForm, setPostForm] = useState<PostFormState>({
  community: "r/webdev",
  title: "",
  body: ""
});
const [postFormErrors, setPostFormErrors] = useState<PostFormErrors>({
  title: null,
  body: null
});

// Comment composition state
const [newCommentDraft, setNewCommentDraft] = useState("");
const [isCommentSubmitting, setIsCommentSubmitting] = useState(false);

// Posts as state (change const to useState)
const [posts, setPosts] = useState<Post[]>(initialPosts);
```

#### Section 3: Handler Functions (New section before return, ~Line 290)
```typescript
// Vote handlers
function handlePostVote(postId: string, direction: VoteDirection) {
  setUserPostVotes((prev) => {
    const next = new Map(prev);
    const existing = next.get(postId);
    
    if (existing === direction) {
      // Remove vote (toggle off)
      next.delete(postId);
    } else if (existing === -direction) {
      // Switch vote direction
      next.set(postId, direction);
    } else {
      // New vote
      next.set(postId, direction);
    }
    
    return next;
  });

  // Update post vote count
  setPosts((prev) => prev.map((post) => {
    if (post.id !== postId) return post;
    
    const existing = userPostVotes.get(postId);
    const delta = existing === direction ? 0 : existing === -direction ? direction * 2 : direction;
    
    return {
      ...post,
      votes: post.votes + delta
    };
  }));
}

function handleCommentVote(commentId: string, direction: VoteDirection) {
  setUserCommentVotes((prev) => {
    const next = new Map(prev);
    const existing = next.get(commentId);
    
    if (existing === direction) {
      next.delete(commentId);
    } else if (existing === -direction) {
      next.set(commentId, direction);
    } else {
      next.set(commentId, direction);
    }
    
    return next;
  });

  // Update comment score
  setPosts((prev) => prev.map((post) => {
    if (post.id !== selectedPostId) return post;
    
    const existing = userCommentVotes.get(commentId);
    const delta = existing === direction ? 0 : existing === -direction ? direction * 2 : direction;
    
    return {
      ...post,
      commentsThread: post.commentsThread.map((comment) => {
        if (comment.id !== commentId) return comment;
        return {
          ...comment,
          score: comment.score + delta
        };
      })
    };
  }));
}

// Comment handlers
function handleAddComment() {
  if (!newCommentDraft.trim() || !selectedPostId) return;
  
  setIsCommentSubmitting(true);
  
  const newComment: Comment = {
    id: `c-${Date.now()}`,
    author: "u/me", // Mock current user
    time: "Just now",
    body: newCommentDraft.trim(),
    score: 0
  };
  
  setPosts((prev) => prev.map((post) => {
    if (post.id !== selectedPostId) return post;
    
    return {
      ...post,
      comments: post.comments + 1,
      commentsThread: [newComment, ...post.commentsThread]
    };
  }));
  
  setNewCommentDraft("");
  setIsCommentSubmitting(false);
}

// Post creation handlers
function handleCreatePostOpen() {
  setPostForm({
    community: activeCommunity === "All" ? communities[1] : activeCommunity,
    title: "",
    body: ""
  });
  setPostFormErrors({ title: null, body: null });
  setIsCreatePostModalOpen(true);
}

function handleCreatePostClose() {
  setIsCreatePostModalOpen(false);
}

function handlePostFormChange(field: keyof PostFormState, value: string) {
  setPostForm((prev) => ({ ...prev, [field]: value }));
  // Clear error when user types
  if (postFormErrors[field]) {
    setPostFormErrors((prev) => ({ ...prev, [field]: null }));
  }
}

function handleCreatePostSubmit() {
  // Validation
  const errors: PostFormErrors = {
    title: postForm.title.trim() ? null : "Title is required",
    body: postForm.body.length > 2000 ? "Body must be under 2000 characters" : null
  };
  
  if (errors.title || errors.body) {
    setPostFormErrors(errors);
    return;
  }
  
  // Generate new post
  const communityAccent = getCommunityAccent(postForm.community);
  
  const newPost: Post = {
    id: `post-${Date.now()}`,
    community: postForm.community,
    accent: communityAccent,
    author: "u/me",
    time: "Just now",
    title: postForm.title.trim(),
    body: postForm.body.trim(),
    tags: [], // No tags in MVP
    votes: 0,
    comments: 0,
    awards: 0,
    preview: postForm.body.slice(0, 120) + (postForm.body.length > 120 ? "…" : ""),
    trend: 50, // Default trend for new posts
    commentsThread: []
  };
  
  // Prepend to posts
  setPosts((prev) => [newPost, ...prev]);
  
  // Close modal and reset
  setIsCreatePostModalOpen(false);
  setPostForm({ community: "r/webdev", title: "", body: "" });
}

function getCommunityAccent(community: string): string {
  const accents: Record<string, string> = {
    "r/designcrit": "#ff6b3d",
    "r/startups": "#89ffb8",
    "r/webdev": "#72a9ff",
    "r/sideproject": "#ffd166",
    "r/typography": "#ff6b9d"
  };
  return accents[community] || "#72a9ff";
}
```

#### Section 4: JSX Updates

**4a. Update "Create post" button (Line ~325)**
```typescript
// Before:
<button className="ghost-button">Create post</button>

// After:
<button className="ghost-button" onClick={handleCreatePostOpen}>
  Create post
</button>
```

**4b. Update PostCard vote buttons (Lines ~400-410)**
```typescript
// Before:
<button className="vote-button" aria-label="Upvote">
  <IconArrow direction="up" />
</button>
<strong>{formatVotes(post.votes)}</strong>
<button className="vote-button" aria-label="Downvote">
  <IconArrow direction="down" />
</button>

// After:
const userVote = userPostVotes.get(post.id);

<button 
  className={`vote-button ${userVote === 1 ? "vote-button--upvoted" : ""}`}
  onClick={(e) => { e.stopPropagation(); handlePostVote(post.id, 1); }}
  aria-label="Upvote"
>
  <IconArrow direction="up" />
</button>
<strong>{formatVotes(post.votes + (userVote || 0))}</strong>
<button 
  className={`vote-button ${userVote === -1 ? "vote-button--downvoted" : ""}`}
  onClick={(e) => { e.stopPropagation(); handlePostVote(post.id, -1); }}
  aria-label="Downvote"
>
  <IconArrow direction="down" />
</button>
```

**4c. Update comment list with vote buttons (Lines ~490-500)**
```typescript
// Before:
<article key={comment.id} className="comment-card">
  <div className="comment-meta">
    <strong>{comment.author}</strong>
    {comment.flair ? <span className="comment-flair">{comment.flair}</span> : null}
    <span>{comment.time}</span>
    <span>{formatVotes(comment.score)} pts</span>
  </div>
  <p>{comment.body}</p>
</article>

// After:
const userCommentVote = userCommentVotes.get(comment.id);

<article key={comment.id} className="comment-card">
  <div className="comment-meta">
    <strong>{comment.author}</strong>
    {comment.flair ? <span className="comment-flair">{comment.flair}</span> : null}
    <span>{comment.time}</span>
    <span>{formatVotes(comment.score + (userCommentVote || 0))} pts</span>
    <button 
      className={`vote-button vote-button--small ${userCommentVote === 1 ? "vote-button--upvoted" : ""}`}
      onClick={() => handleCommentVote(comment.id, 1)}
    >
      <IconArrow direction="up" />
    </button>
    <button 
      className={`vote-button vote-button--small ${userCommentVote === -1 ? "vote-button--downvoted" : ""}`}
      onClick={() => handleCommentVote(comment.id, -1)}
    >
      <IconArrow direction="down" />
    </button>
  </div>
  <p>{comment.body}</p>
</article>
```

**4d. Add comment composer below comments panel (After comment list, ~Line 505)**
```typescript
// Add this new section after the comment list:
{selectedPost && (
  <div className="comment-composer">
    <input
      type="text"
      className="comment-input"
      placeholder="Add a comment…"
      value={newCommentDraft}
      onChange={(e) => setNewCommentDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleAddComment();
        }
      }}
      maxLength={1000}
    />
    <button 
      className="ghost-button ghost-button--small"
      onClick={handleAddComment}
      disabled={!newCommentDraft.trim() || isCommentSubmitting}
    >
      {isCommentSubmitting ? "Posting…" : "Reply"}
    </button>
  </div>
)}
```

**4e. Add CreatePostModal at end of JSX (Before closing </div>, ~Line 530)**
```typescript
// Add before the final closing </div>:
{isCreatePostModalOpen && (
  <div 
    className="modal-backdrop"
    onClick={handleCreatePostClose}
    onKeyDown={(e) => {
      if (e.key === "Escape") handleCreatePostClose();
    }}
  >
    <div 
      className="modal-content"
      onClick={(e) => e.stopPropagation()}
    >
      <h2>Create a post</h2>
      
      <div className="form-field">
        <label>Community</label>
        <select 
          value={postForm.community}
          onChange={(e) => handlePostFormChange("community", e.target.value)}
        >
          {communities.filter(c => c !== "All").map((community) => (
            <option key={community} value={community}>{community}</option>
          ))}
        </select>
      </div>
      
      <div className="form-field">
        <label>Title</label>
        <input 
          type="text"
          value={postForm.title}
          onChange={(e) => handlePostFormChange("title", e.target.value)}
          placeholder="An interesting title…"
          maxLength={300}
        />
        <span className="char-count">{postForm.title.length}/300</span>
        {postFormErrors.title && <span className="form-error">{postFormErrors.title}</span>}
      </div>
      
      <div className="form-field">
        <label>Body (optional)</label>
        <textarea 
          value={postForm.body}
          onChange={(e) => handlePostFormChange("body", e.target.value)}
          placeholder="What's on your mind?"
          maxLength={2000}
          rows={6}
        />
        <span className="char-count">{postForm.body.length}/2000</span>
        {postFormErrors.body && <span className="form-error">{postFormErrors.body}</span>}
      </div>
      
      <div className="modal-actions">
        <button className="ghost-button" onClick={handleCreatePostClose}>
          Cancel
        </button>
        <button className="solid-button" onClick={handleCreatePostSubmit}>
          Post
        </button>
      </div>
    </div>
  </div>
)}
```

#### Section 5: Constant Migration
Move `posts` array to a constant outside the component and rename to `initialPosts`.

```typescript
// At top level, before App function
const initialPosts: Post[] = [
  // ... existing posts array
];
```

### `src/styles.css` (New Styles)

Add the following CSS classes at the end of the file:

```css
/* Vote button states */
.vote-button--upvoted {
  color: var(--green);
  border-color: rgba(137, 255, 184, 0.3);
  background: rgba(137, 255, 184, 0.08);
}

.vote-button--downvoted {
  color: #ff6b6b;
  border-color: rgba(255, 107, 107, 0.3);
  background: rgba(255, 107, 107, 0.08);
}

.vote-button--small {
  width: 32px;
  height: 32px;
  font-size: 0.8rem;
}

/* Comment composer */
.comment-composer {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--stroke);
}

.comment-input {
  flex: 1;
  padding: 12px 16px;
  border-radius: 16px;
  border: 1px solid var(--stroke);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  font-size: 0.95rem;
}

.comment-input:focus {
  outline: none;
  border-color: rgba(255, 107, 61, 0.4);
  background: rgba(255, 255, 255, 0.06);
}

.comment-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  display: grid;
  place-items: center;
  z-index: 1000;
  padding: 20px;
}

.modal-content {
  width: 100%;
  max-width: 520px;
  background: linear-gradient(180deg, rgba(18, 24, 33, 0.98), rgba(12, 17, 24, 0.98));
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-xl);
  padding: 28px;
  box-shadow: 0 32px 100px rgba(0, 0, 0, 0.6);
  display: grid;
  gap: 18px;
}

.modal-content h2 {
  margin: 0;
  font-family: "Fraunces", Georgia, serif;
  font-size: 1.8rem;
}

.form-field {
  display: grid;
  gap: 8px;
}

.form-field label {
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted);
}

.form-field input,
.form-field select,
.form-field textarea {
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--stroke);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  font-size: 1rem;
  font-family: inherit;
}

.form-field input:focus,
.form-field select:focus,
.form-field textarea:focus {
  outline: none;
  border-color: rgba(255, 107, 61, 0.4);
  background: rgba(255, 255, 255, 0.06);
}

.form-field textarea {
  resize: vertical;
  min-height: 120px;
  line-height: 1.6;
}

.char-count {
  font-size: 0.78rem;
  color: var(--muted);
  text-align: right;
}

.form-error {
  font-size: 0.82rem;
  color: #ff6b6b;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
}

/* Form input with error state */
.form-field input:has(+ .form-error),
.form-field textarea:has(+ .form-error) {
  border-color: rgba(255, 107, 107, 0.5);
}

/* Disabled button in comment composer */
.ghost-button:disabled,
.solid-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.ghost-button:disabled:hover,
.solid-button:disabled:hover {
  transform: none;
}
```

### `src/types.ts` (New File - Optional)

For better organization, consider extracting types to a separate file:

```typescript
// src/types.ts
export type SortMode = "Hot" | "New" | "Rising";
export type VoteDirection = 1 | -1;

export interface Comment {
  id: string;
  author: string;
  flair?: string;
  score: number;
  time: string;
  body: string;
}

export interface Post {
  id: string;
  community: string;
  accent: string;
  author: string;
  time: string;
  title: string;
  body: string;
  tags: string[];
  votes: number;
  comments: number;
  awards: number;
  preview: string;
  trend: number;
  featured?: boolean;
  commentsThread: Comment[];
}

export interface PostFormState {
  community: string;
  title: string;
  body: string;
}

export interface PostFormErrors {
  title: string | null;
  body: string | null;
}
```

If this file is created, update `src/App.tsx` imports accordingly.

---

## Local Data Model

### Vote State Structure
```typescript
// userPostVotes: Map<string, 1 | -1>
// Keys: post IDs
// Values: 1 (upvoted) or -1 (downvoted)

Example:
{
  "post-1": 1,        // User upvoted post-1
  "post-2": -1,       // User downvoted post-2
  "post-3": undefined // User has not voted on post-3
}

// userCommentVotes: Map<string, 1 | -1>
// Same structure for comment IDs
```

### Post Creation State Structure
```typescript
// postForm: PostFormState
{
  community: "r/webdev",  // Selected community
  title: "",              // Draft title
  body: ""                // Draft body text
}

// postFormErrors: PostFormErrors
{
  title: null,            // null = no error, string = error message
  body: null
}
```

### Comment Composition State Structure
```typescript
// newCommentDraft: string
// Current text in comment input

// isCommentSubmitting: boolean
// Loading state during submission
```

### Posts Array Updates

**New Post Template:**
```typescript
{
  id: `post-${Date.now()}`,           // Unique ID
  community: selectedCommunity,       // From form
  accent: derivedColor,               // From community mapping
  author: "u/me",                     // Mock current user
  time: "Just now",                   // Fixed for new posts
  title: formTitle,                   // From form
  body: formBody,                     // From form
  tags: [],                           // Empty in MVP
  votes: 0,                           // Starts at 0
  comments: 0,                        // Starts at 0
  awards: 0,                          // Starts at 0
  preview: body.slice(0, 120) + "…",  // Auto-generated
  trend: 50,                          // Default trend score
  commentsThread: []                  // Empty thread
}
```

**New Comment Template:**
```typescript
{
  id: `c-${Date.now()}`,     // Unique ID
  author: "u/me",             // Mock current user
  flair: undefined,           // No flair in MVP
  score: 0,                   // Starts at 0
  time: "Just now",           // Fixed for new comments
  body: draftBody             // From input
}
```

### Community Color Mapping
```typescript
const communityAccents: Record<string, string> = {
  "r/designcrit": "#ff6b3d",
  "r/startups": "#89ffb8",
  "r/webdev": "#72a9ff",
  "r/sideproject": "#ffd166",
  "r/typography": "#ff6b9d"
};
```

---

## Implementation Order

### Phase 1: Vote Interactions (Highest Priority)
1. Add vote state (`userPostVotes`, `userCommentVotes`)
2. Implement `handlePostVote()` and `handleCommentVote()`
3. Update `PostCard` JSX with vote handlers and state classes
4. Update `CommentCard` JSX with vote handlers and state classes
5. Add CSS classes for `vote-button--upvoted` and `vote-button--downvoted`
6. Test: Vote toggling, direction switching, count updates

### Phase 2: Add Comment Flow
1. Add `newCommentDraft` and `isCommentSubmitting` state
2. Implement `handleAddComment()` function
3. Add comment composer JSX to comments panel
4. Add CSS styles for `.comment-composer` and `.comment-input`
5. Test: Draft updates, empty validation, submission, count increment

### Phase 3: Create Post Modal
1. Add modal state (`isCreatePostModalOpen`, `postForm`, `postFormErrors`)
2. Implement modal handlers (`handleCreatePostOpen`, `handleCreatePostClose`, etc.)
3. Implement `handleCreatePostSubmit()` with validation
4. Implement `getCommunityAccent()` helper
5. Add modal JSX at end of App component
6. Update "Create post" button with click handler
7. Add CSS styles for modal (`.modal-backdrop`, `.modal-content`, etc.)
8. Test: Modal open/close, form validation, post creation, feed update

### Phase 4: Polish (If Time Permits)
1. Add keyboard shortcuts (Enter to submit comment, ESC to close modal)
2. Add character counters
3. Improve loading states
4. Add transitions for smoother interactions
5. Accessibility audit (ARIA labels, focus management)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| State updates causing re-render thrashing | Low | Medium | Use Map for vote state (immutable updates trigger minimal re-renders) |
| Vote count desync between displayed and stored | Low | High | Single source of truth: calculate display count = base + userVote |
| Modal focus trap not implemented | Medium | Low | Deferred to accessibility polish phase |
| Form validation edge cases | Low | Medium | Simple validation rules with clear error messages |
| New posts not respecting sort order | Low | Medium | Ensure `posts` array is state, prepend always puts at index 0 |

---

## Success Criteria

### Functional
- [ ] Vote interactions work correctly for posts and comments
- [ ] Vote state persists while navigating between posts
- [ ] Comment submission appends to thread and increments count
- [ ] Post creation adds new post to feed with correct metadata
- [ ] Form validation prevents invalid submissions

### Visual
- [ ] Voted buttons show distinct colors (green for up, red for down)
- [ ] Modal appears with backdrop blur
- [ ] Form errors display inline
- [ ] Loading states prevent double submissions

### Code Quality
- [ ] No TypeScript errors
- [ ] No console warnings
- [ ] All state updates are immutable
- [ ] Handlers follow consistent naming patterns

---

## Next Iteration Preparation

After completing this iteration, the codebase will be ready for:

1. **Component Extraction** - Move inline components to separate files
2. **State Management Evaluation** - Consider Zustand/Jotai if state complexity grows
3. **Routing Integration** - Add React Router for `/post/:id` and `/r/:community`
4. **Persistence Layer** - Add localStorage for vote and post persistence
5. **Nested Replies** - Extend comment model to support reply chains

---

## Summary

This architecture plan implements the Interactive Core iteration with minimal architectural changes to the existing codebase. All new features are built using React's built-in `useState` and existing CSS patterns. The plan maintains the single-file structure while establishing patterns that can be extracted into separate components in future iterations.

Key design decisions:
- **Vote state via Map**: O(1) lookups, simple toggle logic
- **Session-only persistence**: Validates interaction patterns before adding complexity
- **Immutable state updates**: Follow React best practices
- **Single-file structure**: Reduces iteration overhead, easier to validate end-to-end

The implementation is ordered by priority (votes → comments → posts) to ensure the most visible features are completed first.
