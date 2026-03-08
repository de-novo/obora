import { Post } from '../types';

interface PostCardProps {
  post: Post;
  onVote: (postId: string, direction: 'up' | 'down') => void;
}

function formatTimeAgo(timestamp: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export function PostCard({ post, onVote }: PostCardProps) {
  const scoreClass = post.userVote ? (post.userVote === 'up' ? 'active' : 'downvote') : '';
  const upvoteClass = post.userVote === 'up' ? 'active' : '';
  const downvoteClass = post.userVote === 'down' ? 'active' : '';

  return (
    <article className="post-card" data-testid="post-card">
      <div className="vote-section">
        <button
          className={`vote-button ${upvoteClass}`}
          onClick={() => onVote(post.id, 'up')}
          data-testid="upvote-button"
          aria-label="Upvote"
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" />
          </svg>
        </button>
        <span className={`vote-score ${scoreClass}`} data-testid="vote-score">
          {post.votes}
        </span>
        <button
          className={`vote-button downvote ${downvoteClass}`}
          onClick={() => onVote(post.id, 'down')}
          data-testid="downvote-button"
          aria-label="Downvote"
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" />
          </svg>
        </button>
      </div>
      <div className="post-content">
        <div className="post-meta">
          <span className="post-community">{post.community}</span>
          <span>•</span>
          <span className="post-author">u/{post.author}</span>
          <span>•</span>
          <span className="post-time">{formatTimeAgo(post.timestamp)}</span>
        </div>
        <h3 className="post-title">{post.title}</h3>
        <p className="post-body">{post.body}</p>
      </div>
    </article>
  );
}
