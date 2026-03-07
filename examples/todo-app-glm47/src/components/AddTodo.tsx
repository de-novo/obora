/**
 * AddTodo Component
 * 
 * Form component for adding new todo items.
 * 
 * Based on: docs/10-architecture.md (Section 5.1.1)
 * Features:
 * - Text input with validation (max 1000 characters)
 * - Submit button with keyboard support
 * - Error handling with ARIA alerts
 * - Auto-focus on mount
 * - Character counter for user feedback
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTodoStore } from '../store/todoStore';

export const AddTodo: React.FC = () => {
  const addTodo = useTodoStore((state) => state.addTodo);
  const [text, setText] = useState('');
  const [error, setError] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Handle text change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setText(e.target.value);
    if (error) {
      setError('');
    }
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    
    const trimmedText = text.trim();
    
    // Validate input
    if (!trimmedText) {
      setError('태스크 내용을 입력해주세요.');
      if (inputRef.current) {
        inputRef.current.focus();
      }
      return;
    }
    
    if (trimmedText.length > 1000) {
      setError('태스크 내용은 1000자 이하여야 합니다.');
      if (inputRef.current) {
        inputRef.current.focus();
      }
      return;
    }
    
    // Submit and reset
    addTodo(trimmedText);
    setText('');
    setError('');
  };

  // Handle keyboard shortcuts (Ctrl+Enter or Cmd+Enter to submit)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (formRef.current) {
        formRef.current.requestSubmit();
      }
    }
  };

  const characterCount = text.length;
  const isNearLimit = characterCount > 900;
  const isAtLimit = characterCount >= 1000;
  const remainingChars = 1000 - characterCount;

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="add-todo-form"
      noValidate
      aria-label="새 태스크 추가"
    >
      <div className="add-todo-container">
        <div className="add-todo-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="새 태스크 추가..."
            className={`add-todo-input ${
              error ? 'add-todo-input-error' : ''
            } ${isNearLimit && !isAtLimit ? 'add-todo-input-warning' : ''} ${
              isAtLimit ? 'add-todo-input-limit' : ''
            }`}
            aria-label="태스크 내용 입력"
            aria-invalid={error !== undefined}
            aria-describedby={
              error ? 'add-todo-error' : 'add-todo-help'
            }
            aria-required="true"
            maxLength={1000}
            autoComplete="off"
          />
          
          {/* Character Counter */}
          <span
            className={`character-counter ${
              isNearLimit ? 'warning' : ''
            } ${isAtLimit ? 'limit' : ''}`}
            aria-label={`현재 ${characterCount}자, 최대 1000자`}
            aria-hidden="true"
          >
            {isAtLimit ? '0' : remainingChars}
          </span>
        </div>
        
        <button
          type="submit"
          disabled={!text.trim() || text.trim().length > 1000}
          className="add-todo-button"
          aria-label="태스크 추가"
          title={text.trim() ? '추가 (Ctrl+Enter)' : '태스크를 입력하세요'}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="button-text">추가</span>
        </button>
      </div>
      
      {/* Error Message */}
      {error && (
        <div
          id="add-todo-error"
          className="add-todo-error"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}
      
      {/* Help Text */}
      {!error && (
        <div
          id="add-todo-help"
          className="add-todo-help"
          aria-live="polite"
        >
          최대 1000자까지 입력 가능합니다. Ctrl+Enter로 빠르게 추가할 수 있습니다.
        </div>
      )}
    </form>
  );
};
