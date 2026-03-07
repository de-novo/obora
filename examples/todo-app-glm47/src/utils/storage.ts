/**
 * localStorage utilities for TODO Application
 */

import { AppState, Todo, Filter } from '../types';

const STORAGE_KEYS = {
  TODOS: 'todo-app-todos',
  FILTER: 'todo-app-filter',
} as const;

/**
 * Generate unique ID for a todo item
 * Uses timestamp + random suffix to prevent collisions
 */
export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
};

/**
 * Validate a todo object structure
 */
const isValidTodo = (todo: unknown): todo is Todo => {
  if (typeof todo !== 'object' || todo === null) return false;
  const t = todo as Record<string, unknown>;
  return (
    typeof t.id === 'string' &&
    typeof t.text === 'string' &&
    typeof t.completed === 'boolean' &&
    typeof t.createdAt === 'string'
  );
};

/**
 * Validate filter value
 */
const isValidFilter = (filter: unknown): filter is Filter => {
  return filter === 'all' || filter === 'active' || filter === 'completed';
};

/**
 * Load application state from localStorage
 * Returns default state if storage is unavailable or data is invalid
 */
export const loadFromStorage = (): AppState => {
  try {
    const todosJson = localStorage.getItem(STORAGE_KEYS.TODOS);
    const filter = localStorage.getItem(STORAGE_KEYS.FILTER);

    let todos: Todo[] = [];
    if (todosJson) {
      const parsed = JSON.parse(todosJson);
      if (Array.isArray(parsed)) {
        todos = parsed.filter(isValidTodo);
      }
    }

    const validFilter: Filter = isValidFilter(filter) ? filter : 'all';

    return { todos, filter: validFilter };
  } catch (error) {
    console.error('Failed to load from localStorage:', error);
    return { todos: [], filter: 'all' };
  }
};

/**
 * Save application state to localStorage with debounce
 */
class StorageSaver {
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  save(state: AppState): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEYS.TODOS, JSON.stringify(state.todos));
        localStorage.setItem(STORAGE_KEYS.FILTER, state.filter);
      } catch (error) {
        if (error instanceof Error && error.name === 'QuotaExceededError') {
          console.error('localStorage quota exceeded');
          // Dispatch error event for UI to handle
          window.dispatchEvent(
            new CustomEvent('storage:error', {
              detail: { message: '저장 공간이 부족합니다. 완료된 태스크를 정리해주세요.' },
            })
          );
        } else {
          console.error('Failed to save to localStorage:', error);
        }
      }
    }, 100); // 100ms debounce
  }

  clear(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }
}

export const storageSaver = new StorageSaver();

/**
 * Subscribe to storage events from other tabs
 */
export const subscribeToStorageEvents = (callback: () => void): (() => void) => {
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEYS.TODOS) {
      callback();
    }
  };

  window.addEventListener('storage', handler);

  return () => {
    window.removeEventListener('storage', handler);
  };
};

/**
 * Clear all data from localStorage
 */
export const clearStorage = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEYS.TODOS);
    localStorage.removeItem(STORAGE_KEYS.FILTER);
  } catch (error) {
    console.error('Failed to clear localStorage:', error);
  }
};
