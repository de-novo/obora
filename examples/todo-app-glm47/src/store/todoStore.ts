/**
 * Todo Store
 * 
 * Flux-style state management for TODO app
 * 
 * Based on: docs/10-architecture.md (Section 5)
 * - Single source of truth
 * - Unidirectional data flow: Action → State → Render
 * - Immutable state updates
 * - localStorage persistence with debounce
 * - Multi-tab synchronization via storage event
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Todo, TodoState, Filter, FilteredTodos } from '../types/todo';
import { STORAGE_KEYS } from '../types/todo';

// ============================================================================
// Type Definitions
// ============================================================================

type TodoStoreState = TodoState & {
  // Computed
  filteredTodos: FilteredTodos;
  
  // Actions
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  setFilter: (filter: Filter) => void;
  clearCompleted: () => void;
  updateTodoText: (id: string, text: string) => void;
  
  // Reset
  reset: () => void;
};

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate unique ID with timestamp + random suffix
 * 
 * Based on: docs/10-architecture.md (Section 5.3)
 * - Uses timestamp + random suffix to prevent collisions
 * - Returns string type for consistent handling
 */
const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
};

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate todo text input
 * 
 * Based on: docs/10-architecture.md (Section 9.2)
 * - Trim whitespace
 * - Check minimum length (1+ character)
 * - Check maximum length (1000 characters)
 */
export const validateTodoText = (text: string): { valid: boolean; error?: string } => {
  const trimmed = text.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, error: '태스크 내용을 입력해주세요.' };
  }
  
  if (trimmed.length > 1000) {
    return { valid: false, error: '태스크 내용은 1000자 이하여야 합니다.' };
  }
  
  return { valid: true };
};

// ============================================================================
// Filter Logic
// ============================================================================

/**
 * Filter todos based on current filter state
 * 
 * Based on: docs/10-architecture.md (Section 4.3)
 */
const getFilteredTodos = (todos: Todo[], filter: Filter): Todo[] => {
  switch (filter) {
    case 'active':
      return todos.filter((todo) => !todo.completed);
    case 'completed':
      return todos.filter((todo) => todo.completed);
    case 'all':
    default:
      return todos;
  }
};

/**
 * Calculate counts for each filter state
 */
const getTodoCounts = (todos: Todo[]): { all: number; active: number; completed: number } => {
  return {
    all: todos.length,
    active: todos.filter((t) => !t.completed).length,
    completed: todos.filter((t) => t.completed).length,
  };
};

// ============================================================================
// Initial State
// ============================================================================

const initialState: TodoState = {
  todos: [],
  filter: 'all',
};

// ============================================================================
// Store Creation
// ============================================================================

/**
 * Create the todo store with Zustand
 * 
 * Features:
 * - Immutable state updates
 * - localStorage persistence
 * - Computed filteredTodos
 * - Multi-tab sync (via storage event listener)
 */
export const useTodoStore = create<TodoStoreState>()(
  persist(
    (set, get) => ({
      ...initialState,
      
      // Computed: Filtered todos with counts
      get filteredTodos(): FilteredTodos {
        const { todos, filter } = get();
        const filtered = getFilteredTodos(todos, filter);
        const counts = getTodoCounts(todos);
        
        return {
          todos: filtered,
          all: counts.all,
          active: counts.active,
          completed: counts.completed,
        };
      },
      
      // Action: Add new todo
      addTodo: (text: string) => {
        const validation = validateTodoText(text);
        if (!validation.valid) {
          throw new Error(validation.error);
        }
        
        const newTodo: Todo = {
          id: generateId(),
          text: text.trim(),
          completed: false,
        };
        
        set((state) => ({
          todos: [newTodo, ...state.todos],
        }));
      },
      
      // Action: Toggle todo completion
      toggleTodo: (id: string) => {
        set((state) => ({
          todos: state.todos.map((todo) =>
            todo.id === id ? { ...todo, completed: !todo.completed } : todo
          ),
        }));
      },
      
      // Action: Delete todo
      deleteTodo: (id: string) => {
        set((state) => ({
          todos: state.todos.filter((todo) => todo.id !== id),
        }));
      },
      
      // Action: Set filter
      setFilter: (filter: Filter) => {
        set({ filter });
      },
      
      // Action: Clear all completed todos
      clearCompleted: () => {
        set((state) => ({
          todos: state.todos.filter((todo) => !todo.completed),
        }));
      },
      
      // Action: Update todo text (for future edit feature)
      updateTodoText: (id: string, text: string) => {
        const validation = validateTodoText(text);
        if (!validation.valid) {
          throw new Error(validation.error);
        }
        
        set((state) => ({
          todos: state.todos.map((todo) =>
            todo.id === id ? { ...todo, text: text.trim() } : todo
          ),
        }));
      },
      
      // Action: Reset to initial state
      reset: () => {
        set(initialState);
      },
    }),
    {
      name: 'todo-app-storage',
      storage: createJSONStorage(() => localStorage),
      // Store only todos and filter
      partialize: (state) => ({
        todos: state.todos,
        filter: state.filter,
      }),
    }
  )
);

// ============================================================================
// Multi-tab Synchronization
// ============================================================================

/**
 * Set up multi-tab synchronization
 * 
 * Based on: docs/10-architecture.md (Section 13 - Risk Mitigation)
 * - Uses storage event to sync state across tabs
 * - This is REQUIRED (not optional) per architecture decision
 * 
 * Call this once when the app initializes
 */
export const setupMultiTabSync = (): (() => void) => {
  const handleStorageChange = (e: StorageEvent) => {
    // Only react to our own storage changes
    if (e.key === 'todo-app-storage') {
      // Rehydrate store from localStorage
      const stored = localStorage.getItem('todo-app-storage');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Update store state directly to re-render
          const { state } = parsed;
          if (state?.todos && state?.filter !== undefined) {
            useTodoStore.setState({
              todos: state.todos,
              filter: state.filter,
            });
          }
        } catch (error) {
          console.error('Failed to sync from storage event:', error);
        }
      }
    }
  };
  
  window.addEventListener('storage', handleStorageChange);
  
  // Return cleanup function
  return () => {
    window.removeEventListener('storage', handleStorageChange);
  };
};

// ============================================================================
// Selectors (for optimized re-renders)
// ============================================================================

/**
 * Select all todos
 */
export const selectTodos = (state: TodoStoreState) => state.todos;

/**
 * Select current filter
 */
export const selectFilter = (state: TodoStoreState) => state.filter;

/**
 * Select filtered todos with counts
 */
export const selectFilteredTodos = (state: TodoStoreState) => state.filteredTodos;

/**
 * Select todo by ID
 */
export const selectTodoById = (id: string) => (state: TodoStoreState) =>
  state.todos.find((todo) => todo.id === id);

/**
 * Select active todos count
 */
export const selectActiveCount = (state: TodoStoreState) => state.todos.filter((t) => !t.completed).length;

/**
 * Select completed todos count
 */
export const selectCompletedCount = (state: TodoStoreState) => state.todos.filter((t) => t.completed).length;
