/**
 * TODO App Type Definitions
 */

/**
 * Filter type for task filtering
 */
export type Filter = 'all' | 'active' | 'completed';

/**
 * Task/Todo interface
 */
export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}

/**
 * Application state
 */
export interface AppState {
  todos: Todo[];
  filter: Filter;
}

/**
 * Action types for state management
 */
export type Action =
  | { type: 'ADD_TODO'; payload: { text: string } }
  | { type: 'TOGGLE_TODO'; payload: { id: string } }
  | { type: 'DELETE_TODO'; payload: { id: string } }
  | { type: 'SET_FILTER'; payload: { filter: Filter } }
  | { type: 'SET_TODOS'; payload: { todos: Todo[] } };

/**
 * Filter counts
 */
export interface FilterCounts {
  all: number;
  active: number;
  completed: number;
}

/**
 * Event payload types
 */
export type TodoAddEvent = CustomEvent<{ text: string }>;
export type TodoToggleEvent = CustomEvent<{ id: string }>;
export type TodoDeleteEvent = CustomEvent<{ id: string }>;
export type FilterChangeEvent = CustomEvent<{ filter: Filter }>;

/**
 * localStorage keys
 */
export const STORAGE_KEYS = {
  TODOS: 'todo-app-todos',
  FILTER: 'todo-app-filter',
} as const;

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  error: string | null;
}
