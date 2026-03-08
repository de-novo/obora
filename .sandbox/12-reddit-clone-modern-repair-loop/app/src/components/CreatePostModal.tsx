import { useState, useEffect } from 'react';
import { Community, CreatePostForm, Post } from '../types';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (post: Omit<Post, 'id' | 'author' | 'timestamp' | 'votes' | 'userVote'>) => void;
}

const COMMUNITIES: Community[] = ['r/designcrit', 'r/startups', 'r/webdev', 'r/sideproject'];

export function CreatePostModal({ isOpen, onClose, onSubmit }: CreatePostModalProps) {
  const [form, setForm] = useState<CreatePostForm>({
    community: 'r/webdev',
    title: '',
    body: '',
  });

  useEffect(() => {
    if (!isOpen) {
      setForm({ community: 'r/webdev', title: '', body: '' });
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.title.trim() && form.body.trim()) {
      onSubmit({
        title: form.title.trim(),
        body: form.body.trim(),
        community: form.community,
      });
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" data-testid="create-post-modal">
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2 className="modal-title">Create a Post</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="community" className="form-label">
                Community
              </label>
              <select
                id="community"
                className="form-select"
                value={form.community}
                onChange={(e) => setForm({ ...form, community: e.target.value as Community })}
                data-testid="post-community-select"
              >
                {COMMUNITIES.map((community) => (
                  <option key={community} value={community}>
                    {community}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="title" className="form-label">
                Title
              </label>
              <input
                type="text"
                id="title"
                className="form-input"
                placeholder="An interesting title..."
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                data-testid="post-title-input"
                maxLength={300}
              />
            </div>
            <div className="form-group">
              <label htmlFor="body" className="form-label">
                Content
              </label>
              <textarea
                id="body"
                className="form-textarea"
                placeholder="What's on your mind?"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                data-testid="post-body-input"
                maxLength={4000}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!form.title.trim() || !form.body.trim()}
              data-testid="submit-post-button"
            >
              Post
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
