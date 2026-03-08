# Reddit Mini App

A modern React TypeScript Vite application featuring a Reddit-inspired dark mode editorial feed.

## Tech Stack

- **React 18.3.1** - UI library
- **TypeScript 5.6.2** - Type safety
- **Vite 5.4.11** - Build tool and dev server
- **CSS Modules** (inline via `<style>`) - Styling

## Installation

```bash
npm install
```

## Available Scripts

- `npm run dev` - Start development server at http://localhost:3000
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run typecheck` - Run TypeScript type checking

## Features

- Dark mode Reddit-inspired UI
- Left community rail with 4 communities
- Center post feed with filtering
- Right insight/trending rail
- Upvote/downvote with score updates
- Create post modal
- Community filter pills

## Community Filters

- All
- r/designcrit
- r/startups
- r/webdev
- r/sideproject

## Project Structure

```
app/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── styles.css
    ├── types.ts
    ├── vite-env.d.ts
    ├── components/
    │   ├── Sidebar.tsx
    │   ├── PostCard.tsx
    │   ├── Feed.tsx
    │   ├── RightRail.tsx
    │   └── CreatePostModal.tsx
    └── data/
        └── seed.ts
```

## Test IDs

The following stable selectors are available for testing:

- `data-testid="community-pill"` - Community filter buttons
- `data-testid="posts-feed"` - Feed container
- `data-testid="post-card"` - Individual post cards
- `data-testid="create-post-button"` - Create post button in header
- `data-testid="create-post-modal"` - Modal overlay
- `data-testid="post-community-select"` - Community dropdown in modal
- `data-testid="post-title-input"` - Title input in modal
- `data-testid="post-body-input"` - Body textarea in modal
- `data-testid="submit-post-button"` - Submit button in modal
- `data-testid="vote-score"` - Vote score display
- `data-testid="upvote-button"` - Upvote button
- `data-testid="downvote-button"` - Downvote button
