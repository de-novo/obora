import { useState } from 'react'
import type { Community } from '../data/seed'
import { COMMUNITIES } from '../data/seed'

interface CreatePostModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (title: string, body: string, category: Community) => void
}

export default function CreatePostModal({ isOpen, onClose, onSubmit }: CreatePostModalProps) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState<Community>('r/startups')

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (title.trim() && body.trim()) {
      onSubmit(title.trim(), body.trim(), category)
      setTitle('')
      setBody('')
      setCategory('r/startups')
    }
  }

  return (
    <div className="modal-overlay" data-testid="create-post-modal">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Create Post</h2>
          <button onClick={onClose} className="close-button" aria-label="Close modal">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="post-community">Community</label>
            <select
              id="post-community"
              data-testid="post-community-select"
              value={category}
              onChange={(e) => setCategory(e.target.value as Community)}
            >
              {COMMUNITIES.filter((c) => c !== 'All').map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="post-title">Title</label>
            <input
              id="post-title"
              data-testid="post-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter post title"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="post-body">Body</label>
            <textarea
              id="post-body"
              data-testid="post-body-input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What's on your mind?"
              rows={6}
              required
            />
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="button secondary">
              Cancel
            </button>
            <button type="submit" data-testid="submit-post-button" className="button primary">
              Post
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
