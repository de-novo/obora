import { useState } from 'react';
import { Community, Post } from './types';
import { seedPosts } from './data/seed';
import { Sidebar } from './components/Sidebar';
import { Feed } from './components/Feed';
import { RightRail } from './components/RightRail';
import { CreatePostModal } from './components/CreatePostModal';

export function App() {
  const [activeCommunity, setActiveCommunity] = useState<Community>('All');
  const [posts, setPosts] = useState<Post[]>(seedPosts);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCreatePost = (postData: Omit<Post, 'id' | 'author' | 'timestamp' | 'votes' | 'userVote'>) => {
    const newPost: Post = {
      ...postData,
      id: Date.now().toString(),
      author: 'you',
      timestamp: new Date(),
      votes: 0,
      userVote: null,
    };
    setPosts([newPost, ...posts]);
  };

  const handleVote = (postId: string, direction: 'up' | 'down') => {
    setPosts((prev) =>
      prev.map((post) => {
        if (post.id !== postId) return post;

        const currentVote = post.userVote;
        let newVotes = post.votes;
        let newUserVote: 'up' | 'down' | null = direction;

        if (currentVote === direction) {
          // Remove vote (toggle off)
          newUserVote = null;
          newVotes = direction === 'up' ? post.votes - 1 : post.votes + 1;
        } else if (currentVote && currentVote !== direction) {
          // Switch vote direction
          newVotes = direction === 'up' ? post.votes + 2 : post.votes - 2;
        } else {
          // New vote
          newVotes = direction === 'up' ? post.votes + 1 : post.votes - 1;
        }

        return { ...post, votes: newVotes, userVote: newUserVote };
      })
    );
  };

  return (
    <div className="app-container">
      <Sidebar
        activeCommunity={activeCommunity}
        onSelectCommunity={setActiveCommunity}
      />
      <Feed
        posts={posts}
        activeCommunity={activeCommunity}
        onCreatePost={() => setIsModalOpen(true)}
        onVote={handleVote}
      />
      <RightRail posts={posts} />
      <CreatePostModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreatePost}
      />
    </div>
  );
}
