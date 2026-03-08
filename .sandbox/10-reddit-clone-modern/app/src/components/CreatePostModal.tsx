import { useState, useEffect } from 'react';
import { CommunityFilter } from '../types';
import { communityFilters } from '../data/seed';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, body: string, community: CommunityFilter) => void;
}

export function CreatePostModal({ isOpen, onClose, onSubmit }: CreatePostModalProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [community, setCommunity] = useState<CommunityFilter>('All');

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setBody('');
      setCommunity('All');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || community === 'All') return;
    onSubmit(title.trim(), body.trim(), community);
    onClose();
  };

  const canSubmit = title.trim().length > 0 && community !== 'All';

  return (
    <div className="modal-overlay" onClick={onClose} data-testid="create-post-modal">
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Create a post</h2>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
            </svg>
          </button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="community-select" className="form-label">
              Choose a community
            </label>
            <select
              id="community-select"
              className="form-select"
              value={community}
              onChange={(e) => setCommunity(e.target.value as CommunityFilter)}
              data-testid="post-community-select"
            >
              <option value="All">Select a community</option>
              {communityFilters
                .filter((c) => c !== 'All')
                .map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="title-input" className="form-label">
              Title
            </label>
            <input
              id="title-input"
              type="text"
              className="form-input"
              placeholder="An interesting title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
              data-testid="post-title-input"
            />
            <span className="form-counter">{title.length}/300</span>
          </div>
          <div className="form-group">
            <label htmlFor="body-input" className="form-label">
              Body (optional)
            </label>
            <textarea
              id="body-input"
              className="form-textarea"
              placeholder="What's on your mind?"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              data-testid="post-body-input"
            />
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="modal-button secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="modal-button primary"
              disabled={!canSubmit}
              data-testid="submit-post-button"
            >
              Post
            </button>
          </div>
        </form>
        <style>{`
          .modal-overlay {
            position: fixed;
            inset: 0;
            background-color: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 20px;
            animation: fadeIn 0.2s ease;
          }

          .modal-container {
            background-color: var(--color-bg-secondary);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            width: 100%;
            max-width: 540px;
            max-height: 90vh;
            overflow: hidden;
            animation: slideIn 0.2s ease;
          }

          .modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 20px;
            border-bottom: 1px solid var(--color-border-subtle);
            background-color: var(--color-bg-tertiary);
          }

          .modal-title {
            font-size: 18px;
            font-weight: 700;
            color: var(--color-text-primary);
          }

          .modal-close {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: 4px;
            color: var(--color-text-secondary);
            transition: background-color var(--transition-fast);
          }

          .modal-close:hover {
            background-color: var(--color-bg-hover);
          }

          .modal-body {
            display: flex;
            flex-direction: column;
            gap: 20px;
            padding: 20px;
            max-height: calc(90vh - 140px);
            overflow-y: auto;
          }

          .form-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
            position: relative;
          }

          .form-label {
            font-size: 12px;
            font-weight: 600;
            color: var(--color-text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .form-select,
          .form-input,
          .form-textarea {
            padding: 12px;
            background-color: var(--color-bg-primary);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-sm);
            color: var(--color-text-primary);
            font-size: 14px;
            transition: border-color var(--transition-fast);
          }

          .form-select:focus,
          .form-input:focus,
          .form-textarea:focus {
            border-color: var(--color-accent-secondary);
            outline: none;
          }

          .form-select {
            cursor: pointer;
          }

          .form-textarea {
            resize: vertical;
            min-height: 120px;
          }

          .form-counter {
            position: absolute;
            right: 0;
            bottom: -20px;
            font-size: 11px;
            color: var(--color-text-muted);
          }

          .modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            padding-top: 12px;
            border-top: 1px solid var(--color-border-subtle);
          }

          .modal-button {
            padding: 8px 24px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            transition: all var(--transition-fast);
          }

          .modal-button.secondary {
            color: var(--color-text-primary);
            background-color: var(--color-bg-tertiary);
          }

          .modal-button.secondary:hover {
            background-color: var(--color-bg-hover);
          }

          .modal-button.primary {
            color: #fff;
            background-color: var(--color-text-primary);
          }

          .modal-button.primary:hover:not(:disabled) {
            background-color: var(--color-text-secondary);
          }

          .modal-button.primary:disabled {
            opacity: 0.3;
            cursor: not-allowed;
          }

          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          @keyframes slideIn {
            from {
              opacity: 0;
              transform: scale(0.95);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
        `}</style>
      </div>
    </div>
  );
}
