/**
 * Type definitions for TODO Application
 */

export type Filter = 'all' | 'active' | 'completed';

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}

export interface AppState {
  todos: Todo[];
  filter: Filter;
}

export type ActionType =
  | { type: 'ADD_TODO'; payload: { text: string } }
  | { type: 'TOGGLE_TODO'; payload: { id: string } }
  | { type: 'DELETE_TODO'; payload: { id: string } }
  | { type: 'SET_FILTER'; payload: { filter: Filter } }
  | { type: 'SET_TODOS'; payload: { todos: Todo[] } };

export interface AddTodoProps {
  value: string;
  placeholder?: string;
  error: string | null;
  disabled: boolean;
  onAdd: (text: string) => void;
  onChange: (text: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export interface FilterBarProps {
  activeFilter: Filter;
  onFilterChange: (filter: Filter) => void;
  counts?: {
    all: number;
    active: number;
    completed: number;
  };
}

export interface TodoListProps {
  todos: Todo[];
  filter: Filter;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export interface TodoItemProps {
  id: string;
  text: string;
  completed: boolean;
  onToggle: () => void;
  onDelete: () => void;
  index?: number;
}

export interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  dismissible?: boolean;
}

export interface EmptyStateProps {
  message?: string;
  subMessage?: string;
  filter?: Filter;
}

export interface DeleteConfirmDialogProps {
  isOpen: boolean;
  taskText: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface AppLayoutProps {
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg';
}
