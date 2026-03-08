import type { Post } from '../types'
import PostCard from './PostCard'

interface FeedProps {
  posts: Post[]
  userVotes: Record<string, 1 | -1 | 0>
  onVote: (postId: string, direction: 1 | -1 | 0) => void
}

export default function Feed({ posts, userVotes, onVote }: FeedProps) {
  return (
    <main className="feed" data-testid="posts-feed">
      {posts.length === 0 ? (
        <p className="empty-state">No posts found.</p>
      ) : (
        <div className="posts-list">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              userVote={userVotes[post.id] ?? 0}
              onVote={onVote}
            />
          ))}
        </div>
      )}
    </main>
  )
}
