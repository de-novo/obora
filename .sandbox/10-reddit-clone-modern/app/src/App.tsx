import { useState, useMemo, useEffect } from 'react';
import { Post, CommunityFilter } from './types';
import { initialPosts, communityFilters } from './data/seed';
import { Sidebar } from './components/Sidebar';
import { Feed } from './components/Feed';
import { RightRail } from './components/RightRail';
import { CreatePostModal } from './components/CreatePostModal';

function App() {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [filter, setFilter] = useState<CommunityFilter>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const communityParam = params.get('community');
    if (communityParam && communityFilters.includes(communityParam as CommunityFilter)) {
      setFilter(communityParam as CommunityFilter);
    }
  }, []);

  const handleVote = (postId: string, voteValue: 1 | -1 | 0) => {
    setPosts((prevPosts) =>
      prevPosts.map((post) => {
        if (post.id !== postId) return post;

        const previousVote = post.userVote || 0;
        const voteDiff = voteValue - previousVote;

        return {
          ...post,
          votes: post.votes + voteDiff,
          userVote: voteValue as 1 | -1 | 0,
        };
      })
    );
  };

  const handleCreatePost = (title: string, body: string, community: CommunityFilter) => {
    const newPost: Post = {
      id: String(Date.now()),
      title,
      body,
      community,
      author: 'anonymous_user',
      createdAt: 'Just now',
      votes: 1,
      userVote: 1,
      commentCount: 0,
    };

    setPosts((prevPosts) => [newPost, ...prevPosts]);
  };

  const handleFilterChange = (newFilter: CommunityFilter) => {
    setFilter(newFilter);
    const url = new URL(window.location.href);
    if (newFilter === 'All') {
      url.searchParams.delete('community');
    } else {
      url.searchParams.set('community', newFilter);
    }
    window.history.replaceState({}, '', url.toString());
  };

  const filteredPostsCount = useMemo(() => {
    return filter === 'All'
      ? posts.length
      : posts.filter((post) => post.community === filter).length;
  }, [posts, filter]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="currentColor">
              <circle cx="16" cy="16" r="14" fill="#FF4500" />
              <circle cx="11" cy="13" r="3" fill="#fff" />
              <circle cx="21" cy="13" r="3" fill="#fff" />
              <path
                d="M10 21c0 0 2 3 6 3s6-3 6-3"
                stroke="#fff"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
            <span className="logo-text">reddit</span>
          </div>
        </div>
        <div className="header-center">
          <div className="search-bar">
            <svg
              className="search-icon"
              width="18"
              height="18"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                clipRule="evenodd"
              />
            </svg>
            <input
              type="text"
              placeholder="Search Reddit"
              className="search-input"
            />
          </div>
        </div>
        <div className="header-right">
          <button
            className="create-post-button"
            onClick={() => setIsModalOpen(true)}
            data-testid="create-post-button"
          >
            Create Post
          </button>
        </div>
      </header>

      <div className="community-filter-bar">
        <div className="filter-container">
          {communityFilters.map((community) => (
            <button
              key={community}
              className={`community-pill ${filter === community ? 'active' : ''}`}
              onClick={() => handleFilterChange(community)}
              data-testid="community-pill"
              data-community={community}
            >
              {community}
            </button>
          ))}
        </div>
      </div>

      <div className="app-layout">
        <Sidebar activeCommunity={filter === 'All' ? '' : filter} />
        <Feed posts={posts} filter={filter} onVote={handleVote} />
        <RightRail />
      </div>

      <CreatePostModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreatePost}
      />

      <style>{`
        .app {
          min-height: 100vh;
          background-color: var(--color-bg-primary);
        }

        .app-header {
          position: sticky;
          top: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 20px;
          background-color: var(--color-bg-secondary);
          border-bottom: 1px solid var(--color-border);
        }

        .header-left {
          display: flex;
          align-items: center;
          min-width: 200px;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
        }

        .logo-text {
          font-size: 20px;
          font-weight: 700;
          color: #fff;
        }

        .header-center {
          flex: 1;
          display: flex;
          justify-content: center;
          max-width: 600px;
          margin: 0 20px;
        }

        .search-bar {
          display: flex;
          align-items: center;
          width: 100%;
          gap: 12px;
          padding: 8px 16px;
          background-color: var(--color-bg-primary);
          border: 1px solid var(--color-border);
          border-radius: 20px;
          transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
        }

        .search-bar:focus-within {
          border-color: var(--color-text-secondary);
          box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.1);
        }

        .search-icon {
          color: var(--color-text-muted);
          flex-shrink: 0;
        }

        .search-input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          color: var(--color-text-primary);
          font-size: 14px;
        }

        .search-input::placeholder {
          color: var(--color-text-muted);
        }

        .header-right {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          min-width: 200px;
        }

        .create-post-button {
          padding: 8px 20px;
          background-color: var(--color-text-primary);
          color: var(--color-bg-primary);
          font-weight: 600;
          font-size: 14px;
          border-radius: 20px;
          transition: all var(--transition-fast);
        }

        .create-post-button:hover {
          background-color: var(--color-text-secondary);
        }

        .community-filter-bar {
          position: sticky;
          top: 57px;
          z-index: 99;
          background-color: var(--color-bg-primary);
          border-bottom: 1px solid var(--color-border-subtle);
          padding: 12px 0;
        }

        .filter-container {
          display: flex;
          gap: 8px;
          padding: 0 20px;
          overflow-x: auto;
          scrollbar-width: none;
        }

        .filter-container::-webkit-scrollbar {
          display: none;
        }

        .community-pill {
          padding: 8px 16px;
          background-color: var(--color-bg-secondary);
          color: var(--color-text-secondary);
          font-size: 14px;
          font-weight: 500;
          border-radius: 20px;
          white-space: nowrap;
          transition: all var(--transition-fast);
        }

        .community-pill:hover {
          background-color: var(--color-bg-hover);
          color: var(--color-text-primary);
        }

        .community-pill.active {
          background-color: var(--color-text-primary);
          color: var(--color-bg-primary);
        }

        .app-layout {
          display: grid;
          grid-template-columns: 272px 1fr 312px;
          gap: 24px;
          padding: 20px;
          max-width: 1400px;
          margin: 0 auto;
        }

        @media (max-width: 1200px) {
          .app-layout {
            grid-template-columns: 1fr 312px;
            padding: 16px;
          }
        }

        @media (max-width: 768px) {
          .app-header {
            padding: 8px 12px;
          }

          .header-left,
          .header-right {
            min-width: auto;
          }

          .logo-text {
            display: none;
          }

          .header-center {
            margin: 0 8px;
          }

          .app-layout {
            grid-template-columns: 1fr;
            padding: 12px;
            gap: 16px;
          }

          .create-post-button {
            padding: 8px 16px;
            font-size: 13px;
          }
        }
      `}</style>
    </div>
  );
}

export default App;
