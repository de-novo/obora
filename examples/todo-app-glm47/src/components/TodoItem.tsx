/**
 * TodoItem Component
 * 
 * Individual todo item with toggle, edit, and delete functionality.
 * 
 * Based on: docs/10-architecture.md (Section 5.1.2)
 * Features:
 * - Checkbox for completion toggle
 * - Double-click to edit with inline input
 * - Delete button with proper ARIA labels
 * - Keyboard support (Enter to save, Escape to cancel)
 * - Full WCAG 2.1 AA accessibility
 */

import React, { useState, useRef, useEffect } from 'react';
import { Todo } from '../types/todo';
import { useTodoStore } from '../store/todoStore';

interface TodoItemProps {
  /** Todo item data */
  todo: Todo;
}

const TodoItem: React.FC<TodoItemProps> = ({ todo }) => {
  const { toggleTodo, deleteTodo, updateTodoText } = useTodoStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(todo.text);
  const [error, setError] = useState<string>('');
  
  const editInputRef = useRef<HTMLInputElement>(null);

  // Focus edit input when editing mode starts
  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  // Handle double-click to enter edit mode
  const handleDoubleClick = (): void => {
    setIsEditing(true);
    setEditText(todo.text);
    setError('');
  };

  // Handle save on blur
  const handleBlur = (): void => {
    if (isEditing) {
      handleSave();
    }
  };

  // Handle keyboard events in edit mode
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  // Save changes
  const handleSave = (): void => {
    const trimmedText = editText.trim();
    
    // Validate input
    if (!trimmedText) {
      setError('태스크 내용을 입력해주세요.');
      return;
    }
    
    if (trimmedText.length > 1000) {
      setError('태스크 내용은 1000자 이하여야 합니다.');
      return;
    }
    
    updateTodoText(todo.id, trimmedText);
    setIsEditing(false);
    setError('');
  };

  // Cancel edit
  const handleCancel = (): void => {
    setEditText(todo.text);
    setIsEditing(false);
    setError('');
  };

  // Handle checkbox toggle
  const handleToggle = (): void => {
    toggleTodo(todo.id);
  };

  // Handle delete
  const handleDelete = (): void => {
    deleteTodo(todo.id);
  };

  return (
    <li
      className={`todo-item ${todo.completed ? 'completed' : ''} ${isEditing ? 'editing' : ''}`}
      role="listitem"
      aria-label={todo.completed ? `완료된 태스크: ${todo.text}` : `태스크: ${todo.text}`}
    >
      <div className="todo-item-content">
        {/* Toggle Checkbox */}
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={handleToggle}
          className="todo-checkbox"
          aria-label={todo.completed ? '완료 취소' : '완료로 표시'}
        />
        
        {/* Todo Text / Edit Input */}
        {isEditing ? (
          <div className="todo-edit-container">
            <input
              ref={editInputRef}
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              className="todo-edit-input"
              aria-label="태스크 내용 수정"
              aria-invalid={error !== undefined}
              aria-describedby={error ? `edit-error-${todo.id}` : undefined}
              maxLength={1000}
            />
            {error && (
              <span
                id={`edit-error-${todo.id}`}
                className="edit-error"
                role="alert"
                aria-live="polite"
              >
                {error}
              </span>
            )}
          </div>
        ) : (
          <span
            className="todo-text"
            onDoubleClick={handleDoubleClick}
            title="더블클릭하여 수정"
            tabIndex={0}
            role="button"
            aria-label={`${todo.text} (더블클릭하여 수정)`}
          >
            {todo.text}
          </span>
        )}
        
        {/* Delete Button */}
        <button
          type="button"
          onClick={handleDelete}
          className="todo-delete-button"
          aria-label={`"${todo.text}" 삭제`}
          title="삭제"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>
      </div>
    </li>
  );
};

export default TodoItem;
