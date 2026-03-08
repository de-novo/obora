import type { Post } from '../types'

interface PostCardProps {
  post: Post
  userVote: 1 | -1 | 0
  onVote: (postId: string, direction: 1 | -1 | 0) => void
}

export default function PostCard({ post, userVote, onVote }: PostCardProps) {
  const score = post.upvotes - post.downvotes

  return (
    <article className="post-card" data-testid="post-card">
      <div className="post-votes">
        <button
          data-testid="upvote-button"
          onClick={() => onVote(post.id, userVote === 1 ? 0 : 1)}
          className={userVote === 1 ? 'upvoted' : ''}
          aria-label="Upvote"
        >
          ▲
        </button>
        <span data-testid="vote-score">{score}</span>
        <button
          data-testid="downvote-button"
          onClick={() => onVote(post.id, userVote === -1 ? 0 : -1)}
          className={userVote === -1 ? 'downvoted' : ''}
          aria-label="Downvote"
        >
          ▼
        </button>
      </div>
      <div className="post-content">
        <div className="post-meta">
          <span className="post-category">{post.category}</span>
          <span>•</span>
          <span className="post-author">{post.author.name}</span>
        </div>
        <h3 className="post-title">{post.title}</h3>
        <p className="post-body">{post.body}</p>
        {post.tags.length > 0 && (
          <div className="post-tags">
            {post.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
