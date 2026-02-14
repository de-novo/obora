# Reddit-like Service Requirements

## Overview
A simplified Reddit-like community platform supporting posts, comments, voting, and ranking.

## Core Features

### 1. Posts
- Create, read, update, delete posts
- Each post has: title, body, author, subreddit, created_at
- Support text and link posts

### 2. Comments
- Nested comments (tree structure, max depth 10)
- Create, read, update, delete
- Each comment has: body, author, post_id, parent_comment_id, created_at

### 3. Voting
- Upvote / downvote on posts and comments
- One vote per user per item (toggle or change)
- Vote tally stored separately for performance

### 4. Hot Ranking
- Simplified Reddit hot algorithm
- Score = f(upvotes, downvotes, age, comment_count)
- Recalculated periodically (every 5 min)

### 5. Subreddits
- Create and subscribe to subreddits
- Each subreddit has: name, description, rules, moderators
- Feed filtered by subscription

### 6. Users
- Registration, login (email + password)
- Profile: username, karma, joined_at
- Karma = sum of post/comment upvotes received

## Non-Functional Requirements
- Target: 10K concurrent users (MVP)
- API response < 200ms (p95)
- PostgreSQL primary store, Redis for caching/ranking
- REST API (OpenAPI 3.1)
- Containerized deployment (Docker Compose for dev, K8s for prod)

## Out of Scope (MVP)
- Real-time notifications
- Media uploads
- Moderation queue
- Search (full-text)
