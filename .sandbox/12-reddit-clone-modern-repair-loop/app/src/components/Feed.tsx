import { Post, Community } from '../types';
import { PostCard } from './PostCard';

interface FeedProps {
  posts: Post[];
  activeCommunity: Community;
  onCreatePost: () => void;
  onVote: (postId: string, direction: 'up' | 'down') => void;
}

export function Feed({ posts, activeCommunity, onCreatePost, onVote }: FeedProps) {
  const filteredPosts = posts.filter((post) =>
    activeCommunity === 'All' || post.community === activeCommunity
  );

  return (
    <main className="feed" data-testid="posts-feed">
      <div className="feed-header">
        <h1 className="feed-title">
          {activeCommunity === 'All' ? 'Home' : activeCommunity}
        </h1>
        <button
          className="create-post-button"
          onClick={onCreatePost}
          data-testid="create-post-button"
        >
          + Create Post
        </button>
      </div>
      {filteredPosts.map((post) => (
        <PostCard key={post.id} post={post} onVote={onVote} />
      ))}
      {filteredPosts.length === 0 && (
        <div className="post-card">
          <div className="post-content">
            <p className="post-body">No posts yet. Be the first to create one!</p>
          </div>
        </div>
      )}
    </main>
  );
}
