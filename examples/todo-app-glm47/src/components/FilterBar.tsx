/**
 * FilterBar Component
 * 
 * Filter controls for todo list (All/Active/Completed).
 * 
 * Based on: docs/10-architecture.md (Section 5.1.3)
 * Features:
 * - Tab-style filter buttons with ARIA tablist pattern
 * - Visual active state indication
 * - Full keyboard navigation
 * - Screen reader friendly labels
 * - Display of todo counts
 */

import React from 'react';
import { Filter, FilteredTodos } from '../types/todo';

interface FilterBarProps {
  /** Current filter state */
  filter: Filter;
  
  /** Change filter handler */
  onFilterChange: (filter: Filter) => void;
  
  /** Filtered todo counts */
  counts: FilteredTodos;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filter,
  onFilterChange,
  counts,
}) => {
  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: '전체', count: counts.all },
    { key: 'active', label: '진행 중', count: counts.active },
    { key: 'completed', label: '완료', count: counts.completed },
  ];

  return (
    <div className="filter-bar" role="group" aria-label="태스크 필터">
      {/* Filter Tabs */}
      <div
        className="filter-tabs"
        role="tablist"
        aria-label="태스크 목록 필터링"
      >
        {filters.map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            aria-controls="todo-list"
            onClick={() => onFilterChange(key)}
            className={`filter-tab ${filter === key ? 'filter-tab-active' : ''}`}
            tabIndex={filter === key ? 0 : -1}
          >
            <span className="filter-tab-label">{label}</span>
            <span className="filter-tab-count" aria-hidden="true">
              {count}
            </span>
          </button>
        ))}
      </div>
      
      {/* Status Summary (Screen Reader Only) */}
      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      >
        현재 {filter === 'all' ? '전체' : filter === 'active' ? '진행 중' : '완료'}{' '}
        태스크 {counts.todos.length}개 표시 중 (전체 {counts.all}개)
      </div>
    </div>
  );
};
