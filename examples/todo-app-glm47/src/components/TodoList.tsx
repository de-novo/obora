/**
 * TodoList Component
 * 
 * Displays a filtered list of todo items.
 * 
 * Based on: docs/10-architecture.md (Section 5.1.2)
 * Features:
 * - Displays filtered todos based on current filter state
 * - Uses the exported TodoItem component (no inline duplication)
 * - Empty state display with aria-live
 * - Full WCAG 2.1 AA accessibility
 */

import React from 'react';
import { useTodoStore } from '../store/todoStore';
import TodoItem from './TodoItem';

const TodoList: React.FC = () => {
  const { filteredTodos } = useTodoStore();
  const { todos, counts } = filteredTodos;

  if (todos.length === 0) {
    return (
      <ul className="todo-list" role="list" aria-live="polite">
        <li className="todo-list__empty">표시할 태스크가 없습니다.</li>
      </ul>
    );
  }

  return (
    <ul
      id="todo-list"
      className="todo-list"
      role="list"
      aria-label={`${counts.active}개 진행 중, ${counts.completed}개 완료된 태스크`}
    >
      {todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </ul>
  );
};

export default TodoList;
