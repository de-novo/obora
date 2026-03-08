import { Post } from '../types';

interface RightRailProps {
  posts: Post[];
}

export function RightRail({ posts }: RightRailProps) {
  const totalPosts = posts.length;
  const totalVotes = posts.reduce((sum, post) => sum + post.votes, 0);
  const topPost = posts.reduce((max, post) => (post.votes > max.votes ? post : max), posts[0]);

  return (
    <aside className="right-rail">
      <div className="rail-card">
        <h2 className="rail-title">About this Community</h2>
        <div className="rail-stats">
          <div className="stat-item">
            <span className="stat-label">Total Posts</span>
            <span className="stat-value">{totalPosts}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Total Votes</span>
            <span className="stat-value">{totalVotes}</span>
          </div>
          {topPost && (
            <div className="stat-item">
              <span className="stat-label">Top Post</span>
              <span className="stat-value">{topPost.votes} votes</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
