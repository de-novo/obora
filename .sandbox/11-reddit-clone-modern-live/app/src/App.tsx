import { useState, useMemo } from 'react'
import { SEED_POSTS } from './data/seed'
import type { Post, FilterState } from './types'
import type { Community } from './data/seed'
import { initialFilterState } from './types'
import Sidebar from './components/Sidebar'
import Feed from './components/Feed'
import RightRail from './components/RightRail'
import CreatePostModal from './components/CreatePostModal'

export default function App() {
  const [posts, setPosts] = useState<Post[]>([...SEED_POSTS])
  const [filters, setFilters] = useState<FilterState>(initialFilterState)
  const [userVotes, setUserVotes] = useState<Record<string, 1 | -1 | 0>>({})
  const [isModalOpen, setIsModalOpen] = useState(false)

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const matchesCategory = !filters.category || post.category === filters.category
      const matchesSearch =
        !filters.search ||
        post.title.toLowerCase().includes(filters.search.toLowerCase()) ||
        post.body.toLowerCase().includes(filters.search.toLowerCase())
      const matchesTags =
        filters.tags.length === 0 || filters.tags.some((tag) => post.tags.includes(tag))
      return matchesCategory && matchesSearch && matchesTags
    })
  }, [posts, filters])

  const handleVote = (postId: string, direction: 1 | -1 | 0) => {
    setUserVotes((prev) => {
      const currentVote = prev[postId] ?? 0
      const newVote = direction

      setPosts((prevPosts) =>
        prevPosts.map((post) => {
          if (post.id !== postId) return post

          const updatedPost = { ...post }
          if (currentVote === 1) {
            updatedPost.upvotes--
          } else if (currentVote === -1) {
            updatedPost.downvotes--
          }

          if (newVote === 1) {
            updatedPost.upvotes++
          } else if (newVote === -1) {
            updatedPost.downvotes++
          }

          return updatedPost
        })
      )

      return { ...prev, [postId]: newVote }
    })
  }

  const handleCreatePost = (title: string, body: string, category: Community) => {
    const newPost: Post = {
      id: String(Date.now()),
      title,
      body,
      author: {
        id: 'current-user',
        name: 'You',
      },
      category,
      tags: [],
      createdAt: new Date().toISOString(),
      upvotes: 0,
      downvotes: 0,
    }

    setPosts((prev) => [newPost, ...prev])
    setIsModalOpen(false)
  }

  const handleSelectCommunity = (community: Community | null) => {
    setFilters((prev) => ({ ...prev, category: community }))
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Community Hub</h1>
        <button
          data-testid="create-post-button"
          onClick={() => setIsModalOpen(true)}
          className="button primary"
        >
          + Create Post
        </button>
      </header>
      <div className="app-layout">
        <Sidebar selectedCommunity={filters.category} onSelectCommunity={handleSelectCommunity} />
        <Feed posts={filteredPosts} userVotes={userVotes} onVote={handleVote} />
        <RightRail />
      </div>
      <CreatePostModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleCreatePost} />
    </div>
  )
}
