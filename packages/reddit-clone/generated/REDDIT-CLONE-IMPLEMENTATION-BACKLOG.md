I've created a comprehensive implementation backlog for the reddit-clone package at `obora/implementation/backlog.md`.

## What's Included

### 5 Ordered Tasks
1. **Vote Button Component & State Foundation** (P0) - Core vote interactions with Map-based state
2. **Comment Composer UI & Validation** (P1) - Add comments to selected posts
3. **Create Post Modal** (P1) - Full post creation flow with form validation
4. **Comment Card Refinement with Votes** (P2) - Integrate voting into comment threads
5. **Polish & Edge Case Handling** (P2) - Loading states, empty states, accessibility

### 5 Commits with Clear Boundaries
Each commit has a descriptive message and testable outcomes:
- `feat: add vote button component and state foundation`
- `feat: add comment composer with validation`
- `feat: add create post modal with form validation`
- `refactor: refine comment cards with vote integration`
- `polish: add loading states, empty states, and animations`

### Comprehensive Testing Checklist
- **Vote tests**: Toggle behavior, state persistence, real-time updates
- **Comment tests**: Validation, submission, rendering, empty states
- **Modal tests**: Form validation, submission, backdrop behavior
- **Edge cases**: Empty states, rapid clicks, keyboard navigation, mobile layout
- **Integration tests**: State consistency across interactions

### UI Risk Mitigation Table
- **High priority**: Vote state desync, modal z-index, form validation timing
- **Medium priority**: Mobile overflow, long comment truncation, accessibility
- **Low priority** (accepted for Iteration 1): No reply nesting, no editing, no persistence

The backlog is implementation-ready with code patterns for vote state management and form validation, and explicitly marks features deferred to Iteration 2.
