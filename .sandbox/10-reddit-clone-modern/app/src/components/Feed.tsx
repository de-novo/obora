import { Post, CommunityFilter } from '../types';
import { PostCard } from './PostCard';

interface FeedProps {
  posts: Post[];
  filter: CommunityFilter;
  onVote: (postId: string, voteValue: 1 | -1 | 0) => void;
}

export function Feed({ posts, filter, onVote }: FeedProps) {
  const filteredPosts =
    filter === 'All' ? posts : posts.filter((post) => post.community === filter);

  return (
    <main className="feed">
      <div className="feed-header">
        <h1 className="feed-title">{filter === 'All' ? 'Home' : filter}</h1>
      </div>
      <div className="posts-feed" data-testid="posts-feed">
        {filteredPosts.length === 0 ? (
          <div className="empty-state">
            <p className="empty-message">No posts in this community yet.</p>
          </div>
        ) : (
          filteredPosts.map((post) => (
            <PostCard key={post.id} post={post} onVote={onVote} />
          ))
        )}
      </div>
      <style>{`
        .feed {
          flex: 1;
          min-width: 0;
          max-width: 688px;
        }

        .feed-header {
          margin-bottom: 16px;
        }

        .feed-title {
          font-size: 28px;
          font-weight: 800;
          color: var(--color-text-primary);
        }

        .posts-feed {
          display: flex;
          flex-direction: column;
        }

        .empty-state {
          padding: 48px 24px;
          text-align: center;
          background-color: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
        }

        .empty-message {
          font-size: 16px;
          color: var(--color-text-secondary);
        }

        @media (max-width: 768px) {
          .feed {
            max-width: 100%;
          }

          .feed-title {
            font-size: 22px;
          }
        }
      `}</style>
    </main>
  );
}
