import { Post } from '../types';

interface PostCardProps {
  post: Post;
  onVote: (postId: string, voteValue: 1 | -1 | 0) => void;
}

export function PostCard({ post, onVote }: PostCardProps) {
  const handleUpvote = () => {
    onVote(post.id, post.userVote === 1 ? 0 : 1);
  };

  const handleDownvote = () => {
    onVote(post.id, post.userVote === -1 ? 0 : -1);
  };

  return (
    <article className="post-card" data-testid="post-card">
      <div className="post-votes">
        <button
          className="vote-button upvote"
          onClick={handleUpvote}
          aria-label="Upvote"
          data-testid="upvote-button"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={post.userVote === 1 ? 'active' : ''}
          >
            <path d="M10 3L3 12H7V17H13V12H17L10 3Z" />
          </svg>
        </button>
        <span
          className={`vote-score ${post.userVote !== 0 ? 'voted' : ''}`}
          data-testid="vote-score"
        >
          {post.votes}
        </span>
        <button
          className="vote-button downvote"
          onClick={handleDownvote}
          aria-label="Downvote"
          data-testid="downvote-button"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={post.userVote === -1 ? 'active' : ''}
          >
            <path d="M10 17L17 8H13V3H7V8H3L10 17Z" />
          </svg>
        </button>
      </div>
      <div className="post-content">
        <header className="post-header">
          <div className="post-meta">
            <span className="post-community">{post.community}</span>
            <span className="post-separator">•</span>
            <span className="post-author">u/{post.author}</span>
            <span className="post-separator">•</span>
            <span className="post-time">{post.createdAt}</span>
          </div>
        </header>
        <h3 className="post-title">{post.title}</h3>
        <p className="post-body">{post.body}</p>
        <footer className="post-footer">
          <button className="post-action" aria-label={`${post.commentCount} comments`}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2C5.59 2 2 5.59 2 10C2 14.41 5.59 18 10 18C10.74 18 11.45 17.88 12.12 17.67L17 18L16.67 13.12C17.88 11.45 18 10.74 18 10C18 5.59 14.41 2 10 2ZM10 16C6.69 16 4 13.31 4 10C4 6.69 6.69 4 10 4C13.31 4 16 6.69 16 10C16 13.31 13.31 16 10 16ZM10 7C8.9 7 8 7.9 8 9C8 10.1 8.9 11 10 11C11.1 11 12 10.1 12 9C12 7.9 11.1 7 10 7Z" />
            </svg>
            <span>{post.commentCount} comments</span>
          </button>
          <button className="post-action" aria-label="Share post">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 9L15 4L10 9L5 4L10 9ZM10 11L15 16L10 11L5 16L10 11Z" />
            </svg>
            <span>Share</span>
          </button>
          <button className="post-action" aria-label="Save post">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M5 4V18L10 15L15 18V4H5ZM7 6H13V14.5L10 12.5L7 14.5V6Z" />
            </svg>
            <span>Save</span>
          </button>
        </footer>
      </div>
      <style>{`
        .post-card {
          display: flex;
          gap: 12px;
          padding: 12px;
          background-color: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          margin-bottom: 12px;
          animation: fadeIn 0.3s ease;
        }

        .post-card:hover {
          border-color: var(--color-bg-hover);
        }

        .post-votes {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 8px 4px;
          min-width: 40px;
        }

        .vote-button {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 4px;
          color: var(--color-text-secondary);
          transition: all var(--transition-fast);
        }

        .vote-button:hover {
          background-color: var(--color-bg-hover);
        }

        .vote-button.upvote.active {
          color: var(--color-upvote);
        }

        .vote-button.downvote.active {
          color: var(--color-downvote);
        }

        .vote-button svg {
          width: 20px;
          height: 20px;
        }

        .vote-score {
          font-size: 12px;
          font-weight: 700;
          color: var(--color-text-primary);
        }

        .vote-score.voted {
          font-size: 13px;
        }

        .vote-score.voted.upvoted {
          color: var(--color-upvote);
        }

        .vote-score.voted.downvoted {
          color: var(--color-downvote);
        }

        .post-content {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .post-header {
          display: flex;
          align-items: center;
        }

        .post-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--color-text-secondary);
        }

        .post-community {
          font-weight: 500;
          color: var(--color-text-primary);
        }

        .post-community:hover {
          text-decoration: underline;
        }

        .post-separator {
          color: var(--color-text-muted);
        }

        .post-author {
          font-weight: 400;
        }

        .post-author:hover {
          text-decoration: underline;
        }

        .post-time {
          color: var(--color-text-muted);
        }

        .post-title {
          font-size: 18px;
          font-weight: 600;
          line-height: 1.4;
          color: var(--color-text-primary);
          margin: 0;
        }

        .post-body {
          font-size: 14px;
          line-height: 1.6;
          color: var(--color-text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
        }

        .post-footer {
          display: flex;
          gap: 4px;
          margin-top: 4px;
        }

        .post-action {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
          color: var(--color-text-secondary);
          background-color: transparent;
          transition: background-color var(--transition-fast);
        }

        .post-action:hover {
          background-color: var(--color-bg-hover);
        }

        .post-action svg {
          width: 18px;
          height: 18px;
          fill: currentColor;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </article>
  );
}
