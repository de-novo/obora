/**
 * TodoApp Component
 * 
 * Main application component for the TODO app.
 * 
 * Based on: docs/10-architecture.md (Section 5)
 * Features:
 * - Uses flux-style TodoStore as single source of truth
 * - Korean localization throughout
 * - Filter controls for todo views
 * - Clear completed functionality
 * - Full WCAG 2.1 AA accessibility
 */

import React from 'react';
import { useTodoStore } from '../store/todoStore';
import type { Filter } from '../types/todo';
import AddTodo from './AddTodo';
import TodoList from './TodoList';
import FilterBar from './FilterBar';

const TodoApp: React.FC = () => {
  const { todos, filter, setFilter, clearCompleted, filteredTodos } = useTodoStore();

  const activeCount = filteredTodos.active;
  const completedCount = filteredTodos.completed;
  const hasCompleted = completedCount > 0;

  const handleFilterChange = (newFilter: Filter) => {
    setFilter(newFilter);
  };

  return (
    <div className="todo-app" role="application" aria-label="태스크 관리 애플리케이션">
      <header className="todo-app__header">
        <h1 className="todo-app__title">태스크</h1>
      </header>

      <main className="todo-app__main">
        {todos.length === 0 ? (
          <div className="todo-app__empty" aria-live="polite">
            <p>아직 태스크가 없습니다. 위에서 추가하세요!</p>
          </div>
        ) : (
          <>
            <AddTodo />
            <TodoList />
            
            {todos.length > 0 && (
              <footer className="todo-app__footer">
                <div className="todo-app__counts">
                  <span aria-live="polite" aria-atomic="true">
                    {activeCount}개 남음
                  </span>
                </div>

                <FilterBar
                  filter={filter}
                  onFilterChange={handleFilterChange}
                  counts={filteredTodos}
                />

                {hasCompleted && (
                  <button
                    type="button"
                    className="todo-app__clear-btn"
                    onClick={clearCompleted}
                    aria-label={`완료된 태스크 ${completedCount}개 삭제`}
                  >
                    완료된 항목 지우기
                  </button>
                )}
              </footer>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default TodoApp;
